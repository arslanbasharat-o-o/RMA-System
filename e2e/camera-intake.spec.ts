import { test, expect } from "@playwright/test";

const customerId = "11111111-1111-4111-8111-111111111111";
const reasonId = "22222222-2222-4222-8222-222222222222";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/auth/me" ? { user: { name: "Intake Tester", email: "tester@example.test", role: "admin" } }
      : path === "/api/customers" ? { customers: [{ id: customerId, name: "Test Customer", active: true }] }
      : path === "/api/return-reasons" ? { returnReasons: [{ id: reasonId, label: "Return", code: "RETURN" }] }
      : path === "/api/rmas" ? { rma: { id: "test-rma", rmaNumber: "RMA-TEST" } }
      : path === "/api/rmas/test-rma" ? { rma: { id: "test-rma", rmaNumber: "RMA-TEST", customerName: "Test Customer" } }
      : path === "/api/rmas/test-rma/items" ? { item: { id: "test-item", itemNumber: 1 } }
      : path === "/api/rma-items/test-item/upload" ? { success: true, image: { id: "test-image" } }
      : {};
    await route.fulfill({ json: data });
  });
  await page.addInitScript(() => {
    // Synthetic local media: no physical camera, recognition API, or real uploads.
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 720; canvas.height = 960;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.fillStyle = "#303438"; ctx.fillRect(0, 0, 720, 960);
        ctx.fillStyle = "#151719"; ctx.fillRect(200, 85, 320, 790);
        ctx.fillStyle = "#afb6b7"; ctx.fillRect(211, 96, 298, 768);
        ctx.fillStyle = "#465158"; ctx.fillRect(220, 115, 280, 715);
        ctx.fillStyle = "#111"; ctx.fillRect(320, 102, 80, 5);
      };
      draw();
      window.setInterval(draw, 100);
      return canvas.captureStream(10);
    } });
  });
});

test("customer choice is explicit before scanner creation", async ({ page }) => {
  let creates = 0;
  page.on("request", (req) => { if (new URL(req.url()).pathname === "/api/rmas" && req.method() === "POST") creates++; });
  await page.goto("/rmas/new");
  const customer = page.getByLabel("Customer / Business Name");
  await expect(customer).toHaveValue("");
  await expect(page.getByRole("button", { name: "Create RMA & Open Scanner" })).toBeDisabled();
  expect(creates).toBe(0);
  await customer.selectOption(customerId);
  await page.getByRole("button", { name: "Create RMA & Open Scanner" }).click();
  await expect(page).toHaveURL(/test-rma\/capture/);
  expect(creates).toBe(1);
});

test("camera preview, failed upload retry, and progression work without losing photos", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  let uploads = 0;
  let releaseUpload: (() => void) | undefined;
  await page.route("**/api/rma-items/test-item/upload", async (route) => {
    uploads++;
    if (uploads === 1) {
      await new Promise<void>((resolve) => { releaseUpload = resolve; });
      await route.fulfill({ status: 503, json: { error: "Offline test failure" } });
    } else await route.fulfill({ json: { success: true, image: { id: "saved" } } });
  });
  await page.goto("/rmas/test-rma/capture");
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/verification/camera-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByText("Saving photos — keep this page open.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish intake" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next display" })).toBeDisabled();
  await expect.poll(() => Boolean(releaseUpload)).toBe(true);
  releaseUpload!();
  await page.getByRole("button", { name: "Retry photo 1" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Capture back photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Next display" }).click();
  await expect(page.getByText("Display 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Front", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(uploads).toBe(3);
  expect(errors).toEqual([]);
});

test("customerless capture never opens camera or starts upload", async ({ page }) => {
  await page.route("**/api/rmas/test-rma", (route) => route.fulfill({ json: { rma: { rmaNumber: "RMA-TEST", customerName: " " } } }));
  await page.goto("/rmas/test-rma/capture");
  await expect(page.getByRole("alert").filter({ hasText: "Add customer information" })).toContainText("Add customer information");
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Capture/ })).toHaveCount(0);
});

test("camera denial has useful recovery and accessible file upload", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
  });
  await page.goto("/rmas/test-rma/capture");
  await expect(page.getByText("Camera unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try camera again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Photos", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture front photo" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("scanner stays usable on a small phone and in landscape", async ({ page }) => {
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto("/rmas/test-rma/capture");
    await expect(page.getByRole("button", { name: "Photos", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Capture front photo" })).toBeEnabled();
    await page.getByRole("button", { name: "Capture front photo" }).scrollIntoViewIfNeeded();
    expect(await page.getByRole("button", { name: "Capture front photo" }).evaluate((button) => {
      const box = button.getBoundingClientRect();
      return box.bottom <= innerHeight && box.top >= 0;
    })).toBe(true);
  }
});
