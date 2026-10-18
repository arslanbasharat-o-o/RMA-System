import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/api/auth/me" ? { user: { name: "UI Tester", email: "ui@example.test", role: "admin" } }
      : path === "/api/dashboard" ? { kpis: { totalRmas: 0, totalDisplays: 0, processingDisplays: 0, verifiedDisplays: 0, reviewRequiredDisplays: 0 }, recentRmas: [], reviewItems: [] }
      : path === "/api/customers" ? { customers: [{ id: "customer-1", name: "Synthetic Customer", active: true }] }
      : path === "/api/return-reasons" ? { returnReasons: [{ id: "reason-1", label: "Return", code: "RETURN" }] }
      : {};
    await route.fulfill({ json });
  });
});

test("login offers truthful password recovery without sample credentials", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email Address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByText(/Developer Access|Quick Login|password123/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByText(/Contact your team administrator/)).toBeVisible();
  await expect(page.getByText(/reset link sent/i)).toHaveCount(0);
});

test("customer dropdown supports labels, keyboard selection, and native form state", async ({ page }) => {
  await page.goto("/rmas/new");
  const customer = page.getByRole("combobox", { name: /Customer \/ Business Name/ });
  await expect(page.getByRole("button", { name: "Create RMA & Open Scanner" })).toBeDisabled();
  await page.getByText("Customer / Business Name *", { exact: true }).click();
  await expect(customer).toBeFocused();
  await customer.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(customer).toContainText("Synthetic Customer");
  await expect(page.locator("#rma-customer-native")).toHaveValue("customer-1");
  await expect(page.getByRole("button", { name: "Create RMA & Open Scanner" })).toBeEnabled();
  await customer.click();
  await page.keyboard.press("Escape");
  await expect(customer).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("saved desktop sidebar state hydrates without console errors", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop sidebar persistence");
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).first().click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true }).first()).toBeVisible();
  await expect.poll(() => page.locator("aside").evaluate(el => el.getBoundingClientRect().width)).toBe(64);
  expect(errors.filter(error => /hydration|didn't match|server rendered/i.test(error))).toEqual([]);
  await page.screenshot({ path: `.local/verification/dashboard-${testInfo.project.name}.png`, fullPage: true });
});

test("desktop has one sidebar toggle and mobile keeps its navigation drawer", async ({ page }, testInfo) => {
  await page.goto("/dashboard");

  if (testInfo.project.name === "mobile-chrome" || testInfo.project.name === "mobile-safari") {
    await expect(page.getByRole("button", { name: "Toggle navigation menu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse sidebar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Toggle navigation menu" }).click();
    await expect(page.getByRole("dialog", { name: "Mobile Navigation Drawer" })).toBeVisible();
    return;
  }

  const collapse = page.getByRole("button", { name: "Collapse sidebar", exact: true });
  await expect(collapse).toHaveCount(1);
  await collapse.click();

  const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
  await expect(expand).toHaveCount(1);
  await expect(page.getByRole("link", { name: "RMA Operations", exact: true })).toBeVisible();
  await expand.click();
  await expect(page.getByRole("button", { name: "Collapse sidebar", exact: true })).toHaveCount(1);
});

test("review shortcuts ignore dropdown typing and submit once while pending", async ({ page }) => {
  let writes = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/dashboard", route => route.fulfill({ json: { reviewItems: [{ id: "review-ui", itemNumber: 1, rmaNumber: "RMA-MOCK", status: "review_required", predictedModel: "iPhone 16 Pro", predictedManufacturer: "Apple" }] } }));
  await page.route("**/api/display-catalog", route => route.fulfill({ json: { catalog: Array.from({ length: 12 }, (_, i) => ({ id: `model-${i}`, manufacturer: "Apple", model: `Model ${i}`, displayAssembly: `Apple Model ${i}` })) } }));
  await page.route("**/api/rma-items/review-ui/review", async route => {
    writes++;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { success: true } });
  });
  await page.goto("/review-queue");
  await page.getByRole("combobox", { name: "Select Different Model:" }).click();
  const search = page.getByRole("combobox", { name: "Search options..." });
  await search.fill("y");
  expect(writes).toBe(0);
  await page.keyboard.press("Escape");
  await page.locator("h1").click();
  await page.keyboard.press("y");
  await page.keyboard.press("y");
  await expect.poll(() => writes).toBe(1);
  release!();
  await expect(page.getByText("Queue clear", { exact: true })).toBeVisible();
});

test("search matches customer names and contacts instead of stored IDs", async ({ page }) => {
  await page.route("**/api/customers", route => route.fulfill({ json: { customers: Array.from({ length: 10 }, (_, i) => ({ id: `customer-${i}`, name: `Customer ${i}`, contactName: `Contact ${i}`, active: true })) } }));
  await page.goto("/rmas/new");
  await page.getByRole("combobox", { name: /Customer \/ Business Name/ }).click();
  await page.getByRole("combobox", { name: "Search options..." }).fill("Contact 8");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("option", { name: "Customer 8 (Contact 8)", exact: true }).click();
  await expect(page.locator("#rma-customer-native")).toHaveValue("customer-8");
  await expect(page.locator('#rma-customer-native option[value="customer-8"]')).toHaveText("Customer 8 (Contact 8)");
  await expect(page.getByRole("button", { name: "Create RMA & Open Scanner" })).toBeEnabled();
});

test("dashboard model totals are labeled as verified and fit common screen widths", async ({ page }) => {
  await page.route("**/api/dashboard", route => route.fulfill({ json: {
    kpis: {
      totalRmas: 1,
      totalDisplays: 1,
      verifiedDisplays: 1,
      reviewDisplays: 0,
      processingDisplays: 0,
      failedDisplays: 0,
      verificationRate: 100,
      trends: {},
    },
    modelBreakdown: [{ model: "iPhone 11", count: 1 }],
    vendorBreakdown: [],
    reasonBreakdown: [],
    recentRmas: [],
    reviewItems: [],
  } }));

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Verified Models" })).toBeVisible();
    await expect(page.getByText("iPhone 11", { exact: true })).toBeVisible();
    await expect(page.getByText("iPhone 14", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("RMA rows distinguish unverified suggestions from unidentified displays", async ({ page }, testInfo) => {
  await page.route("**/api/rmas/test-rma", route => route.fulfill({ json: {
    rma: {
      id: "test-rma",
      rmaNumber: "RMA-TEST-000001",
      status: "receiving",
      customerName: "Synthetic Customer",
      returnReasonLabel: "Defective display",
    },
    items: [
      {
        id: "suggested-item",
        itemNumber: 1,
        status: "review_required",
        matchStatus: "possible_candidate",
        predictedManufacturer: "Apple",
        predictedModel: "iPhone 14",
        predictedDisplayAssembly: "Apple iPhone 14 Display",
        verifiedAt: null,
        images: [],
      },
      {
        id: "unidentified-item",
        itemNumber: 2,
        status: "review_required",
        matchStatus: "ambiguous",
        predictedManufacturer: "Apple",
        predictedModel: null,
        predictedDisplayAssembly: "Unidentified Apple Display",
        verifiedAt: null,
        images: [],
      },
    ],
    stats: { total: 2, verified: 0, reviewRequired: 2, processing: 0, failed: 0 },
  } }));

  await page.goto("/rmas/test-rma");
  await expect(page.getByRole("heading", { name: "RMA-TEST-000001" })).toBeVisible();

  if (testInfo.project.name.startsWith("mobile")) {
    await expect(page.getByText("Suggestion", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Unidentified", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Search evidence did not identify one model/).first()).toBeVisible();
  } else {
    await expect(page.locator("table").getByText("Suggestion", { exact: true })).toBeVisible();
    await expect(page.locator("table").getByText("Unidentified", { exact: true })).toBeVisible();
    await expect(page.locator("table").getByText(/Search evidence did not identify one model/)).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Model Result" })).toBeVisible();
  }
});
