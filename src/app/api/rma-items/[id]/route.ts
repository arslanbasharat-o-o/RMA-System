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
import { eq, asc, desc } from "drizzle-orm";

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
    .where(eq(recognitionRuns.rmaItemId, id))
    .orderBy(desc(recognitionRuns.createdAt));

  const extractions = await db
    .select()
    .from(ocrExtractions)
    .where(eq(ocrExtractions.rmaItemId, id))
    .orderBy(desc(ocrExtractions.createdAt));

  const candidates = await db
    .select()
    .from(recognitionCandidates)
    .where(eq(recognitionCandidates.rmaItemId, id))
    .orderBy(asc(recognitionCandidates.rank));

  const reviews = await db
    .select()
    .from(reviewActions)
    .where(eq(reviewActions.rmaItemId, id))
    .orderBy(desc(reviewActions.createdAt));

  return NextResponse.json({
    item,
    images,
    runs,
    ocrExtractions: extractions,
    candidates,
    reviewHistory: reviews,
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
