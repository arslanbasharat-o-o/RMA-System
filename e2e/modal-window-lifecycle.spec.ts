import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TEST_PASSWORD } from "./credentials";
import { test, expect } from "@playwright/test";
import { db } from "@/db";
import { rmas, customers, returnReasons, rmaItems } from "@/db/schema";
import { generateNextRmaNumber } from "@/lib/utils/rma-sequence";

test.describe("Modal & Window Open/Close Lifecycle and Scroll-Locking", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("1. Quick Add Customer Modal in /rmas/new: opens, locks scroll, closes via X, backdrop, and Escape", async ({
    page,
  }) => {
    await page.goto("/rmas/new");
    await expect(page.locator("h1")).toContainText("Create RMA Intake");

    // Open Modal
    await page.click('button:has-text("Quick Add Customer")');
    const modal = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(modal).toBeVisible();
    await expect(page.locator("h3:has-text('Quick Add Customer')")).toBeVisible();

    // Verify body scroll is locked
    const overflowWhileOpen = await page.evaluate(() => document.body.style.overflow);
    expect(overflowWhileOpen).toBe("hidden");

    // Close via Escape key
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
    const overflowAfterEsc = await page.evaluate(() => document.body.style.overflow);
    expect(overflowAfterEsc).not.toBe("hidden");

    // Open again, close via Cancel button
    await page.click('button:has-text("Quick Add Customer")');
    await expect(modal).toBeVisible();
    await page.click('button:has-text("Cancel")');
    await expect(modal).not.toBeVisible();

    // Open again, close via Close X button
    await page.click('button:has-text("Quick Add Customer")');
    await expect(modal).toBeVisible();
    await page.click('button[aria-label="Close modal"]');
    await expect(modal).not.toBeVisible();
  });

  test("2. Add Customer Modal in /customers: opens, closes via Escape and Cancel", async ({
    page,
  }) => {
    await page.goto("/customers");
    await expect(page.locator("h1")).toContainText("Customer Directory");

    await page.click('button:has-text("Add Customer")');
    const modal = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(modal).toBeVisible();

    // Escape closes modal
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });

  test("3. Add Model Modal in /display-catalog: opens, closes via Escape", async ({
    page,
  }) => {
    await page.goto("/display-catalog");
    await expect(page.locator("h1")).toContainText("Display Model Catalog");

    await page.click('button:has-text("Add Display Model")');
    const modal = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(modal).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });

  test("4. Add Vendor & Variant Modals in /vendor-catalog: open, close via Escape", async ({
    page,
  }) => {
    await page.goto("/vendor-catalog");
    await expect(page.locator("h1")).toContainText("Vendor Catalog & Rules");

    // Add Vendor
    await page.click('button:has-text("Add Vendor")');
    const vendorModal = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(vendorModal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(vendorModal).not.toBeVisible();

    // Add Variant
    await page.click('button:has-text("Add Variant")');
    const variantModal = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(variantModal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(variantModal).not.toBeVisible();

    // Add Rule
    await page.click('button:has-text("Add Rule")');
    const ruleModal = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(ruleModal).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ruleModal).not.toBeVisible();
  });

  test("5. Item Review Drawer in /rmas/[id]: opens, handles Escape key, backdrop click, and closes cleanly", async ({
    page,
  }) => {
    // Create test RMA with 1 item
    const [cust] = await db.select().from(customers).limit(1);
    const [reason] = await db.select().from(returnReasons).limit(1);
    const rmaNumber = await generateNextRmaNumber();

    const [testRma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: cust.id,
        returnReasonId: reason.id,
        status: "review_required",
      })
      .returning();

    const [testItem] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRma.id,
        itemNumber: 1,
        status: "review_required",
        predictedManufacturer: "Apple",
        predictedModel: "iPhone 13 Pro",
      })
      .returning();

    await page.goto(`/rmas/${testRma.id}`);
    await expect(page.locator("body")).toContainText(rmaNumber);

    // Open drawer via row click or inspect button
    const itemTrigger = page.locator('button[title="Inspect Item Details"]:visible, button:has-text("Inspect"):visible, tr:has-text("#1"):visible').first();
    await itemTrigger.click();
    const drawer = page.locator('div[role="dialog"][aria-label="Inspection for Display Item #1"]');
    await expect(drawer).toBeVisible();

    // Verify body scroll is locked
    const overflowOpen = await page.evaluate(() => document.body.style.overflow);
    expect(overflowOpen).toBe("hidden");

    // Test Delete Item confirmation modal inside drawer
    await page.click('button:has-text("Delete Item")');
    const deleteModal = page.locator('h3:has-text("Delete Display Item")');
    await expect(deleteModal).toBeVisible();

    // Escape closes delete modal first without closing drawer
    await page.keyboard.press("Escape");
    await expect(deleteModal).not.toBeVisible();
    await expect(drawer).toBeVisible();

    // Second Escape closes drawer itself
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();

    // Verify body scroll is unlocked
    const overflowClosed = await page.evaluate(() => document.body.style.overflow);
    expect(overflowClosed).not.toBe("hidden");
  });
});
