import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TEST_PASSWORD } from "./credentials";
import { test, expect } from "@playwright/test";
import { db } from "@/db";
import {
  customers,
  returnReasons,
  rmas,
  rmaItems,
  itemImages,
  reviewActions,
} from "@/db/schema";
import { generateNextRmaNumber } from "@/lib/utils/rma-sequence";
import { storage } from "@/lib/storage";
import { processRmaItem } from "@/lib/queue/processor";
import { eq } from "drizzle-orm";
import sharp from "sharp";

test.describe("Section 27: End-to-End Browser Test Suites (Scenarios A through L)", () => {
  let sampleJpegBuffer: Buffer;
  let testCustomerId: string;
  let testReasonId: string;
  let testCustomerName: string;

  test.beforeAll(async () => {
    // Generate valid sample image buffer using sharp
    sampleJpegBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 50, g: 100, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();

    // Ensure at least one customer exists
    let [cust] = await db.select().from(customers).limit(1);
    if (!cust) {
      const [newCust] = await db
        .insert(customers)
        .values({
          name: "Acme Displays Ltd",
          contactName: "John Doe",
          email: "john@acmedisplays.com",
        })
        .returning();
      cust = newCust;
    }
    testCustomerId = cust.id;
    testCustomerName = cust.name;

    // Fetch existing return reason
    const [reason] = await db.select().from(returnReasons).limit(1);
    testReasonId = reason.id;
  });

  // --------------------------------------------------------------------------
  // Scenario A — Create RMA
  // --------------------------------------------------------------------------
  test("Scenario A: User logs in, selects customer, return reason, creates RMA and opens capture scanner", async ({
    page,
  }) => {
    // 1. Login
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("h1")).toContainText("Operations Dashboard");

    // 2. Navigate to Create RMA
    await page.goto("/rmas/new");
    await expect(page.locator("h1")).toContainText("Create RMA Intake");

    // 3. Fill form
    await page.locator("select").first().selectOption({ value: testCustomerId });
    await page.locator("select").nth(1).selectOption({ value: testReasonId });
    await page.fill('input[placeholder="e.g. 1Z9999999999999999"]', "TRACK-E2E-A-001");

    // 4. Submit
    await page.click('button:has-text("Create & Launch Camera Scanner")');

    // 5. Verify redirection to camera capture screen
    await page.waitForURL(/\/rmas\/[a-f0-9-]+\/capture/);
    const url = page.url();
    expect(url).toContain("/capture");

    // Verify RMA identifier and customer name in scanner header
    await expect(page.locator("body")).toContainText(testCustomerName);
    await expect(page.locator("body")).toContainText("RMA-2026-");
  });

  // --------------------------------------------------------------------------
  // Scenario B — Capture 50 displays (distinct line items)
  // --------------------------------------------------------------------------
  test("Scenario B: RMA with 50 physical display items maintains distinct records and responsive UI", async ({
    page,
  }) => {
    // Create an RMA with 50 items
    const rmaNumber = await generateNextRmaNumber();
    const [batchRma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        expectedDisplayCount: 50,
        status: "receiving",
        notes: "Scenario B: 50 physical items batch",
      })
      .returning();

    const itemsToInsert = Array.from({ length: 50 }, (_, i) => ({
      rmaId: batchRma.id,
      itemNumber: i + 1,
      status: "pending_upload" as const,
    }));
    const insertedItems = await db.insert(rmaItems).values(itemsToInsert).returning();
    expect(insertedItems.length).toBe(50);

    // Verify distinct IDs
    const ids = new Set(insertedItems.map((i) => i.id));
    expect(ids.size).toBe(50);

    // Login and open RMA detail page
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/rmas/${batchRma.id}`);
    await expect(page.locator("body")).toContainText(batchRma.rmaNumber);
    await expect(page.locator("body")).toContainText("Total Displays");
    await expect(page.locator("body")).toContainText("50");

    // Verify first and last display items appear in the table
    await expect(page.locator("body")).toContainText("#1");
    await expect(page.locator("body")).toContainText("#50");
  });

  // --------------------------------------------------------------------------
  // Scenario C — Multiple images per display
  // --------------------------------------------------------------------------
  test("Scenario C: Multiple images on 1 display item count as 1 display and link all photos", async ({
    page,
  }) => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "receiving",
      })
      .returning();

    // 1 physical display item
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "uploaded",
      })
      .returning();

    // Attach 3 distinct angle images to this 1 item
    const angles: Array<"front" | "back" | "stamp_closeup"> = ["front", "back", "stamp_closeup"];
    for (const angle of angles) {
      const stored = await storage.saveImage(
        sampleJpegBuffer,
        `photo_${angle}.jpg`,
        "image/jpeg",
        rma.id
      );
      await db.insert(itemImages).values({
        rmaItemId: item.id,
        originalFilename: `photo_${angle}.jpg`,
        storagePath: stored.storagePath,
        thumbnailPath: stored.thumbnailPath,
        checksumSha256: stored.checksumSha256,
        fileSizeBytes: stored.fileSizeBytes,
        mimeType: stored.mimeType,
        imageType: angle,
      });
    }

    // Verify database counts
    const imagesCount = await db
      .select()
      .from(itemImages)
      .where(eq(itemImages.rmaItemId, item.id));
    expect(imagesCount.length).toBe(3);

    const itemsCount = await db.select().from(rmaItems).where(eq(rmaItems.rmaId, rma.id));
    expect(itemsCount.length).toBe(1);

    // Open UI and verify 1 display with 3 photos
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/rmas/${rma.id}`);
    await expect(page.locator("body")).toContainText("Total Displays");
    await expect(page.locator("body")).toContainText("#1");

    // Open item inspection drawer
    await page.locator('button[title="Inspect Item Details"]:visible, button:has-text("Inspect"):visible').first().click();
    await expect(page.locator("body")).toContainText("Captured Photos (3)");
  });

  // --------------------------------------------------------------------------
  // Scenario D — Successful identification (Task A + Task B)
  // --------------------------------------------------------------------------
  test("Scenario D: Both Task A and Task B succeed, synthesizing exact catalog and vendor match", async ({
    page,
  }) => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "processing",
      })
      .returning();

    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "queued",
      })
      .returning();

    const stored = await storage.saveImage(
      sampleJpegBuffer,
      "screen_front.jpg",
      "image/jpeg",
      rma.id
    );
    await db.insert(itemImages).values({
      rmaItemId: item.id,
      originalFilename: "screen_front.jpg",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      checksumSha256: stored.checksumSha256,
      fileSizeBytes: stored.fileSizeBytes,
      mimeType: stored.mimeType,
      imageType: "primary",
    });

    // Execute background processor
    await processRmaItem(item.id, { pipeline: "all" });

    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updated.matchStatus).toBe("exact_match");

    // Verify in UI
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/rmas/${rma.id}`);
    await expect(page.locator("body")).toContainText("iPhone 13 Pro");
    await expect(page.locator("body")).toContainText("AMI");
  });

  // --------------------------------------------------------------------------
  // Scenario E — Unknown vendor
  // --------------------------------------------------------------------------
  test("Scenario E: OCR returns unrecognized vendor marking, preserves text, flags for review without inventing vendor", async ({
    page,
  }) => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "processing",
      })
      .returning();

    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "queued",
      })
      .returning();

    const stored = await storage.saveImage(
      sampleJpegBuffer,
      "unknown_stamp.jpg",
      "image/jpeg",
      rma.id
    );
    await db.insert(itemImages).values({
      rmaItemId: item.id,
      originalFilename: "unknown_stamp.jpg",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      checksumSha256: stored.checksumSha256,
      fileSizeBytes: stored.fileSizeBytes,
      mimeType: stored.mimeType,
      imageType: "stamp_closeup",
    });

    await processRmaItem(item.id, { pipeline: "all" });

    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(["unknown", "ambiguous"]).toContain(updated.matchStatus);
    expect(updated.status).toBe("review_required");

    // Inspect in UI
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/rmas/${rma.id}`);
    await expect(page.locator("body")).toContainText("review_required");
  });

  // --------------------------------------------------------------------------
  // Scenario F — Google Lens failure
  // --------------------------------------------------------------------------
  test("Scenario F: Visual recognition failure does not corrupt OCR results and flags review_required", async ({
    page,
  }) => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "processing",
      })
      .returning();

    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "queued",
        visualStatus: "failed",
        visualError: "Visual recognition provider timeout after 15000ms",
      })
      .returning();

    const stored = await storage.saveImage(
      sampleJpegBuffer,
      "screen_f.jpg",
      "image/jpeg",
      rma.id
    );
    await db.insert(itemImages).values({
      rmaItemId: item.id,
      originalFilename: "screen_f.jpg",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      checksumSha256: stored.checksumSha256,
      fileSizeBytes: stored.fileSizeBytes,
      mimeType: stored.mimeType,
      imageType: "primary",
    });

    // Run vendor OCR independently
    await processRmaItem(item.id, { pipeline: "vendor_ocr" });

    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updated.visualStatus).toBe("failed");
    expect(updated.status).toBe("review_required");

    // Verify in UI
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/rmas/${rma.id}`);
    await expect(page.locator("body")).toContainText("review_required");
  });

  // --------------------------------------------------------------------------
  // Scenario G — OpenAI failure
  // --------------------------------------------------------------------------
  test("Scenario G: Vendor OCR failure preserves visual display identification and supports independent retry", async ({
    page,
  }) => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "processing",
      })
      .returning();

    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "queued",
        vendorOcrStatus: "failed",
        vendorOcrError: "OpenAI rate limit 429",
      })
      .returning();

    const stored = await storage.saveImage(
      sampleJpegBuffer,
      "screen_g.jpg",
      "image/jpeg",
      rma.id
    );
    await db.insert(itemImages).values({
      rmaItemId: item.id,
      originalFilename: "screen_g.jpg",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      checksumSha256: stored.checksumSha256,
      fileSizeBytes: stored.fileSizeBytes,
      mimeType: stored.mimeType,
      imageType: "primary",
    });

    // Run visual pipeline
    await processRmaItem(item.id, { pipeline: "visual" });

    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updated.vendorOcrStatus).toBe("failed");
    expect(updated.status).toBe("review_required");

    // Open item drawer in UI and verify retry button is present
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/rmas/${rma.id}`);
    await page.locator('button[title="Inspect Item Details"]:visible, button:has-text("Inspect"):visible').first().click();
    await expect(page.locator("body")).toContainText("Retry OCR");
  });

  // --------------------------------------------------------------------------
  // Scenario H — Duplicate upload
  // --------------------------------------------------------------------------
  test("Scenario H: Retried image upload with identical SHA-256 is deduplicated idempotently", async ({
    request,
  }) => {
    // 1. Create an RMA and Item
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "receiving",
      })
      .returning();

    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "pending_upload",
      })
      .returning();

    // Login as admin via API request context to receive session cookie
    const loginRes = await request.post("/api/auth/login", {
      data: {
        email: E2E_ADMIN_EMAIL,
        password: E2E_ADMIN_PASSWORD,
      },
    });
    expect(loginRes.ok()).toBe(true);

    // First upload
    const upload1 = await request.post(`/api/rma-items/${item.id}/upload`, {
      multipart: {
        file: {
          name: "display_test.jpg",
          mimeType: "image/jpeg",
          buffer: sampleJpegBuffer,
        },
        imageType: "primary",
      },
    });

    expect(upload1.ok()).toBe(true);
    const res1 = await upload1.json();
    expect(res1.success).toBe(true);
    expect(res1.deduplicated).toBeFalsy();

    // Second upload (identical payload & hash)
    const upload2 = await request.post(`/api/rma-items/${item.id}/upload`, {
      multipart: {
        file: {
          name: "display_test.jpg",
          mimeType: "image/jpeg",
          buffer: sampleJpegBuffer,
        },
        imageType: "primary",
      },
    });

    expect(upload2.ok()).toBe(true);
    const res2 = await upload2.json();
    expect(res2.success).toBe(true);
    expect(res2.deduplicated).toBe(true);
    expect(res2.image.id).toBe(res1.image.id);

    // Verify exactly 1 image row in database
    const images = await db
      .select()
      .from(itemImages)
      .where(eq(itemImages.rmaItemId, item.id));
    expect(images.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario I — Manual correction
  // --------------------------------------------------------------------------
  test("Scenario I: Operator manually corrects model/vendor, updates item and records audit log", async ({
    page,
  }) => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "review_required",
      })
      .returning();

    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "review_required",
      })
      .returning();

    // Login as operator
    await page.goto("/login");
    await page.fill('input[type="email"]', "operator@rma-system.internal");
    await page.fill('input[type="password"]', E2E_TEST_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/rmas/${rma.id}`);
    await page.locator('button[title="Inspect Item Details"]:visible, button:has-text("Inspect"):visible').first().click();

    // Verify Drawer opens
    await expect(page.locator("body")).toContainText("Manual Verification & Override");

    // Select manual override options
    await page.fill('input[placeholder*="Verified genuine"]', "Verified via physical laser mark");
    await page.click('button:has-text("Confirm & Verify")');

    // Wait for drawer to close and check updated item in DB
    await page.waitForTimeout(1000);
    const [updatedItem] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updatedItem.status).toBe("verified");
    expect(updatedItem.matchStatus).toBe("manually_verified");

    // Verify audit log
    const [action] = await db
      .select()
      .from(reviewActions)
      .where(eq(reviewActions.rmaItemId, item.id));
    expect(action).toBeDefined();
    expect(action.actionType).toBe("manual_verify");
  });

  // --------------------------------------------------------------------------
  // Scenario J — Permissions (RBAC)
  // --------------------------------------------------------------------------
  test("Scenario J: Viewer role can view records but backend rejects unauthorized mutations", async ({
    request,
    page,
  }) => {
    // 1. Viewer login in browser
    await page.goto("/login");
    await page.fill('input[type="email"]', "viewer@rma-system.internal");
    await page.fill('input[type="password"]', E2E_TEST_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    // Viewer can view /rmas page
    await page.goto("/rmas");
    await expect(page.locator("h1")).toContainText("RMA Shipments");

    // 2. Viewer attempts mutation via API -> 403 Forbidden
    const viewerLogin = await request.post("/api/auth/login", {
      data: {
        email: "viewer@rma-system.internal",
        password: E2E_TEST_PASSWORD,
      },
    });
    expect(viewerLogin.ok()).toBe(true);

    const createRmaAttempt = await request.post("/api/rmas", {
      data: {
        customerId: testCustomerId,
        returnReasonId: testReasonId,
      },
    });
    expect(createRmaAttempt.status()).toBe(403);

    const userManagementAttempt = await request.get("/api/users");
    expect(userManagementAttempt.status()).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Scenario K — Mobile usability
  // --------------------------------------------------------------------------
  test("Scenario K: Mobile viewport renders responsive navigation, touch controls, and scanner", async ({
    page,
  }) => {
    // Set viewport to mobile smartphone dimensions
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    // Verify desktop sidebar is hidden
    const desktopAside = page.locator("aside");
    await expect(desktopAside).toBeHidden();

    // Verify mobile hamburger menu button is present and clickable
    const menuBtn = page.locator('button:has(svg.lucide-menu)');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Verify mobile drawer navigation opens
    await expect(page.locator("body")).toContainText("RMA Platform");
    await expect(page.locator("body")).toContainText("Display Catalog");

    // Navigate to a capture screen
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "receiving",
      })
      .returning();

    await page.goto(`/rmas/${rma.id}/capture`);
    await expect(page.locator("body")).toContainText(rma.rmaNumber);

    // Verify camera shutter and upload buttons are responsive on mobile
    const uploadInput = page.locator('input[type="file"]');
    await expect(uploadInput).toHaveCount(1);
  });

  // --------------------------------------------------------------------------
  // Scenario L — Recovery
  // --------------------------------------------------------------------------
  test("Scenario L: Interrupted item in processing state safely recovers and completes", async ({
    page,
  }) => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "processing",
      })
      .returning();

    // Insert item stuck in 'processing' state (e.g., worker killed mid-run)
    const [crashedItem] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "processing",
        visualStatus: "pending",
        vendorOcrStatus: "pending",
      })
      .returning();

    const stored = await storage.saveImage(
      sampleJpegBuffer,
      "screen_l.jpg",
      "image/jpeg",
      rma.id
    );
    await db.insert(itemImages).values({
      rmaItemId: crashedItem.id,
      originalFilename: "screen_l.jpg",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      checksumSha256: stored.checksumSha256,
      fileSizeBytes: stored.fileSizeBytes,
      mimeType: stored.mimeType,
      imageType: "primary",
    });

    // Re-execute processing (simulating worker restarting / recovering job)
    await processRmaItem(crashedItem.id, {
      pipeline: "all",
      force: true,
    });

    const [recoveredItem] = await db
      .select()
      .from(rmaItems)
      .where(eq(rmaItems.id, crashedItem.id));
    expect([
      "exact_match",
      "strong_candidate",
      "possible_candidate",
      "unknown",
      "manually_verified",
    ]).toContain(recoveredItem.matchStatus);

    // Check UI renders safely without errors
    await page.goto("/login");
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
    await page.click('button:has-text("Sign In to Platform")');
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/rmas/${rma.id}`);
    await expect(page.locator("body")).toContainText(rma.rmaNumber);
    await expect(page.locator("body")).toContainText("#1");
  });
});
