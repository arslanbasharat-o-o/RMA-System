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
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { storage } from "@/lib/storage";
import { getManualModelOverride } from "@/lib/recognition/manual-model";
import { eq, asc, desc, and, inArray, lte } from "drizzle-orm";

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

  const latestOcrRun = runs.find((run) => run.pipelineType === "vendor_ocr");
  const currentOcrRunIds = runs.filter((run) =>
    run.pipelineType === "vendor_ocr" && run.recognitionRevision === latestOcrRun?.recognitionRevision
  ).map((run) => run.id);
  const extractions = currentOcrRunIds.length ? await db
    .select()
    .from(ocrExtractions)
    .where(and(eq(ocrExtractions.rmaItemId, id), inArray(ocrExtractions.recognitionRunId, currentOcrRunIds)))
    .orderBy(desc(ocrExtractions.createdAt)) : [];

  const latestVisualRun = runs.find((run) => run.pipelineType === "visual");
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

  const reviews = await db
    .select()
    .from(reviewActions)
    .where(eq(reviewActions.rmaItemId, id))
    .orderBy(desc(reviewActions.createdAt));

  return NextResponse.json({
    item: {
      ...item,
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
