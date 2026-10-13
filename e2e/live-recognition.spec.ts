import { test, expect, Page } from "@playwright/test";

async function mockRecognition(page: Page) {
  const state = { completed: false, visualDone: false, failItem: false, itemReads: 0 };
  const item = () => ({
    id: "live-item", itemNumber: 1,
    status: state.completed ? "review_required" : "processing",
    visualStatus: state.completed || state.visualDone ? "success" : "pending",
    vendorOcrStatus: state.completed ? "success" : "pending",
    predictedManufacturer: state.completed ? "Apple" : null,
    predictedModel: state.completed ? "iPhone 16 Pro" : null,
    predictedDisplayAssembly: state.completed ? "Apple iPhone 16 Pro Display" : null,
    reviewNotes: state.completed ? "Backend evidence updated" : "",
    images: [],
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/rma-items/live-item") {
      state.itemReads++;
      if (state.failItem) return route.fulfill({ status: 503, json: { error: "Synthetic connection interruption" } });
      return route.fulfill({ json: { item: item(), images: [], candidates: [], ocrExtractions: [], reviewHistory: [] } });
    }
    const json = path === "/api/auth/me"
      ? { user: { name: "Mobile QA", email: "qa@example.test", role: "admin" } }
      : path === "/api/rmas/live-rma"
      ? { rma: { id: "live-rma", rmaNumber: "RMA-OFFLINE-QA", customerName: "Synthetic customer", status: "receiving" }, items: [item()], stats: { total: 1, processing: state.completed ? 0 : 1, reviewRequired: state.completed ? 1 : 0 } }
      : path === "/api/display-catalog" ? { catalog: [] }
      : path === "/api/vendors" ? { vendors: [] } : {};
    return route.fulfill({ json });
  });
  return state;
}

test("open inspection updates processing results without erasing an operator correction", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = await mockRecognition(page);
  await page.goto("/rmas/live-rma");
  await page.getByRole("button", { name: /Inspect/ }).click();
  const drawer = page.getByRole("dialog", { name: "Inspection for Display Item #1" });
  await expect(drawer.getByText("Processing", { exact: true })).toBeVisible();
  const notes = drawer.getByPlaceholder("e.g. Verified genuine AMI aftermarket ink stamp");
  await notes.fill("Keep my unsaved correction");
  state.completed = true;
  await expect(drawer.getByText("Apple iPhone 16 Pro Display", { exact: true })).toBeVisible({ timeout: 7000 });
  await expect(notes).toHaveValue("Keep my unsaved correction");
  await expect(drawer.getByText("Processing", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/verification/live-results-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("inspection recovers a failed refresh immediately when the connection resumes", async ({ page }) => {
  const state = await mockRecognition(page);
  await page.goto("/rmas/live-rma");
  await page.getByRole("button", { name: /Inspect/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("status")).toBeVisible();
  state.failItem = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(drawer.getByRole("alert")).toContainText("Connection interrupted");
  state.failItem = false;
  state.completed = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(drawer.getByText("Apple iPhone 16 Pro Display", { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(drawer.getByRole("alert")).toHaveCount(0);
});

test("returning to an idle page revalidates results without waiting for a timer", async ({ page }) => {
  const state = await mockRecognition(page);
  state.completed = true;
  await page.goto("/rmas/live-rma");
  await expect(page.getByText("Apple iPhone 16 Pro Display", { exact: true }).filter({ visible: true })).toBeVisible();
  state.completed = false;
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page.getByText("Analyzing", { exact: true })).toBeVisible({ timeout: 3000 });
});
