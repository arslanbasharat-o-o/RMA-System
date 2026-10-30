import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  rmaItems,
  itemImages,
  recognitionRuns,
  ocrExtractions,
  recognitionCandidates,
  reviewActions,
  vendors,
  vendorVariants,
  displayCatalog,
  seededDisplayProducts,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { storage } from "@/lib/storage";
import { getManualModelOverride } from "@/lib/recognition/manual-model";
import { eq, asc, desc, and, inArray, lte, or, ilike } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const [item] = await db
    .select({
      id: rmaItems.id,
      rmaId: rmaItems.rmaId,
      itemNumber: rmaItems.itemNumber,
      status: rmaItems.status,
      predictedManufacturer: rmaItems.predictedManufacturer,
      predictedModel: rmaItems.predictedModel,
      predictedDisplayAssembly: rmaItems.predictedDisplayAssembly,
      catalogDisplayId: rmaItems.catalogDisplayId,
      seededDisplayProductId: rmaItems.seededDisplayProductId,
      inventoryMatchConfidence: rmaItems.inventoryMatchConfidence,
      inventoryMatchEvidence: rmaItems.inventoryMatchEvidence,
      inventoryProductManufacturer: seededDisplayProducts.manufacturer,
      inventoryProductModelName: seededDisplayProducts.modelName,
      inventoryProductVariantName: seededDisplayProducts.variantName,
      inventoryProductPrintedTitle: seededDisplayProducts.printedTitle,
      inventoryProductBarcodeValue: seededDisplayProducts.barcodeValue,
      inventoryProductBarcodeFormat: seededDisplayProducts.barcodeFormat,
      inventoryProductBarcodeSymbology: seededDisplayProducts.barcodeSymbology,
      inventoryProductSupplierSku: seededDisplayProducts.supplierSku,
      inventoryProductOtherCodes: seededDisplayProducts.otherCodes,
      internalSku: displayCatalog.internalSku,
      catalogModelName: displayCatalog.modelName,
      displayTechnology: displayCatalog.displayTechnology,
      identifiedVendorId: rmaItems.identifiedVendorId,
      identifiedVendorVariantId: rmaItems.identifiedVendorVariantId,
      identifiedVendorName: vendors.name,
      identifiedVendorVariantName: vendorVariants.name,
      matchStatus: rmaItems.matchStatus,
      modelConfidenceScore: rmaItems.modelConfidenceScore,
      vendorConfidenceScore: rmaItems.vendorConfidenceScore,
      visualStatus: rmaItems.visualStatus,
      visualError: rmaItems.visualError,
      vendorOcrStatus: rmaItems.vendorOcrStatus,
      vendorOcrError: rmaItems.vendorOcrError,
      extractedTextSummary: rmaItems.extractedTextSummary,
      matchedCodesSummary: rmaItems.matchedCodesSummary,
      reviewNotes: rmaItems.reviewNotes,
      verifiedByUserId: rmaItems.verifiedByUserId,
      verifiedAt: rmaItems.verifiedAt,
      createdAt: rmaItems.createdAt,
      updatedAt: rmaItems.updatedAt,
      recognitionRevision: rmaItems.recognitionRevision,
    })
    .from(rmaItems)
    .leftJoin(vendors, eq(rmaItems.identifiedVendorId, vendors.id))
    .leftJoin(vendorVariants, eq(rmaItems.identifiedVendorVariantId, vendorVariants.id))
    .leftJoin(displayCatalog, eq(rmaItems.catalogDisplayId, displayCatalog.id))
    .leftJoin(seededDisplayProducts, eq(rmaItems.seededDisplayProductId, seededDisplayProducts.id))
    .where(eq(rmaItems.id, id));

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const images = await db
    .select()
    .from(itemImages)
    .where(eq(itemImages.rmaItemId, id))
    .orderBy(asc(itemImages.sortOrder));

  const runs = await db
    .select()
    .from(recognitionRuns)
    .where(and(eq(recognitionRuns.rmaItemId, id), lte(recognitionRuns.recognitionRevision, item.recognitionRevision)))
    .orderBy(desc(recognitionRuns.recognitionRevision), desc(recognitionRuns.createdAt));

  const reviews = await db.select().from(reviewActions)
    .where(eq(reviewActions.rmaItemId, id)).orderBy(desc(reviewActions.createdAt));
  const evidenceFloor = reviews.reduce((floor, review) => {
    const state = review.newState as { recognition_revision?: unknown } | null;
    return review.actionType === "remove_photo" && typeof state?.recognition_revision === "number"
      ? Math.max(floor, state.recognition_revision) : floor;
  }, 0);
  // Keep historical runs for audit, but never show evidence from a removed photo,
  // including a stale worker that finishes after the deletion was committed.
  const eligibleRuns = runs.filter((run) => run.recognitionRevision >= evidenceFloor);
  const latestOcrRun = eligibleRuns.find((run) => run.pipelineType === "vendor_ocr");
  const currentOcrRunIds = eligibleRuns.filter((run) =>
    run.pipelineType === "vendor_ocr" && run.recognitionRevision === latestOcrRun?.recognitionRevision
  ).map((run) => run.id);
  const extractions = currentOcrRunIds.length ? await db
    .select()
    .from(ocrExtractions)
    .where(and(eq(ocrExtractions.rmaItemId, id), inArray(ocrExtractions.recognitionRunId, currentOcrRunIds)))
    .orderBy(desc(ocrExtractions.createdAt)) : [];

  const latestVisualRun = eligibleRuns.find((run) => run.pipelineType === "visual");
  const candidates = latestVisualRun ? await db
    .select()
    .from(recognitionCandidates)
    .where(and(eq(recognitionCandidates.rmaItemId, id), eq(recognitionCandidates.recognitionRunId, latestVisualRun.id)))
    .orderBy(asc(recognitionCandidates.rank)) : [];

  // Older cleaners could reorder titles. Prefer the saved provider's original
  // title at the source rank so the inspection evidence is faithful.
  const rawVisualResponse = latestVisualRun?.rawResponse as Record<string, unknown> | null;
  const sourceMatches = Array.isArray(rawVisualResponse?.visual_matches)
    ? rawVisualResponse.visual_matches as Array<{ title?: unknown }> : [];
  const currentCandidates = candidates.map((candidate) => {
    const title = sourceMatches[(candidate.rank || 1) - 1]?.title;
    return { ...candidate, candidateTitle: typeof title === "string" ? title : candidate.candidateTitle };
  });

  let seededProduct = item.seededDisplayProductId ? {
    id: item.seededDisplayProductId,
    manufacturer: item.inventoryProductManufacturer,
    modelName: item.inventoryProductModelName,
    variantName: item.inventoryProductVariantName,
    printedTitle: item.inventoryProductPrintedTitle,
    barcodeValue: item.inventoryProductBarcodeValue,
    barcodeFormat: item.inventoryProductBarcodeFormat,
    barcodeSymbology: item.inventoryProductBarcodeSymbology,
    supplierSku: item.inventoryProductSupplierSku,
    otherCodes: item.inventoryProductOtherCodes,
  } : null;

  if (!seededProduct && (item.predictedModel || item.predictedDisplayAssembly)) {
    const candidateQuery = (item.predictedModel || item.predictedDisplayAssembly || "").trim();
    const [matchedSeed] = await db
      .select()
      .from(seededDisplayProducts)
      .where(or(
        ilike(seededDisplayProducts.modelName, candidateQuery),
        ilike(seededDisplayProducts.printedTitle, candidateQuery)
      ))
      .limit(1);

    if (matchedSeed) {
      seededProduct = {
        id: matchedSeed.id,
        manufacturer: matchedSeed.manufacturer,
        modelName: matchedSeed.modelName,
        variantName: matchedSeed.variantName,
        printedTitle: matchedSeed.printedTitle,
        barcodeValue: matchedSeed.barcodeValue,
        barcodeFormat: matchedSeed.barcodeFormat,
        barcodeSymbology: matchedSeed.barcodeSymbology,
        supplierSku: matchedSeed.supplierSku,
        otherCodes: matchedSeed.otherCodes,
      };
    }
  }

  return NextResponse.json({
    item: {
      ...item,
      seededProduct,
      barcodeValue: seededProduct?.barcodeValue || null,
      supplierSku: seededProduct?.supplierSku || seededProduct?.printedTitle || null,
      modelSource: getManualModelOverride(reviews)?.predictedModel === item.predictedModel ? "manual" : "recognition",
    },
    images,
    runs,
    ocrExtractions: extractions,
    candidates: currentCandidates,
    reviewHistory: reviews,
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const [existing] = await db
    .select({ id: rmaItems.id, rmaId: rmaItems.rmaId })
    .from(rmaItems)
    .where(eq(rmaItems.id, id));

  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const imagesToDelete = await db
    .select({
      storagePath: itemImages.storagePath,
      thumbnailPath: itemImages.thumbnailPath,
      previewPath: itemImages.previewPath,
    })
    .from(itemImages)
    .where(eq(itemImages.rmaItemId, id));

  await db.delete(rmaItems).where(eq(rmaItems.id, id));

  for (const img of imagesToDelete) {
    if (img.storagePath) await storage.deleteImage(img.storagePath);
    if (img.thumbnailPath) await storage.deleteImage(img.thumbnailPath);
    if (img.previewPath) await storage.deleteImage(img.previewPath);
  }

  return NextResponse.json({
    success: true,
    message: "Item deleted successfully",
    deletedItemId: id,
    rmaId: existing.rmaId,
  });
}
