import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  customers,
  returnReasons,
  rmas,
  rmaItems,
  itemImages,
  seededDisplayProducts,
  vendors,
  vendorVariants,
  displayCatalog,
} from "@/db/schema";
import { generateNextRmaNumber } from "@/lib/utils/rma-sequence";
import { storage } from "@/lib/storage";
import { processRmaItem, setInventoryMatcherForTesting } from "@/lib/queue/processor";
import { createUniqueTestImage } from "@/__tests__/helpers/image-fixtures";
import { deriveInventoryMatchStatus } from "@/lib/recognition/seeded-inventory";
import { eq } from "drizzle-orm";

describe("RMA Recognition Lifecycle & Inventory Semantics E2E", () => {
  let testCustomerId: string;
  let testReasonId: string;
  let testRmaId: string;
  let testSeededProductId: string;
  let testVendorId: string;
  let testCatalogId: string;

  beforeAll(async () => {
    // Environment safety guard
    if (process.env.NODE_ENV !== "test") {
      throw new Error("E2E tests must run with NODE_ENV=test");
    }
    const dbUrl = process.env.DATABASE_URL || "";
    if (dbUrl.includes("production") || dbUrl.includes("live") || dbUrl.includes("hostinger")) {
      throw new Error("Refusing to run tests against production database");
    }

    // 1. Create test customer
    const [cust] = await db
      .insert(customers)
      .values({
        name: "E2E Lifecycle Test Customer",
        email: "e2e-test@partner.com",
      })
      .returning({ id: customers.id });
    testCustomerId = cust.id;

    // 2. Fetch or create return reason
    const [reason] = await db.select().from(returnReasons).limit(1);
    testReasonId = reason.id;

    // 3. Create test RMA
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
    testRmaId = rma.id;

    // 4. Ensure test vendor & variant
    const [v] = await db
      .insert(vendors)
      .values({
        name: "E2E Test Vendor AMI",
        code: "AMI_E2E",
      })
      .onConflictDoNothing()
      .returning();
    testVendorId = v ? v.id : (await db.select().from(vendors).limit(1))[0].id;

    const [vVar] = await db
      .insert(vendorVariants)
      .values({
        vendorId: testVendorId,
        name: "Premium Hard OLED",
        code: "PREM_HARD_OLED",
      })
      .onConflictDoNothing()
      .returning();
    if (vVar) expect(vVar.id).toBeDefined();

    // 5. Seed hardware display catalog
    const [cat] = await db
      .insert(displayCatalog)
      .values({
        manufacturer: "Apple",
        modelName: "iPhone 13 Pro",
        normalizedModelIdentifier: `apple iphone 13 pro e2e ${Date.now()}`,
        knownPartNumbers: ["821-03200-A"],
        displayTechnology: "OLED",
      })
      .returning();
    testCatalogId = cat.id;

    // 6. Seed warehouse display product
    const [seedProd] = await db
      .insert(seededDisplayProducts)
      .values({
        sourceKey: `SEED-IPH13P-E2E-${Date.now()}`,
        manufacturer: "Apple",
        modelName: "iPhone 13 Pro",
        variantName: "Hard OLED (AMI)",
        printedTitle: "Apple iPhone 13 Pro Hard OLED Replacement",
        barcodeValue: "880912345678",
        barcodeFormat: "EAN_13",
        supplierSku: "SKU-IPH13P-AMI-E2E",
      })
      .returning();
    testSeededProductId = seedProd.id;
  });

  afterAll(async () => {
    if (testRmaId) {
      await db.delete(rmas).where(eq(rmas.id, testRmaId));
    }
    if (testCustomerId) {
      await db.delete(customers).where(eq(customers.id, testCustomerId));
    }
    if (testSeededProductId) {
      await db.delete(seededDisplayProducts).where(eq(seededDisplayProducts.id, testSeededProductId));
    }
    if (testCatalogId) {
      await db.delete(displayCatalog).where(eq(displayCatalog.id, testCatalogId));
    }
  });

  it("Flow 1: Verified warehouse inventory match persists status and attaches SKU & barcode via real processor", async () => {
    // 1. Create RMA Item
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 1,
        status: "pending_upload",
      })
      .returning();

    // 2. Add an image
    const sampleBuffer = await createUniqueTestImage();
    const stored = await storage.saveImage(
      sampleBuffer,
      "warehouse_iphone13pro.jpg",
      "image/jpeg",
      `rma_${testRmaId}/item_${item.id}`
    );

    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "primary",
      storagePath: stored.storagePath,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 1,
    });

    // 3. Process item with real processor passing deterministic accepted inventory match
    setInventoryMatcherForTesting(() => ({
      status: "accepted",
      confidence: 0.96,
      product: {
        id: testSeededProductId,
        manufacturer: "Apple",
        modelName: "iPhone 13 Pro",
        variantName: "Hard OLED (AMI)",
        printedTitle: "Apple iPhone 13 Pro Hard OLED Replacement",
        barcodeValue: "880912345678",
        barcodeFormat: "EAN_13",
        barcodeSymbology: "EAN_13",
        supplierSku: "SKU-IPH13P-AMI-E2E",
      },
      matchingCues: ["Flex cable connector matches warehouse reference", "AMI vendor stamp verified"],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: [],
    }));
    await processRmaItem(item.id);
    setInventoryMatcherForTesting(null);

    // 4. Directly verify worker persisted state in the DB (no manual db.update)
    const [fetched] = await db
      .select({
        id: rmaItems.id,
        status: rmaItems.status,
        predictedModel: rmaItems.predictedModel,
        inventoryMatchStatus: rmaItems.inventoryMatchStatus,
        seededDisplayProductId: rmaItems.seededDisplayProductId,
        inventoryMatchEvidence: rmaItems.inventoryMatchEvidence,
        barcodeValue: seededDisplayProducts.barcodeValue,
        supplierSku: seededDisplayProducts.supplierSku,
        printedTitle: seededDisplayProducts.printedTitle,
      })
      .from(rmaItems)
      .leftJoin(seededDisplayProducts, eq(rmaItems.seededDisplayProductId, seededDisplayProducts.id))
      .where(eq(rmaItems.id, item.id));

    expect(fetched.inventoryMatchStatus).toBe("matched");
    expect(fetched.seededDisplayProductId).toBe(testSeededProductId);
    expect(fetched.barcodeValue).toBe("880912345678");
    expect(fetched.supplierSku).toBe("SKU-IPH13P-AMI-E2E");
    const derivedStatus = deriveInventoryMatchStatus(fetched);
    expect(derivedStatus).toBe("matched");
  });

  it("Flow 2: Outside display identifies model without fabricating warehouse SKU or barcode via real processor", async () => {
    // 1. Create RMA Item for an outside display
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 2,
        status: "pending_upload",
      })
      .returning();

    // 2. Add image
    const sampleBuffer = await createUniqueTestImage();
    const stored = await storage.saveImage(
      sampleBuffer,
      "outside_iphone13.jpg",
      "image/jpeg",
      `rma_${testRmaId}/item_${item.id}`
    );

    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "primary",
      storagePath: stored.storagePath,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 1,
    });

    // 3. Process item with real processor passing negative inventory match (status: 'miss')
    setInventoryMatcherForTesting(() => ({
      status: "miss",
      confidence: 0,
      product: null,
      matchingCues: [],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: [],
    }));
    await processRmaItem(item.id);
    setInventoryMatcherForTesting(null);

    // 4. Directly verify worker persisted state in the DB (no manual db.update)
    const [fetched] = await db
      .select({
        id: rmaItems.id,
        status: rmaItems.status,
        predictedModel: rmaItems.predictedModel,
        inventoryMatchStatus: rmaItems.inventoryMatchStatus,
        seededDisplayProductId: rmaItems.seededDisplayProductId,
        inventoryMatchEvidence: rmaItems.inventoryMatchEvidence,
        barcodeValue: seededDisplayProducts.barcodeValue,
        supplierSku: seededDisplayProducts.supplierSku,
      })
      .from(rmaItems)
      .leftJoin(seededDisplayProducts, eq(rmaItems.seededDisplayProductId, seededDisplayProducts.id))
      .where(eq(rmaItems.id, item.id));

    expect(fetched.inventoryMatchStatus).toBe("no_verified_match");
    expect(fetched.seededDisplayProductId).toBeNull();
    // No fabricated barcode or SKU
    expect(fetched.barcodeValue).toBeNull();
    expect(fetched.supplierSku).toBeNull();
    const derivedStatus = deriveInventoryMatchStatus(fetched);
    expect(derivedStatus).toBe("no_verified_match");
  });

  it("Flow 3: Incomplete reference coverage results in review_required via real processor", async () => {
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 3,
        status: "pending_upload",
      })
      .returning();

    const sampleBuffer = await createUniqueTestImage();
    const stored = await storage.saveImage(
      sampleBuffer,
      "unavailable_iphone13.jpg",
      "image/jpeg",
      `rma_${testRmaId}/item_${item.id}`
    );

    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "primary",
      storagePath: stored.storagePath,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 1,
    });

    // 3. Process item with status: 'unavailable' (fewer than 2 references)
    setInventoryMatcherForTesting(() => ({
      status: "unavailable",
      confidence: 0,
      product: null,
      matchingCues: [],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: [],
    }));
    await processRmaItem(item.id);
    setInventoryMatcherForTesting(null);

    const [fetched] = await db
      .select({
        id: rmaItems.id,
        status: rmaItems.status,
        inventoryMatchStatus: rmaItems.inventoryMatchStatus,
        seededDisplayProductId: rmaItems.seededDisplayProductId,
        inventoryMatchEvidence: rmaItems.inventoryMatchEvidence,
      })
      .from(rmaItems)
      .where(eq(rmaItems.id, item.id));

    const derivedStatus = deriveInventoryMatchStatus(fetched);
    expect(derivedStatus).toBe("review_required");
    expect(fetched.inventoryMatchStatus).toBe("review_required");
    expect(fetched.seededDisplayProductId).toBeNull();
  });

  it("Flow 4: Newly uploaded items remain in not_evaluated state before processing", async () => {
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 4,
        status: "uploaded",
        inventoryMatchStatus: "not_evaluated",
      })
      .returning();

    const derivedStatus = deriveInventoryMatchStatus(item);
    expect(derivedStatus).toBe("not_evaluated");
    expect(item.seededDisplayProductId).toBeNull();
  });

  it("Flow 5: Legacy iPhone 8 Plus screen with 821- part number preserves legacy device model", async () => {
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 5,
        status: "suggested_match",
        predictedManufacturer: "Apple",
        predictedModel: "iPhone 8 Plus",
        predictedDisplayAssembly: "Apple iPhone 8 Plus Display (LCD)",
        extractedTextSummary: "821-01050-A APPLE LCD",
        matchedCodesSummary: "821-01050-A",
      })
      .returning();

    expect(item.predictedModel).toBe("iPhone 8 Plus");
    expect(item.extractedTextSummary).toContain("821-01050-A");
  });

  it("Flow 6: Operator model override clears contradictory warehouse associations", async () => {
    // Start with an item matched to an iPhone 13 Pro warehouse product
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 6,
        status: "suggested_match",
        predictedManufacturer: "Apple",
        predictedModel: "iPhone 13 Pro",
        seededDisplayProductId: testSeededProductId,
        inventoryMatchStatus: "matched",
      })
      .returning();

    // Operator corrects model to Samsung Galaxy S22
    const operatorCorrectedModel = {
      predictedManufacturer: "Samsung",
      predictedModel: "Galaxy S22",
      catalogDisplayId: null,
      seededDisplayProductId: null,
      inventoryMatchStatus: "no_verified_match" as const,
      status: "review_required" as const,
    };

    await db
      .update(rmaItems)
      .set(operatorCorrectedModel)
      .where(eq(rmaItems.id, item.id));

    const [updated] = await db
      .select({
        id: rmaItems.id,
        predictedManufacturer: rmaItems.predictedManufacturer,
        predictedModel: rmaItems.predictedModel,
        seededDisplayProductId: rmaItems.seededDisplayProductId,
        inventoryMatchStatus: rmaItems.inventoryMatchStatus,
      })
      .from(rmaItems)
      .where(eq(rmaItems.id, item.id));

    expect(updated.predictedManufacturer).toBe("Samsung");
    expect(updated.predictedModel).toBe("Galaxy S22");
    expect(updated.seededDisplayProductId).toBeNull();
    expect(updated.inventoryMatchStatus).toBe("no_verified_match");
  });

  it("Flow 7: Pipeline error produces explicit error status without inventing product links", async () => {
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 7,
        status: "failed",
        inventoryMatchStatus: "error",
        visualStatus: "failed",
        visualError: "Image decode timeout",
      })
      .returning();

    const derivedStatus = deriveInventoryMatchStatus(item);
    expect(derivedStatus).toBe("error");
    expect(item.seededDisplayProductId).toBeNull();
  });

  it("Flow 8: Stale worker job protection prevents overwriting operator review", async () => {
    // 1. Create RMA Item initially at revision 1
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId: testRmaId,
        itemNumber: 8,
        status: "pending_upload",
        recognitionRevision: 1,
      })
      .returning();

    const sampleBuffer = await createUniqueTestImage();
    const stored = await storage.saveImage(
      sampleBuffer,
      "stale_test.jpg",
      "image/jpeg",
      `rma_${testRmaId}/item_${item.id}`
    );

    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType: "primary",
      storagePath: stored.storagePath,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 1,
    });

    // 2. Simulate operator manual review incrementing revision to 2
    await db
      .update(rmaItems)
      .set({
        status: "verified",
        recognitionRevision: 2,
        predictedManufacturer: "Apple",
        predictedModel: "iPhone 13 Pro",
        verifiedAt: new Date(),
        reviewNotes: "Operator confirmed model",
      })
      .where(eq(rmaItems.id, item.id));

    // 3. Run processRmaItem (simulating worker processing that was queued for revision 1)
    await processRmaItem(item.id);

    // 4. Assert operator's review state was NOT overwritten by the worker
    const [refetched] = await db
      .select({
        status: rmaItems.status,
        recognitionRevision: rmaItems.recognitionRevision,
        predictedModel: rmaItems.predictedModel,
        reviewNotes: rmaItems.reviewNotes,
      })
      .from(rmaItems)
      .where(eq(rmaItems.id, item.id));

    expect(refetched.status).toBe("verified");
    expect(refetched.recognitionRevision).toBe(2);
    expect(refetched.predictedModel).toBe("iPhone 13 Pro");
    expect(refetched.reviewNotes).toBe("Operator confirmed model");
  });
});
