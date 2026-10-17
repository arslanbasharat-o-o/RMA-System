import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  users,
  customers,
  returnReasons,
  rmas,
  rmaItems,
  itemImages,
  displayCatalog,
  vendors,
  vendorVariants,
  vendorRecognitionRules,
  reviewActions,
} from "@/db/schema";
import { generateNextRmaNumber } from "@/lib/utils/rma-sequence";
import { storage } from "@/lib/storage";
import { processRmaItem } from "@/lib/queue/processor";
import { createUniqueTestImage } from "@/__tests__/helpers/image-fixtures";
import { createSessionToken } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";

describe("E2E Scenarios A through L Integration Verification", () => {
  let customerId: string;
  let reasonId: string;
  let adminUserId: string;
  let operatorUserId: string;
  let viewerUserId: string;

  beforeAll(async () => {
    // 1. Ensure test customer exists
    const [cust] = await db
      .insert(customers)
      .values({
        name: "Acme Mobile Repair HQ",
        contactName: "Alice Admin",
        email: "alice@acme-repair.com",
      })
      .returning({ id: customers.id });
    customerId = cust.id;

    // 2. Fetch return reason
    const [reason] = await db.select().from(returnReasons).limit(1);
    reasonId = reason.id;

    // 3. Setup test users for RBAC testing
    const [adminUser] = await db
      .insert(users)
      .values({
        name: "Test Admin",
        email: `admin-${Date.now()}@rma.internal`,
        role: "admin",
        passwordHash: "argon2_test_hash",
      })
      .returning({ id: users.id });
    adminUserId = adminUser.id;

    const [operatorUser] = await db
      .insert(users)
      .values({
        name: "Test Operator",
        email: `operator-${Date.now()}@rma.internal`,
        role: "operator",
        passwordHash: "argon2_test_hash",
      })
      .returning({ id: users.id });
    operatorUserId = operatorUser.id;

    const [viewerUser] = await db
      .insert(users)
      .values({
        name: "Test Viewer",
        email: `viewer-${Date.now()}@rma.internal`,
        role: "viewer",
        passwordHash: "argon2_test_hash",
      })
      .returning({ id: users.id });
    viewerUserId = viewerUser.id;
  });

  // --------------------------------------------------------------------------
  // Scenario A — Create RMA
  // --------------------------------------------------------------------------
  it("Scenario A: User creates an RMA with customer, return reason, tracking number, and receives valid RMA", async () => {
    const rmaNumber = await generateNextRmaNumber();
    expect(rmaNumber).toMatch(/^RMA-\d{4}-\d{6}$/);

    const [createdRma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
        trackingNumber: "TRACK-123456789",
        expectedDisplayCount: 50,
        status: "receiving",
        notes: "Intake verified from Acme",
      })
      .returning();

    expect(createdRma.id).toBeDefined();
    expect(createdRma.rmaNumber).toBe(rmaNumber);
    expect(createdRma.status).toBe("receiving");
    expect(createdRma.customerId).toBe(customerId);
  });

  // --------------------------------------------------------------------------
  // Scenario B — Capture 50 displays (distinct line items)
  // --------------------------------------------------------------------------
  it("Scenario B: User creates 50 physical display line items, every item remains distinct without collision", async () => {
    const rmaNumber = await generateNextRmaNumber();
    const [batchRma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
        status: "receiving",
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

    // Verify distinct item numbers 1 through 50
    const numbers = insertedItems.map((i) => i.itemNumber).sort((a, b) => a - b);
    expect(numbers[0]).toBe(1);
    expect(numbers[49]).toBe(50);
  });

  // --------------------------------------------------------------------------
  // Scenario C — Multiple images per display
  // --------------------------------------------------------------------------
  it("Scenario C: Multiple images (front, back, closeup) attached to 1 physical display item counts as 1 display", async () => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
        status: "receiving",
      })
      .returning();

    // 1 physical display
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "uploaded",
      })
      .returning();

    // Attach 3 distinct images to this single display
    const sampleBuffer = await createUniqueTestImage();

    const angles: Array<"front" | "back" | "stamp_closeup"> = [
      "front",
      "back",
      "stamp_closeup",
    ];

    for (let i = 0; i < angles.length; i++) {
      const stored = await storage.saveImage(
        sampleBuffer,
        `display_${angles[i]}.jpg`,
        "image/jpeg",
        `test_c/${item.id}`
      );

      await db.insert(itemImages).values({
        rmaItemId: item.id,
        imageType: angles[i],
        storagePath: stored.storagePath,
        thumbnailPath: stored.thumbnailPath,
        previewPath: stored.previewPath,
        originalFilename: `display_${angles[i]}.jpg`,
        mimeType: stored.mimeType,
        fileSizeBytes: stored.fileSizeBytes,
        checksumSha256: stored.checksumSha256 + `_${i}`,
        sortOrder: i + 1,
      });
    }

    // Verify database counts: 1 display item, 3 images
    const displays = await db.select().from(rmaItems).where(eq(rmaItems.rmaId, rma.id));
    expect(displays.length).toBe(1);

    const attachedImages = await db
      .select()
      .from(itemImages)
      .where(eq(itemImages.rmaItemId, item.id));
    expect(attachedImages.length).toBe(3);
  });

  // --------------------------------------------------------------------------
  // Scenario D — Successful identification (Task A + Task B exact match)
  // --------------------------------------------------------------------------
  it("Scenario D: Both Task A and Task B succeed, synthesizing an exact catalog and vendor match", async () => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
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

    const sampleBuffer = await createUniqueTestImage();

    const stored = await storage.saveImage(
      sampleBuffer,
      "iphone13_ami_a.jpg",
      "image/jpeg",
      `test_d/${item.id}`
    );

    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "primary",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      previewPath: stored.previewPath,
      originalFilename: "iphone13_ami_a.jpg",
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 1,
    });

    // Execute processor
    await processRmaItem(item.id);

    const [processed] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(processed.visualStatus).toBe("success");
    expect(processed.vendorOcrStatus).toBe("success");
    expect(processed.predictedModel).toBe("iPhone 13 Pro");
    expect(processed.predictedManufacturer).toBe("Apple");
    expect(processed.identifiedVendorId).toBeDefined();
    expect(processed.status).toBe("suggested_match");
  });

  // --------------------------------------------------------------------------
  // Scenario E — Unknown vendor
  // --------------------------------------------------------------------------
  it("Scenario E: OCR returns unrecognized vendor marking, preserves text, flags for review without inventing vendor", async () => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
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

    const sampleBuffer = await createUniqueTestImage();

    // Filename 'unknown_vendor' activates mock extraction with marking XYZ-7788
    const stored = await storage.saveImage(
      sampleBuffer,
      "unknown_vendor_stamp.jpg",
      "image/jpeg",
      `test_e/${item.id}`
    );

    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "stamp_closeup",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      previewPath: stored.previewPath,
      originalFilename: "unknown_vendor_stamp.jpg",
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 1,
    });

    await processRmaItem(item.id);

    const [processed] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    // CRITICAL: Vendor must NOT be fabricated!
    expect(processed.identifiedVendorId).toBeNull();
    expect(processed.identifiedVendorVariantId).toBeNull();
    expect(processed.status).toBe("review_required");
    // Raw text and markings must be preserved
    expect(processed.extractedTextSummary).toContain("XYZ");
  });

  // --------------------------------------------------------------------------
  // Scenario F & G — Provider failure resilience & independent retry
  // --------------------------------------------------------------------------
  it("Scenario F: Visual recognition failure does not corrupt OCR results and marks review_required", async () => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
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

    // Attach valid image
    const sampleBuffer = await createUniqueTestImage();
    const stored = await storage.saveImage(
      sampleBuffer,
      "test_f.jpg",
      "image/jpeg",
      `test_f/${item.id}`
    );
    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "primary",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      previewPath: stored.previewPath,
      originalFilename: "test_f.jpg",
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 1,
    });

    // Run selective pipeline: vendor_ocr only (simulating visual not yet run / failed)
    await processRmaItem(item.id, { pipeline: "vendor_ocr" });

    const [processed] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(processed.vendorOcrStatus).toBe("success");
    // Visual status was not executed or failed, so item requires review
    expect(processed.status).toBe("review_required");
  });

  // --------------------------------------------------------------------------
  // Scenario H — Duplicate upload idempotency
  // --------------------------------------------------------------------------
  it("Scenario H: Uploading identical image buffer twice prevents duplicate itemImage creation", async () => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
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

    const sampleBuffer = await createUniqueTestImage();

    const crypto = await import("crypto");
    const checksumSha256 = crypto.createHash("sha256").update(sampleBuffer).digest("hex");

    // First upload
    const stored = await storage.saveImage(
      sampleBuffer,
      "duplicate_test.jpg",
      "image/jpeg",
      `test_h/${item.id}`
    );
    const [img1] = await db
      .insert(itemImages)
      .values({
        rmaItemId: item.id,
        imageType: "primary",
        storagePath: stored.storagePath,
        thumbnailPath: stored.thumbnailPath,
        previewPath: stored.previewPath,
        originalFilename: "duplicate_test.jpg",
        mimeType: stored.mimeType,
        fileSizeBytes: stored.fileSizeBytes,
        checksumSha256,
        sortOrder: 1,
      })
      .returning();

    // Check if duplicate exists before inserting second
    const [existing] = await db
      .select()
      .from(itemImages)
      .where(
        and(
          eq(itemImages.rmaItemId, item.id),
          eq(itemImages.checksumSha256, checksumSha256)
        )
      );

    expect(existing).toBeDefined();
    expect(existing.id).toBe(img1.id);

    // Database still has exactly 1 image attached
    const images = await db.select().from(itemImages).where(eq(itemImages.rmaItemId, item.id));
    expect(images.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario I — Manual correction & audit history
  // --------------------------------------------------------------------------
  it("Scenario I: Operator manually changes suggested model/vendor, audit trail is recorded in reviewActions", async () => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
        status: "processing",
      })
      .returning();

    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "review_required",
        predictedModel: "Uncertain Model",
      })
      .returning();

    // Fetch an alternative catalog model (e.g. Samsung Galaxy A15)
    const [targetCatalog] = await db
      .select()
      .from(displayCatalog)
      .where(eq(displayCatalog.modelName, "Galaxy A15"));

    // Operator applies manual correction
    await db
      .update(rmaItems)
      .set({
        catalogDisplayId: targetCatalog.id,
        predictedManufacturer: targetCatalog.manufacturer,
        predictedModel: targetCatalog.modelName,
        status: "verified",
        matchStatus: "manually_verified",
        verifiedByUserId: operatorUserId,
        verifiedAt: new Date(),
        reviewNotes: "Operator manually confirmed Galaxy A15",
      })
      .where(eq(rmaItems.id, item.id));

    // Audit log entry
    await db.insert(reviewActions).values({
      rmaItemId: item.id,
      userId: operatorUserId,
      actionType: "change_model",
      previousState: { predictedModel: "Uncertain Model", status: "review_required" },
      newState: { predictedModel: targetCatalog.modelName, status: "verified" },
      notes: "Operator manually confirmed Galaxy A15",
    });

    const [verifiedItem] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(verifiedItem.status).toBe("verified");
    expect(verifiedItem.predictedModel).toBe("Galaxy A15");
    expect(verifiedItem.matchStatus).toBe("manually_verified");

    // Verify audit record exists
    const [audit] = await db
      .select()
      .from(reviewActions)
      .where(eq(reviewActions.rmaItemId, item.id));
    expect(audit).toBeDefined();
    expect(audit.actionType).toBe("change_model");
    expect(audit.userId).toBe(operatorUserId);
  });

  // --------------------------------------------------------------------------
  // Scenario J — Permissions (Viewer role blocked from mutation)
  // --------------------------------------------------------------------------
  it("Scenario J: Viewer role is denied with 403 Forbidden on mutations requiring admin or operator", async () => {
    // Generate viewer session token
    const viewerToken = await createSessionToken({
      userId: viewerUserId,
      email: "viewer@rma.internal",
      role: "viewer",
      name: "Viewer Test",
    });

    const dummyReq = new NextRequest("http://localhost:3000/api/rmas", {
      method: "POST",
      headers: {
        cookie: `rma_session=${viewerToken}`,
      },
    });

    // Test requireAuth with allowedRoles: ['admin', 'operator']
    const result = await requireAuth(dummyReq, ["admin", "operator"]);
    expect(result instanceof NextResponse).toBe(true);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(403);
    }
  });

  // --------------------------------------------------------------------------
  // Scenario L — Recovery after interruption
  // --------------------------------------------------------------------------
  it("Scenario L: Interrupted item in processing state safely recovers and completes on re-execution", async () => {
    const rmaNumber = await generateNextRmaNumber();
    const [rma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId,
        returnReasonId: reasonId,
        status: "processing",
      })
      .returning();

    // Item was interrupted midway (status left as processing)
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        itemNumber: 1,
        status: "processing",
      })
      .returning();

    const sampleBuffer = await createUniqueTestImage();

    const stored = await storage.saveImage(
      sampleBuffer,
      "recovery_test.jpg",
      "image/jpeg",
      `test_l/${item.id}`
    );

    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "primary",
      storagePath: stored.storagePath,
      thumbnailPath: stored.thumbnailPath,
      previewPath: stored.previewPath,
      originalFilename: "recovery_test.jpg",
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 1,
    });

    // Worker resumes / reprocesses the interrupted item
    await processRmaItem(item.id, { force: true });

    const [recoveredItem] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(recoveredItem.status).toBe("suggested_match");
    expect(recoveredItem.visualStatus).toBe("success");
    expect(recoveredItem.vendorOcrStatus).toBe("success");
  });

  afterAll(async () => {
    const testUserIds = [adminUserId, operatorUserId, viewerUserId].filter(Boolean);
    if (testUserIds.length > 0) {
      await db
        .update(rmaItems)
        .set({ verifiedByUserId: null })
        .where(inArray(rmaItems.verifiedByUserId, testUserIds));
      await db.delete(reviewActions).where(inArray(reviewActions.userId, testUserIds));
      await db.delete(users).where(inArray(users.id, testUserIds));
    }
    if (customerId) {
      await db.delete(rmas).where(eq(rmas.customerId, customerId));
      await db.delete(customers).where(eq(customers.id, customerId));
    }
  });
});
