import { test, expect } from "@playwright/test";
import { E2E_TEST_PASSWORD } from "./credentials";

test.describe("Display Inventory Catalog Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/images/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          "base64"
        ),
      });
    });

    await page.route("**/api/display-inventory**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          json: {
            stats: {
              totalProducts: 1,
              activeProducts: 1,
              totalReferences: 1,
              matchableReferences: 1,
              excludedSamples: 0,
            },
            products: [
              {
                id: "00000000-0000-0000-0000-000000000001",
                manufacturer: "Apple",
                modelName: "iPhone 16 Pro",
                variantName: "Hard OLED",
                printedTitle: "Liphone 16 Pro Hard OLED",
                barcodeValue: "665871925243",
                barcodeFormat: "UPC-A digits",
                barcodeSymbology: "CODE128",
                supplierSku: "SKU-16PRO-HARD",
                isActive: true,
                references: [
                  {
                    id: "00000000-0000-0000-0000-000000000002",
                    sourceDisplayId: "DSP-003",
                    sourceImageId: "IMG_007_back",
                    imageType: "back",
                    isMatchable: true,
                    cropMetadata: { x: 10, y: 10, width: 200, height: 400 },
                    readableMarkings: [{ text: "QR-16P-HD", location: "bottom-left" }],
                  },
                ],
              },
            ],
          },
        });
      } else {
        await route.continue();
      }
    });
  });

  test("loads display catalog, filters variants, and inspects reference details", async ({ page }) => {
    // 1. Sign in as operator
    await page.goto("/login");
    await page.fill('input[type="email"]', "operator@rma-system.internal");
    await page.fill('input[type="password"]', E2E_TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/dashboard/, { waitUntil: "domcontentloaded" });

    // 2. Navigate to Display Catalog
    const catalogLink = page.getByRole("link", { name: "Display Catalog" });
    if (await catalogLink.isVisible()) {
      await catalogLink.click();
    } else {
      await page.goto("/display-catalog");
    }
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
    const closeBtn = page.getByRole("button", { name: "Close" }).first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
  });
});
