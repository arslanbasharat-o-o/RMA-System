import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { db } from "@/db";
import {
  users,
  sessions,
  customers,
  rmas,
  rmaItems,
  returnReasons,
  displayCatalog,
  seededDisplayProducts,
  seededDisplayReferences,
  itemImages,
} from "@/db/schema";
import { createSessionToken } from "@/lib/auth/session";
import { processRmaItem } from "@/lib/queue/processor";
import { storage } from "@/lib/storage";
import { createUniqueTestImage } from "@/__tests__/helpers/image-fixtures";
import * as seededMatcher from "@/lib/recognition/seeded-inventory";
import { MockLensProvider } from "@/lib/recognition/lens/mock";
import { OpenAiVisionOcrService } from "@/lib/recognition/openai/vision";
import { seedDisplayInventory } from "@/db/seed-display-inventory";
import { GET } from "@/app/api/rma-items/[id]/route";

describe("Seeded Inventory Processor Integration & Audit Regressions", () => {
  let userId = "";
  let customerId = "";
  let reasonId = "";
  let rmaId = "";
  let token = "";
  let seededProductId = "";
  let catalogDisplayId = "";
  const createdItemIds: string[] = [];
  const storedPaths: string[] = [];
  let itemCounter = 0;

  beforeAll(async () => {
    const key = crypto.randomUUID();
    const [user] = await db
      .insert(users)
      .values({
        email: `seeded-qa-${key}@example.test`,
        name: "Seeded QA Admin",
        passwordHash: "unused-hash",
        role: "admin",
      })
      .returning();
    userId = user.id;
    token = await createSessionToken({ userId, email: user.email, name: user.name, role: "admin" });

    const [customer] = await db.insert(customers).values({ name: `Seeded QA Customer ${key}` }).returning();
    customerId = customer.id;

    const [reason] = await db.insert(returnReasons).values({ code: `SMR-${key}`, label: "Seeded QA Reason" }).returning();
    reasonId = reason.id;

    const [rma] = await db.insert(rmas).values({ rmaNumber: `RMA-SMR-${key}`, customerId, returnReasonId: reasonId }).returning();
    rmaId = rma.id;

    // Seed a catalog model for Apple iPhone 14
    const [cat] = await db
      .insert(displayCatalog)
      .values({
        manufacturer: "Apple",
        modelName: "iPhone 14",
        normalizedModelIdentifier: "apple iphone 14",
        aliases: ["A2882", "iPhone 14"],
        knownPartNumbers: ["APL-IP14-01"],
        isActive: true,
      })
      .returning();
    catalogDisplayId = cat.id;

    // Seed a catalog model for Samsung Galaxy A15 with known part number
    await db
      .insert(displayCatalog)
      .values({
        manufacturer: "Samsung",
        modelName: "Galaxy A15",
        normalizedModelIdentifier: "samsung galaxy a15",
        aliases: ["SM-A155F", "Galaxy A15"],
        knownPartNumbers: ["GH96-12345A"],
        isActive: true,
      })
      .onConflictDoNothing();

    // Create a seeded product and reference in seeded_display_products
    const [seededProduct] = await db
      .insert(seededDisplayProducts)
      .values({
        sourceKey: `test-seed-key-${key}`,
        manufacturer: "Apple",
        modelName: "iPhone 14",
        variantName: "OLED",
        printedTitle: "iPhone 14 OLED Premium",
        barcodeValue: "665386615240",
        barcodeFormat: "UPC-A digits",
        barcodeSymbology: "CODE128",
        supplierSku: "TX-IP14-OLED",
        otherCodes: [{ value: "BOX-123", source: "box", category: "sticker" }],
        isActive: true,
      })
      .returning();
    seededProductId = seededProduct.id;

    const dummySeedImage = await storage.saveImage(
      await createUniqueTestImage(),
      "seed-ref-1.jpg",
      "image/jpeg",
      `seeded-qa/${key}`
    );
    storedPaths.push(dummySeedImage.storagePath);

    await db
      .insert(seededDisplayReferences)
      .values({
        productId: seededProductId,
        sourceDisplayId: `DSP-QA-${key}`,
        sourceImageId: `IMG-QA-${key}`,
        storagePath: dummySeedImage.storagePath,
        checksumSha256: dummySeedImage.checksumSha256,
        isMatchable: true,
      });

    // Insert a second reference for the minimum reference count
    const dummySeedImage2 = await storage.saveImage(
      await createUniqueTestImage(),
      "seed-ref-2.jpg",
      "image/jpeg",
      `seeded-qa/${key}-2`
    );
    storedPaths.push(dummySeedImage2.storagePath);
    await db
      .insert(seededDisplayReferences)
      .values({
        productId: seededProductId,
        sourceDisplayId: `DSP-QA-2-${key}`,
        sourceImageId: `IMG-QA-2-${key}`,
        storagePath: dummySeedImage2.storagePath,
        checksumSha256: dummySeedImage2.checksumSha256,
        isMatchable: true,
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (rmaId) await db.delete(rmas).where(eq(rmas.id, rmaId));
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    if (reasonId) await db.delete(returnReasons).where(eq(returnReasons.id, reasonId));
    if (seededProductId) await db.delete(seededDisplayProducts).where(eq(seededDisplayProducts.id, seededProductId));
    if (catalogDisplayId) await db.delete(displayCatalog).where(eq(displayCatalog.id, catalogDisplayId));
    if (userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    await Promise.all(storedPaths.map((p) => storage.deleteImage(p)));
  });

  async function createItemWithPhoto(imageType: "primary" | "back" | "flex_cable" | "stamp_closeup" | "sticker_closeup" = "back") {
    const [item] = await db
      .insert(rmaItems)
      .values({
        rmaId,
        itemNumber: ++itemCounter,
        status: "pending_upload",
      })
      .returning();
    createdItemIds.push(item.id);

    const stored = await storage.saveImage(
      await createUniqueTestImage(),
      `item-${item.id}.jpg`,
      "image/jpeg",
      `seeded-qa-item/${item.id}`
    );
    storedPaths.push(stored.storagePath);

    await db.insert(itemImages).values({
      rmaItemId: item.id,
      imageType,
      storagePath: stored.storagePath,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      sortOrder: 0,
    });

    return item;
  }

  it("P1 & Goal: Accepted seed match bypasses Lens, attaches UPC/SKU, and populates API seededProduct", async () => {
    const item = await createItemWithPhoto("back");
    const lensSpy = vi.spyOn(MockLensProvider.prototype, "identifyDisplay");

    vi.spyOn(seededMatcher, "matchSeededInventoryProduct").mockResolvedValue({
      status: "accepted",
      product: {
        id: seededProductId,
        manufacturer: "Apple",
        modelName: "iPhone 14",
        variantName: "OLED",
        printedTitle: "iPhone 14 OLED Premium",
        barcodeValue: "665386615240",
        barcodeFormat: "UPC-A digits",
        barcodeSymbology: "CODE128",
        supplierSku: "TX-IP14-OLED",
      },
      confidence: 0.94,
      matchingCues: ["connector pin pattern identical", "steel plate engraving matches"],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: ["DSP-QA-1"],
    });

    await processRmaItem(item.id, { force: true });

    // Google Lens must be bypassed on accepted seed hit
    expect(lensSpy).not.toHaveBeenCalled();

    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updated.seededDisplayProductId).toBe(seededProductId);
    expect(updated.predictedManufacturer).toBe("Apple");
    expect(updated.predictedModel).toBe("iPhone 14");
    expect(updated.predictedDisplayAssembly).toBe("iPhone 14 OLED Display");
    expect(updated.inventoryMatchConfidence).toBeCloseTo(0.94, 2);
    expect(updated.inventoryMatchEvidence).toEqual({
      matchingCues: ["connector pin pattern identical", "steel plate engraving matches"],
      conflictingCues: [],
      unresolvedAlternatives: [],
    });
    expect(updated.reviewNotes).toContain("Seeded inventory comparison matched iPhone 14 OLED Premium");
    expect(updated.reviewNotes).toContain("UPC/EAN and supplier SKU below come from the seeded box record; they were not read from this uploaded photo");

    // Check GET API route returns seededProduct
    const req = new NextRequest(`http://localhost/api/rma-items/${item.id}`, {
      headers: { cookie: `rma_session=${token}` },
    });
    const res = await GET(req, { params: Promise.resolve({ id: item.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.seededProduct).toBeTruthy();
    expect(body.item.seededProduct.barcodeValue).toBe("665386615240");
    expect(body.item.seededProduct.supplierSku).toBe("TX-IP14-OLED");
    expect(body.item.seededProduct.printedTitle).toBe("iPhone 14 OLED Premium");
  });

  it("Goal: Miss or error falls back to Google Lens and leaves seeded UPC/SKU unattached", async () => {
    const item = await createItemWithPhoto("back");
    const lensSpy = vi.spyOn(MockLensProvider.prototype, "identifyDisplay");

    vi.spyOn(seededMatcher, "matchSeededInventoryProduct").mockResolvedValue({
      status: "miss",
      product: null,
      confidence: 0,
      matchingCues: [],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: [],
    });

    await processRmaItem(item.id, { force: true });

    // Google Lens was called as fallback
    expect(lensSpy).toHaveBeenCalled();

    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    expect(updated.seededDisplayProductId).toBeNull();
    expect(updated.inventoryMatchConfidence).toBeNull();
    expect(updated.inventoryMatchEvidence).toBeNull();
    expect(updated.reviewNotes).toContain("No seeded catalog product matched the uploaded back photo; the existing model-identification flow was used and no seeded UPC/EAN or SKU was attached");
  });

  it("P1: Contradictory OCR part number withholds seeded UPC/SKU and sets ambiguous review_required", async () => {
    const item = await createItemWithPhoto("back");

    // Visual comparison accepted iPhone 14
    vi.spyOn(seededMatcher, "matchSeededInventoryProduct").mockResolvedValue({
      status: "accepted",
      product: {
        id: seededProductId,
        manufacturer: "Apple",
        modelName: "iPhone 14",
        variantName: "OLED",
        printedTitle: "iPhone 14 OLED Premium",
        barcodeValue: "665386615240",
        barcodeFormat: "UPC-A digits",
        barcodeSymbology: "CODE128",
        supplierSku: "TX-IP14-OLED",
      },
      confidence: 0.95,
      matchingCues: ["connector pin pattern identical"],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: ["DSP-QA-1"],
    });

    // But OCR extracts part number GH96-12345A (Samsung Galaxy A15)
    vi.spyOn(OpenAiVisionOcrService.prototype, "extractMarkings").mockResolvedValue({
      rawResponse: {},
      structured: {
        raw_text: ["GH96-12345A SEC"],
        detected_codes: ["GH96-12345A"],
        part_numbers: ["GH96-12345A"],
        vendor_markings: [],
        technology_markings: [],
        possible_vendor_aliases: [],
        unreadable_regions: [],
        extraction_notes: [],
      },
      model: "mock-ocr",
      durationMs: 10,
    });

    await processRmaItem(item.id, { force: true });

    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    // Seeded UPC/SKU must be withheld due to contradictory OCR evidence
    expect(updated.seededDisplayProductId).toBeNull();
    expect(updated.inventoryMatchConfidence).toBeNull();
    expect(updated.inventoryMatchEvidence).toBeNull();
    expect(updated.status).toBe("review_required");
    expect(updated.matchStatus).toBe("ambiguous");
    expect(updated.reviewNotes).toContain("Seeded catalog UPC/EAN and SKU were withheld due to contradictory OCR model evidence");
  });

  it("P1: OCR-only retry clears retained seeded product details when OCR identifies a different model", async () => {
    const item = await createItemWithPhoto("back");

    // Manually prime the item as having accepted seed product details
    await db.update(rmaItems).set({
      seededDisplayProductId: seededProductId,
      inventoryMatchConfidence: 0.93,
      inventoryMatchEvidence: { matchingCues: ["cues"], conflictingCues: [], unresolvedAlternatives: [] },
      predictedManufacturer: "Apple",
      predictedModel: "iPhone 14",
    }).where(eq(rmaItems.id, item.id));

    // OCR retry extracts a part number for Samsung Galaxy A15
    vi.spyOn(OpenAiVisionOcrService.prototype, "extractMarkings").mockResolvedValue({
      rawResponse: {},
      structured: {
        raw_text: ["GH96-12345A SEC"],
        detected_codes: ["GH96-12345A"],
        part_numbers: ["GH96-12345A"],
        vendor_markings: [],
        technology_markings: [],
        possible_vendor_aliases: [],
        unreadable_regions: [],
        extraction_notes: [],
      },
      model: "mock-ocr",
      durationMs: 10,
    });

    // Run vendor_ocr retry only
    await processRmaItem(item.id, { pipeline: "vendor_ocr" });

    const [updated] = await db.select().from(rmaItems).where(eq(rmaItems.id, item.id));
    // The retained seed product link and confidence/evidence must be cleared
    expect(updated.seededDisplayProductId).toBeNull();
    expect(updated.inventoryMatchConfidence).toBeNull();
    expect(updated.inventoryMatchEvidence).toBeNull();
    expect(updated.reviewNotes).toContain("The seeded product link and catalog UPC/SKU were cleared because of a contradiction");
  });

  it("P2: Seed manifest deactivates explicitly excluded samples and rejects overlaps", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rma-seed-test-"));
    const imgDir = path.join(tmpDir, "images");
    await fs.mkdir(imgDir, { recursive: true });
    await fs.writeFile(path.join(imgDir, "sample1.jpg"), Buffer.from("fake-jpg"));

    const prevDir = process.env.DISPLAY_INVENTORY_SEED_DIR;
    process.env.DISPLAY_INVENTORY_SEED_DIR = tmpDir;

    try {
      // Overlapping sample test: sample1 is in both products and excludedSamples
      const overlappingManifest = {
        version: 1,
        excludedSamples: [{ displayId: "SAMPLE-01", imageId: "IMG-01", reason: "Package back" }],
        products: [
          {
            sourceKey: "PROD-01",
            manufacturer: "Apple",
            modelName: "iPhone 15",
            variantName: "Soft",
            printedTitle: "iPhone 15 Soft",
            barcodeValue: "111222333",
            barcodeFormat: "UPC-A",
            barcodeSymbology: "CODE128",
            supplierSku: "IP15-SFT",
            otherCodes: [],
            references: [
              {
                displayId: "SAMPLE-01",
                imageId: "IMG-01",
                imagePath: "images/sample1.jpg",
                crop: {},
                readableMarkings: [],
              },
            ],
          },
        ],
      };

      await fs.writeFile(path.join(tmpDir, "manifest.json"), JSON.stringify(overlappingManifest));

      // Must throw overlap error
      await expect(seedDisplayInventory(["--allow-remote"])).rejects.toThrow(
        /is both included in products and marked as excluded/
      );

      // Deactivation test: mark seededReferenceId's displayId as excluded
      const deactivationManifest = {
        version: 1,
        excludedSamples: [{ displayId: `DSP-QA-${userId.slice(0, 8)}`, imageId: "IMG-DEACT", reason: "Unsuitable crop" }],
        products: [],
      };
      await fs.writeFile(path.join(tmpDir, "manifest.json"), JSON.stringify(deactivationManifest));

      // Insert reference to be deactivated
      await db.insert(seededDisplayReferences).values({
        productId: seededProductId,
        sourceDisplayId: `DSP-QA-${userId.slice(0, 8)}`,
        sourceImageId: "IMG-DEACT",
        storagePath: storedPaths[0],
        checksumSha256: "fake-sha",
        isMatchable: true,
      }).onConflictDoNothing();

      // Run apply
      await seedDisplayInventory(["--apply", "--allow-remote"]);

      // Verify reference is now deactivated (isMatchable = false)
      const [deactivated] = await db
        .select()
        .from(seededDisplayReferences)
        .where(eq(seededDisplayReferences.sourceDisplayId, `DSP-QA-${userId.slice(0, 8)}`));
      expect(deactivated.isMatchable).toBe(false);
    } finally {
      process.env.DISPLAY_INVENTORY_SEED_DIR = prevDir;
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
