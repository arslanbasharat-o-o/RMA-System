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
      : path === "/api/rmas/test-rma/recognition-status" ? { items: [] }
      : path === "/api/rmas/test-rma/items" ? { item: { id: "test-item", itemNumber: 1 } }
      : path === "/api/rma-items/test-item/upload" ? { success: true, image: { id: crypto.randomUUID() } }
      : {};
    await route.fulfill({ json: data });
  });
  await page.addInitScript(() => {
    // Synthetic local media: no physical camera, recognition API, or real uploads.
    // Patch the prototype because WebKit may return a fresh MediaDevices wrapper.
    Object.defineProperty(Object.getPrototypeOf(navigator.mediaDevices), "getUserMedia", { configurable: true, value: async () => {
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

test("scanner shows a completed display result while intake can continue", async ({ page }) => {
  let uploaded = false;
  await page.route("**/api/rmas/test-rma/recognition-status", async (route) => {
    await route.fulfill({ json: { items: uploaded ? [{
      id: "test-item",
      itemNumber: 1,
      status: "review_required",
      predictedModel: "iPhone 14 Plus",
      matchStatus: "ambiguous",
    }] : [] } });
  });
  await page.route("**/api/rma-items/test-item/upload", async (route) => {
    uploaded = true;
    await route.fulfill({ json: { success: true, image: { id: "saved-first-display" } } });
  });
  await page.goto("/rmas/test-rma/capture");
  await expect(page.locator("video")).toBeVisible();
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByText("iPhone 14 Plus")).toBeVisible();
  await expect(page.getByText("Needs review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next display" })).toBeEnabled();
});

test("customer choice is explicit before scanner creation", async ({ page }) => {
  let creates = 0;
  page.on("request", (req) => { if (new URL(req.url()).pathname === "/api/rmas" && req.method() === "POST") creates++; });
  await page.goto("/rmas/new");
  const customer = page.getByLabel("Customer / Business Name");
  await expect(customer).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Create RMA & Open Scanner" })).toBeDisabled();
  expect(creates).toBe(0);
  await customer.click();
  await page.getByRole("option", { name: "Test Customer", exact: true }).click();
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
    } else await route.fulfill({ json: { success: true, image: { id: `saved-${uploads}` } } });
  });
  await page.goto("/rmas/test-rma/capture");
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth), { timeout: 15000 }).toBeGreaterThan(0);
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
  await expect(page.getByRole("button", { name: "Front", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Capture back photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Flex", exact: true }).click();
  await page.getByRole("button", { name: "Capture flex photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Next display" }).click();
  await expect(page.getByText("Display 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Front", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(uploads).toBe(4);
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
    Object.defineProperty(Object.getPrototypeOf(navigator.mediaDevices), "getUserMedia", { configurable: true, value: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
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

test("camera capture keeps the explicitly selected angle", async ({ page }) => {
  const uploadedSides: string[] = [];
  await page.route("**/api/rma-items/test-item/upload", async (route) => {
    const body = route.request().postDataBuffer()!.toString();
    uploadedSides.push(body.match(/name="imageType"\r\n\r\n([^\r]+)/)![1]);
    await route.fulfill({ json: { success: true, image: { id: `photo-${uploadedSides.length}` } } });
  });
  await page.goto("/rmas/test-rma/capture");
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth), { timeout: 15000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Front", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Capture back photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Flex", exact: true }).click();
  await page.getByRole("button", { name: "Capture flex photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(3);
  expect(uploadedSides).toEqual(["primary", "back", "flex_cable"]);
});

test("photo picker preserves the side selected when it opened", async ({ page }) => {
  let uploadedSide = "";
  await page.route("**/api/rma-items/test-item/upload", async (route) => {
    uploadedSide = route.request().postDataBuffer()!.toString().match(/name="imageType"\r\n\r\n([^\r]+)/)![1];
    await route.fulfill({ json: { success: true, image: { id: "picker-photo" } } });
  });
  await page.goto("/rmas/test-rma/capture");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  const chooser = await chooserPromise;
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await chooser.setFiles({ name: "front.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") });
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(1);
  expect(uploadedSide).toBe("primary");
});

test("duplicate upload shows one saved photo with the server side", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/rma-items/test-item/upload", async (route) => {
    uploads++;
    await route.fulfill({ json: { success: true, deduplicated: uploads > 1, image: { id: "same-photo", imageType: "primary" } } });
  });
  await page.goto("/rmas/test-rma/capture");
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth), { timeout: 15000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Capture back photo" }).click();
  await expect.poll(() => uploads).toBe(2);
  await expect(page.getByRole("alert").filter({ hasText: "already saved as Front" })).toBeVisible();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Front angle 1" })).toBeVisible();
});

test("a wrong saved photo can be removed and replaced on the same display", async ({ page }, testInfo) => {
  const deleted: string[] = [];
  await page.route("**/api/rma-items/test-item/images/*", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleted.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: { success: true, itemStatus: "pending_upload" } });
  });
  await page.goto("/rmas/test-rma/capture");
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(1);
  const remove = page.getByRole("button", { name: "Remove photo 1", exact: true });
  await remove.scrollIntoViewIfNeeded();
  const box = await remove.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `.local/verification/remove-photo-${testInfo.project.name}.png`, fullPage: true });
  await remove.click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next display" })).toHaveCount(0);
  await expect(page.getByText("Display 1", { exact: true })).toBeVisible();
  expect(deleted).toHaveLength(1);
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Next display" })).toBeEnabled();
});

test("failed photo removal preserves the saved photo and can be retried", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/rma-items/test-item/images/*", async (route) => {
    attempts++;
    await route.fulfill({ status: attempts === 1 ? 503 : 200, json: attempts === 1
      ? { error: "Photo removal interrupted" } : { success: true, itemStatus: "pending_upload" } });
  });
  await page.goto("/rmas/test-rma/capture");
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Remove photo 1", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Photo removal interrupted" })).toBeVisible();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Remove photo 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove photo 1", exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("completed recognition appears automatically without refresh controls", async ({ page }) => {
  let uploaded = false;
  let completed = false;
  await page.route("**/api/rma-items/test-item/upload", route => {
    uploaded = true;
    return route.fulfill({ json: { success: true, image: { id: "live-photo" } } });
  });
  await page.route("**/api/rmas/test-rma/recognition-status", route => route.fulfill({ json: { items: uploaded ? [{
    id: "test-item", itemNumber: 1, status: completed ? "review_required" : "processing",
    predictedModel: completed ? "iPhone 16 Pro" : null, matchStatus: "unknown",
  }] : [] } }));
  await page.goto("/rmas/test-rma/capture");
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByText("Identifying model…")).toBeVisible();
  completed = true;
  await expect(page.getByText("iPhone 16 Pro", { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(page.getByRole("button", { name: /refresh|retry connection/i })).toHaveCount(0);
});

test("a queued upload retry cannot be removed before the upload finishes", async ({ page }) => {
  let uploads = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/rma-items/test-item/upload", async route => {
    uploads++;
    if (uploads === 1) return route.fulfill({ status: 400, json: { error: "Image rejected" } });
    if (uploads === 2) await new Promise<void>(resolve => { release = resolve; });
    return route.fulfill({ json: { success: true, image: { id: `saved-${uploads}` } } });
  });
  await page.goto("/rmas/test-rma/capture");
  await page.getByRole("button", { name: "Capture front photo" }).click();
  await expect(page.getByRole("button", { name: "Retry photo 1" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Capture back photo" }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole("button", { name: "Retry photo 1" }).click();
  await expect(page.getByRole("button", { name: "Remove photo 1", exact: true })).toBeDisabled();
  release!();
  await expect(page.getByLabel("Photo saved", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Remove photo 1", exact: true })).toBeEnabled();
  expect(uploads).toBe(3);
});

test("mobile resume recovers a suspended request even when fetch ignores abort", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { holdRecognition: boolean; testVisibility: string; recognitionReads: number };
    state.holdRecognition = true;
    state.testVisibility = "visible";
    state.recognitionReads = 0;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state.testVisibility });
    const original = window.fetch.bind(window);
    window.fetch = (...args) => {
      if (String(args[0]).includes("/recognition-status")) {
        state.recognitionReads++;
        if (state.holdRecognition) return new Promise<Response>(() => {});
      }
      return original(...args);
    };
  });
  await page.route("**/api/rmas/test-rma/recognition-status", route => route.fulfill({ json: { items: [{
    id: "test-item", itemNumber: 1, status: "review_required", predictedModel: "Resumed model", matchStatus: "unknown",
  }] } }));
  await page.goto("/rmas/test-rma/capture");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { recognitionReads: number }).recognitionReads)).toBeGreaterThan(0);
  await page.evaluate(() => {
    const state = window as typeof window & { holdRecognition: boolean; testVisibility: string };
    state.testVisibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    state.holdRecognition = false;
    state.testVisibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("Resumed model", { exact: true })).toBeVisible({ timeout: 3000 });
});

test("an idle scanner reconciles newly completed results without focus or reload", async ({ page }) => {
  let completed = false;
  let reads = 0;
  await page.route("**/api/rmas/test-rma/recognition-status", route => {
    reads++;
    return route.fulfill({ json: { items: completed ? [{
      id: "test-item", itemNumber: 1, status: "review_required", predictedModel: "Background result", matchStatus: "unknown",
    }] : [] } });
  });
  await page.clock.install();
  await page.goto("/rmas/test-rma/capture");
  await expect.poll(() => reads).toBeGreaterThan(0);
  await page.waitForTimeout(50);
  completed = true;
  await page.clock.fastForward(16000);
  await expect(page.getByText("Background result", { exact: true })).toBeVisible({ timeout: 3000 });
});
