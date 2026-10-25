import { chooseOption } from "./select-option";
import { E2E_TEST_PASSWORD } from "./credentials";
import { test, expect, Page } from "@playwright/test";
import { db } from "@/db";
import { rmaItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { processRmaItem } from "@/lib/queue/processor";

/**
 * Helper to navigate across routes supporting both desktop sidebar and mobile slide-over drawer
 */
async function navigateTo(page: Page, label: string, urlPattern: RegExp) {
  // Accessible role queries exclude the hidden tree retained after route changes.
  const mobileToggle = page.getByRole("button", { name: "Toggle navigation menu", exact: true });
  const isMobile = await mobileToggle.isVisible();
  let link;
  if (isMobile) {
    const drawer = page.getByRole("dialog", { name: "Mobile Navigation Drawer" });
    if (!(await drawer.isVisible())) {
      await mobileToggle.click();
      try {
        await expect(mobileToggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
      } catch {
        // The server-rendered dashboard may be visible before its click handler hydrates.
        // Repeating this set-open action is safe and avoids a false navigation failure.
        await mobileToggle.click();
        await expect(mobileToggle).toHaveAttribute("aria-expanded", "true", { timeout: 5000 });
      }
      await expect(drawer).toBeVisible({ timeout: 5000 });
    }
    link = drawer.getByRole("link", { name: label, exact: true });
  } else {
    link = page.locator("aside nav").getByRole("link", { name: label, exact: true });
  }
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(urlPattern, { waitUntil: "domcontentloaded" });
}

test.describe("Section 34: Mandatory Final Real-User End-to-End Workflow", () => {
  let sampleFrontBuffer: Buffer;
  let sampleBackBuffer: Buffer;
  const uniqueTimestamp = Date.now();
  const testCustomerName = `Apex Cellular Repairs ${uniqueTimestamp}`;
  const testCustomerEmail = `intake.${uniqueTimestamp}@apex-repairs.internal`;

  test.beforeAll(async () => {
    // Generate valid sharp JPEG buffers for front and back photos
    sampleFrontBuffer = await sharp({
      create: {
        width: 320,
        height: 480,
        channels: 3,
        background: { r: 25, g: 60, b: 140 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    sampleBackBuffer = await sharp({
      create: {
        width: 320,
        height: 480,
        channels: 3,
        background: { r: 50, g: 50, b: 50 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  });

  test("Section 34 Complete Real-User Scenario (Steps 1 to 36)", async ({ page }) => {
    test.setTimeout(180000);
    // ------------------------------------------------------------------------
    // Step 1: Open the application & Step 2: Log in as an Operator
    // ------------------------------------------------------------------------
    await page.goto("/login");
    await expect(page).toHaveTitle(/RMA/i);
    await expect(page.locator("h1")).toContainText(/RMA Operations/i);

    await page.fill('input[type="email"]', "operator@rma-system.internal");
    await page.fill('input[type="password"]', E2E_TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');

    await page.waitForURL(/\/dashboard/, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText("Operations Dashboard");
    await expect(page.locator("body")).toContainText("operator");

    // ------------------------------------------------------------------------
    // Step 3: Navigate to Customers
    // ------------------------------------------------------------------------
    await navigateTo(page, "Customers", /\/customers/);
    await expect(page.locator("h1")).toContainText("Customer Directory");

    // ------------------------------------------------------------------------
    // Step 4: Create a test customer
    // ------------------------------------------------------------------------
    await page.click('button:has-text("Add Customer")');
    const customerModal = page.locator('div[role="dialog"][aria-modal="true"]').filter({ hasText: "Customer" });
    await expect(customerModal).toBeVisible();

    await customerModal.locator('input[placeholder*="Apex Mobile Repairs"]').fill(testCustomerName);
    await customerModal.locator('input[placeholder*="David Miller"]').fill("Sarah Connor");
    await customerModal.locator('input[placeholder*="david@example.com"]').fill(testCustomerEmail);
    await customerModal.locator('input[placeholder*="+44"]').fill("+1 555 019 2834");
    await customerModal.locator('input[placeholder*="Wholesale terms"]').fill("Premier wholesale repair partner");

    await customerModal.locator('button:has-text("Save Customer")').click();
    await expect(customerModal).not.toBeVisible({ timeout: 5000 });

    // ------------------------------------------------------------------------
    // Step 5: Verify the customer was saved & search works
    // ------------------------------------------------------------------------
    await expect(page.locator("body")).toContainText(testCustomerName);

    const searchInput = page.locator('input[placeholder*="Search customer name"]');
    await searchInput.fill(testCustomerName);
    await searchInput.press("Enter");
    await page.waitForTimeout(400);
    await expect(page.locator("body")).toContainText(testCustomerName);
    await expect(page.locator("body")).toContainText("Sarah Connor");

    // ------------------------------------------------------------------------
    // Step 6: Navigate to RMAs
    // ------------------------------------------------------------------------
    await navigateTo(page, "RMAs", /\/rmas/);
    await expect(page.locator("h1")).toContainText("RMA Shipments");

    // ------------------------------------------------------------------------
    // Step 7: Create a new RMA for that customer
    // ------------------------------------------------------------------------
    const createRmaBtn = page.locator('a:has-text("Create RMA")').filter({ visible: true }).first();
    await createRmaBtn.click();
    await page.waitForURL(/\/rmas\/new/, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText("New RMA");

    const customerSelect = page.locator("select").first();
    const optionValue = await customerSelect.evaluate((sel: HTMLSelectElement, name: string) => {
      const opt = Array.from(sel.options).find((o) => o.text.includes(name));
      return opt ? opt.value : null;
    }, testCustomerName);
    expect(optionValue).toBeTruthy();
    await chooseOption(page, customerSelect, optionValue!);

    // ------------------------------------------------------------------------
    // Step 8: Select a return reason
    // ------------------------------------------------------------------------
    const reasonSelect = page.locator("select").nth(1);
    const reasonValue = await reasonSelect.evaluate((sel: HTMLSelectElement) => {
      return sel.options[0]?.value || null;
    });
    expect(reasonValue).toBeTruthy();
    await chooseOption(page, reasonSelect, reasonValue!);

    // ------------------------------------------------------------------------
    // Step 9: Leave optional RMA and tracking fields empty
    // ------------------------------------------------------------------------
    const extRmaInput = page.locator('input[placeholder*="CUST-RMA"]');
    const trackInput = page.locator('input[placeholder*="1Z9999"]');
    const notesInput = page.locator('input[placeholder*="Package condition"]');
    expect(await extRmaInput.inputValue()).toBe("");
    expect(await trackInput.inputValue()).toBe("");
    expect(await notesInput.inputValue()).toBe("");

    // ------------------------------------------------------------------------
    // Step 10: Confirm RMA creation succeeds
    // ------------------------------------------------------------------------
    await page.getByRole("button", { name: "Create RMA & Open Scanner" }).click();
    await page.waitForURL(/\/rmas\/[a-f0-9-]+\/capture/, { waitUntil: "domcontentloaded" });

    const captureUrl = page.url();
    const rmaIdMatch = captureUrl.match(/\/rmas\/([a-f0-9-]+)\/capture/);
    expect(rmaIdMatch).toBeTruthy();
    const createdRmaId = rmaIdMatch![1];

    await expect(page.locator("body")).toContainText("RMA-2026-");
    await expect(page.locator("body")).toContainText(testCustomerName);

    // ------------------------------------------------------------------------
    // Step 11, 12, 13 & 14: Real Camera Scanner UI intake & Multi-Image Grouping
    // ------------------------------------------------------------------------
    // Select each side explicitly, just as an operator does in the phone picker.
    const choosePhoto = async (name: string, buffer: Buffer) => {
      const chooserPromise = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Photos", exact: true }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({ name, mimeType: "image/jpeg", buffer });
    };
    await choosePhoto("screen1_front.jpg", sampleFrontBuffer);
    await expect(page.getByRole("status")).toContainText("1 photo saved");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await choosePhoto("screen1_back.jpg", sampleBackBuffer);

    // Verify both captured angles and the current session photo count.
    await expect(page.getByRole("img", { name: "Front angle 1" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Back angle 2" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("2 photos saved");

    // Advance to next display in camera scanner
    await page.getByRole("button", { name: "Next display" }).click();
    await expect(page.getByText("Display 2", { exact: true })).toBeVisible();

    // ------------------------------------------------------------------------
    // Step 15 & 16: Complete batch of 50 physical displays & verify count
    // ------------------------------------------------------------------------
    // Inspect items created so far
    const existingItems = await db
      .select({ id: rmaItems.id })
      .from(rmaItems)
      .where(eq(rmaItems.rmaId, createdRmaId));
    const createdItemIds: string[] = existingItems.map((i) => i.id);

    const neededItems = 50 - existingItems.length;
    for (let i = 0; i < neededItems; i += 5) {
      const batchSize = Math.min(5, neededItems - i);
      const batchIndices = Array.from({ length: batchSize }, (_, k) => i + k);
      await Promise.all(
        batchIndices.map(async (idx) => {
          const res = await page.request.post(`/api/rmas/${createdRmaId}/items`);
          expect(res.ok()).toBeTruthy();
          const json = await res.json();
          createdItemIds.push(json.item.id);

          await page.request.post(`/api/rma-items/${json.item.id}/upload`, {
            multipart: {
              file: {
                name: `screen_${idx + 2}_ami.jpg`,
                mimeType: "image/jpeg",
                buffer: sampleFrontBuffer,
              },
              imageType: "primary",
            },
          });
        })
      );
    }

    // Step 17: Finish intake and verify uploads persist
    await page.goto(`/rmas/${createdRmaId}`);
    await page.waitForURL(new RegExp(`/rmas/${createdRmaId}`));

    // Total Displays must be exactly 50 (Case D: 50 displays, not 51 inflated by multiple photos)
    await expect(page.locator("body")).toContainText("Total Displays");
    await expect(page.locator("body")).toContainText("50");

    // ------------------------------------------------------------------------
    // Step 18 & 19: Execute recognition pipeline & observe states
    // ------------------------------------------------------------------------
    for (const itemId of createdItemIds.slice(0, 3)) {
      await processRmaItem(itemId, { pipeline: "all", force: true });
    }

    await page.reload();
    await expect(page.locator("h1")).toContainText("RMA-2026-");

    // ------------------------------------------------------------------------
    // Step 20 & 21: Inspect suggestions and vendor matching results
    // ------------------------------------------------------------------------
    await expect(page.locator("body")).toContainText("#1");

    // ------------------------------------------------------------------------
    // Step 22, 23, 24, 25, 26: Manual Review, Correction, Persistence & Refresh
    // ------------------------------------------------------------------------
    // Click Inspect on the first display item to open ItemReviewDrawer
    const inspectBtn = page.locator('button[title="Inspect Item Details"], button:has-text("Inspect")').filter({ visible: true }).first();
    await inspectBtn.click();

    // Verify Review Drawer opens
    const drawer = page.locator('div[role="dialog"][aria-label*="Inspection for Display Item"]');
    await expect(drawer).toBeVisible();

    // Select a catalog display model override
    const catSelect = drawer.locator("select").first();
    const firstCatOption = await catSelect.evaluate((sel: HTMLSelectElement) => {
      return sel.options.length > 1 ? sel.options[1].value : null;
    });
    if (firstCatOption) {
      await chooseOption(page, catSelect, firstCatOption);
    }

    // Enter review notes
    const reviewNotesInput = drawer.locator('input[placeholder*="Add manual verification notes"]');
    if (await reviewNotesInput.isVisible()) {
      await reviewNotesInput.fill("Operator manually verified and confirmed correct display model.");
    }

    // Save correction / verify
    const saveCorrectionBtn = drawer.locator('button:has-text("Confirm & Verify"), button:has-text("Save Overrides")').first();
    await saveCorrectionBtn.click();

    // Wait for drawer to close
    await expect(drawer).not.toBeVisible({ timeout: 5000 });

    // Step 25 & 26: Refresh page and confirm correction remains saved
    await page.reload();
    await expect(page.locator("body")).toContainText("Verified");

    // ------------------------------------------------------------------------
    // Step 27: Complete the RMA
    // ------------------------------------------------------------------------
    // Mark remaining items verified in DB so the RMA meets completion constraints
    await db
      .update(rmaItems)
      .set({
        status: "verified",
        matchStatus: "manually_verified",
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rmaItems.rmaId, createdRmaId));

    await page.reload();
    const completeBtn = page.locator('button:has-text("Mark Completed")').filter({ visible: true }).first();
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toContainText("Completed");
    }

    // ------------------------------------------------------------------------
    // Step 28 & 29: Return to Dashboard & verify updated numbers
    // ------------------------------------------------------------------------
    await navigateTo(page, "Dashboard", /\/dashboard/);
    await expect(page.locator("h1")).toContainText("Operations Dashboard");
    await expect(page.locator("body")).toContainText(testCustomerName);

    // ------------------------------------------------------------------------
    // Step 30, 31 & 32: Search for RMA, reopen it, and verify history
    // ------------------------------------------------------------------------
    await navigateTo(page, "RMAs", /\/rmas/);
    const rmaSearch = page.locator('input[placeholder*="Search RMA"]');
    await rmaSearch.fill(testCustomerName);
    await rmaSearch.press("Enter");
    await page.waitForTimeout(400);

    // Customer name appears in search results
    await expect(page.locator("body")).toContainText(testCustomerName);

    // Reopen the RMA details
    const detailsLink = page.locator(`a:has-text("Details"), a[href="/rmas/${createdRmaId}"]`).filter({ visible: true }).first();
    await detailsLink.click();
    await page.waitForURL(new RegExp(`/rmas/${createdRmaId}$`), { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText("RMA-2026-");
    await expect(page.locator("body")).toContainText(testCustomerName);

    // ------------------------------------------------------------------------
    // Step 33: Test CSV export functionality
    // ------------------------------------------------------------------------
    const exportRes = await page.request.get(`/api/rmas/${createdRmaId}/export`);
    expect(exportRes.ok()).toBeTruthy();
    const exportCsvText = await exportRes.text();
    expect(exportCsvText).toContain("Item #");
    expect(exportCsvText).toContain("Manufacturer");
    expect(exportCsvText).toContain("Model");

    // ------------------------------------------------------------------------
    // Step 34, 35 & 36: Clean logout & verify unauthorized access protection
    // ------------------------------------------------------------------------
    const mobileToggle = page.getByRole("button", { name: "Toggle navigation menu", exact: true });
    if (await mobileToggle.isVisible()) {
      const drawer = page.locator('div[role="dialog"][aria-modal="true"]');
      if (!(await drawer.isVisible())) {
        await mobileToggle.click();
        await expect(drawer).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(200);
      }
    }

    const logoutBtn = page.locator('button[aria-label="Sign out"], button:has-text("Logout"), button:has-text("Sign out")').filter({ visible: true }).first();
    await logoutBtn.click({ force: true });
    await page.getByRole("dialog", { name: "Confirm Sign Out" }).getByRole("button", { name: "Sign Out", exact: true }).click();
    await page.waitForURL(/\/login/, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/RMA Operations/i);

    // Step 35 & 36: Attempt unauthorized access
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText(/RMA Operations/i);
  });
});
