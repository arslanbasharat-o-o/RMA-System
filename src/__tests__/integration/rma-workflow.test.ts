import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "@/db";
import {
  users,
  customers,
  returnReasons,
  rmas,
  rmaItems,
  itemImages,
} from "@/db/schema";
import { generateNextRmaNumber } from "@/lib/utils/rma-sequence";
import { storage } from "@/lib/storage";
import { processRmaItem } from "@/lib/queue/processor";
import { createUniqueTestImage } from "@/__tests__/helpers/image-fixtures";
import { eq } from "drizzle-orm";

describe("RMA End-to-End Workflow Integration", () => {
  let testCustomerId: string;
  let testReasonId: string;
  let testRmaId: string;
  let testItemId: string;

  beforeAll(async () => {
    // 1. Create test customer
    const [cust] = await db
      .insert(customers)
      .values({
        name: "Integration Test Customer Ltd",
        email: "test@partner.com",
      })
      .returning({ id: customers.id });
    testCustomerId = cust.id;

    // 2. Fetch existing return reason
    const [reason] = await db.select().from(returnReasons).limit(1);
    testReasonId = reason.id;
  });

  it("should create an RMA with unique auto-generated number", async () => {
    const rmaNumber = await generateNextRmaNumber();
    expect(rmaNumber).toMatch(/^RMA-\d{4}-\d{6}$/);

    const [createdRma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: testCustomerId,
        returnReasonId: testReasonId,
        status: "receiving",
      })
      .returning();

    expect(createdRma.id).toBeDefined();
    expect(createdRma.rmaNumber).toBe(rmaNumber);
    testRmaId = createdRma.id;
  });

  it("should add a physical display line item to the RMA", async () => {
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 1,
        status: "pending_upload",
      })
      .returning();

    expect(item.id).toBeDefined();
    expect(item.itemNumber).toBe(1);
    testItemId = item.id;
  });

  it("should store image file and attach image metadata to the display item", async () => {
    // Generate sample 100x100 white image buffer
    const sampleBuffer = await createUniqueTestImage();

    const stored = await storage.saveImage(
      sampleBuffer,
      "test_iphone13_ami.jpg",
      "image/jpeg",
      `rma_${testRmaId}/item_${testItemId}`
    );

    expect(stored.storagePath).toBeDefined();
    expect(stored.thumbnailPath).toBeDefined();

    const [imageRecord] = await db
      .insert(itemImages)
      .values({
        rmaItemId: testItemId,
        imageType: "primary",
        storagePath: stored.storagePath,
        thumbnailPath: stored.thumbnailPath,
        previewPath: stored.previewPath,
        originalFilename: stored.originalFilename,
        mimeType: stored.mimeType,
        fileSizeBytes: stored.fileSizeBytes,
        checksumSha256: stored.checksumSha256,
        width: stored.width,
        height: stored.height,
        sortOrder: 1,
      })
      .returning();

    expect(imageRecord.id).toBeDefined();
    expect(imageRecord.rmaItemId).toBe(testItemId);
  });

  it("should process the display item through Task A, Task B, and synthesis", async () => {
    // Execute background processor directly
    await processRmaItem(testItemId);

    const [updatedItem] = await db
      .select()
      .from(rmaItems)
      .where(eq(rmaItems.id, testItemId));

    expect(updatedItem.status).toBe("suggested_match");
    expect(updatedItem.visualStatus).toBe("success");
    expect(updatedItem.vendorOcrStatus).toBe("success");

    // Task A result
    expect(updatedItem.predictedManufacturer).toBe("Apple");
    expect(updatedItem.predictedModel).toBe("iPhone 13 Pro");

    // Task B result
    expect(updatedItem.identifiedVendorId).toBeDefined();
    expect(updatedItem.identifiedVendorVariantId).toBeDefined();
  });

  it("should enforce completion rules: cannot complete RMA if items are unverified", async () => {
    // Current item is in 'suggested_match' status (not verified)
    const [item] = await db
      .select()
      .from(rmaItems)
      .where(eq(rmaItems.id, testItemId));

    expect(item.status).not.toBe("verified");

    // Verify unverified item count logic
    const unverifiedItems = await db
      .select()
      .from(rmaItems)
      .where(eq(rmaItems.rmaId, testRmaId));

    const incomplete = unverifiedItems.filter((i) => i.status !== "verified");
    expect(incomplete.length).toBeGreaterThan(0);
  });

  it("should allow manual review confirmation and update item status to verified", async () => {
    await db
      .update(rmaItems)
      .set({
        status: "verified",
        matchStatus: "manually_verified",
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rmaItems.id, testItemId));

    const [verifiedItem] = await db
      .select()
      .from(rmaItems)
      .where(eq(rmaItems.id, testItemId));

    expect(verifiedItem.status).toBe("verified");
    expect(verifiedItem.matchStatus).toBe("manually_verified");
  });

  afterAll(async () => {
    if (testRmaId) {
      await db.delete(rmas).where(eq(rmas.id, testRmaId));
    }
    if (testCustomerId) {
      await db.delete(customers).where(eq(customers.id, testCustomerId));
    }
  });
});
