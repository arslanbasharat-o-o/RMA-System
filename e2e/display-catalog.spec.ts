import { test, expect } from "@playwright/test";
import { E2E_TEST_PASSWORD } from "./credentials";

test.describe("Display Inventory Catalog Management", () => {
  test("loads display catalog, filters variants, and inspects reference details", async ({ page }) => {
    // 1. Sign in as operator
    await page.goto("/login");
    await page.fill('input[type="email"]', "operator@rma-system.internal");
    await page.fill('input[type="password"]', E2E_TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/dashboard/, { waitUntil: "domcontentloaded" });

    // 2. Navigate to Display Catalog
    const catalogLink = page.getByRole("link", { name: "Display Catalog" });
    await expect(catalogLink).toBeVisible();
    await catalogLink.click();
    await page.waitForURL(/\/display-catalog/, { waitUntil: "domcontentloaded" });

    // 3. Verify Page Title & Summary Metrics
    await expect(page.getByTestId("display-catalog-title")).toContainText("Display Inventory Catalog");
    await expect(page.getByText("Reference Samples")).toBeVisible();
    await expect(page.getByText("Catalog-First Visual")).toBeVisible();

    // 4. Test Search Filter for iPhone 16 Pro
    const searchInput = page.getByPlaceholder(/Search model, printed title, UPC barcode/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill("iPhone 16 Pro");

    // 5. Verify the matched row and barcode badge
    await expect(page.getByText("iPhone 16 Pro", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("665871925243")).toBeVisible();

    // 6. Click Inspect to open reference inspection modal
    const inspectBtn = page.getByRole("button", { name: "Inspect" }).first();
    await expect(inspectBtn).toBeVisible();
    await inspectBtn.click();

    // 7. Verify modal contents
    await expect(page.getByText(/Sample Identifier/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
  });
});
