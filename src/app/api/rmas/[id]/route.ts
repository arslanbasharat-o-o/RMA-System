import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  rmas,
  customers,
  returnReasons,
  rmaItems,
  itemImages,
  vendors,
  vendorVariants,
  displayCatalog,
  seededDisplayProducts,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { deriveInventoryMatchStatus } from "@/lib/recognition/seeded-inventory";
import { eq, asc, inArray } from "drizzle-orm";
import { z } from "zod";

const UpdateRmaSchema = z.object({
  status: z
    .enum([
      "draft",
      "receiving",
      "processing",
      "review_required",
      "completed",
      "archived",
    ])
    .optional(),
  notes: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  externalRmaNumber: z.string().optional().nullable(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const [rma] = await db
    .select({
      id: rmas.id,
      rmaNumber: rmas.rmaNumber,
      externalRmaNumber: rmas.externalRmaNumber,
      trackingNumber: rmas.trackingNumber,
      expectedDisplayCount: rmas.expectedDisplayCount,
      notes: rmas.notes,
      status: rmas.status,
      returnReasonNotes: rmas.returnReasonNotes,
      createdAt: rmas.createdAt,
      updatedAt: rmas.updatedAt,
      customerId: rmas.customerId,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      returnReasonId: rmas.returnReasonId,
      returnReasonLabel: returnReasons.label,
    })
    .from(rmas)
    .leftJoin(customers, eq(rmas.customerId, customers.id))
    .leftJoin(returnReasons, eq(rmas.returnReasonId, returnReasons.id))
    .where(eq(rmas.id, id));

  if (!rma) {
    return NextResponse.json({ error: "RMA record not found." }, { status: 404 });
  }

  // Fetch all items with their attached images and catalog links
  const items = await db
    .select({
      id: rmaItems.id,
      itemNumber: rmaItems.itemNumber,
      status: rmaItems.status,
      predictedManufacturer: rmaItems.predictedManufacturer,
      predictedModel: rmaItems.predictedModel,
      predictedDisplayAssembly: rmaItems.predictedDisplayAssembly,
      catalogDisplayId: rmaItems.catalogDisplayId,
      seededDisplayProductId: rmaItems.seededDisplayProductId,
      inventoryMatchStatus: rmaItems.inventoryMatchStatus,
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
      vendorOcrStatus: rmaItems.vendorOcrStatus,
      extractedTextSummary: rmaItems.extractedTextSummary,
      matchedCodesSummary: rmaItems.matchedCodesSummary,
      reviewNotes: rmaItems.reviewNotes,
      verifiedAt: rmaItems.verifiedAt,
      createdAt: rmaItems.createdAt,
    })
    .from(rmaItems)
    .leftJoin(vendors, eq(rmaItems.identifiedVendorId, vendors.id))
    .leftJoin(vendorVariants, eq(rmaItems.identifiedVendorVariantId, vendorVariants.id))
    .leftJoin(displayCatalog, eq(rmaItems.catalogDisplayId, displayCatalog.id))
    .leftJoin(seededDisplayProducts, eq(rmaItems.seededDisplayProductId, seededDisplayProducts.id))
    .where(eq(rmaItems.rmaId, id))
    .orderBy(asc(rmaItems.itemNumber));

  // Fetch all images for items in a single query (resolving N+1 performance issue)
  const itemIds = items.map((i) => i.id);
  const allImages = itemIds.length > 0
    ? await db
        .select()
        .from(itemImages)
        .where(inArray(itemImages.rmaItemId, itemIds))
        .orderBy(asc(itemImages.sortOrder))
    : [];

  const imagesByItemId = new Map<string, typeof allImages>();
  for (const img of allImages) {
    const list = imagesByItemId.get(img.rmaItemId) || [];
    list.push(img);
    imagesByItemId.set(img.rmaItemId, list);
  }

  const itemsWithImages = items.map((item) => {
    const images = imagesByItemId.get(item.id) || [];
    const inventoryMatchStatus = deriveInventoryMatchStatus(item);
    const isVerifiedMatch = inventoryMatchStatus === "matched" &&
      Boolean(item.seededDisplayProductId) &&
      Boolean(item.inventoryProductManufacturer);

    const seededProduct = isVerifiedMatch ? {
      id: item.seededDisplayProductId!,
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

    return {
      ...item,
      seededProduct,
      barcodeValue: seededProduct?.barcodeValue || null,
      supplierSku: seededProduct?.supplierSku || seededProduct?.printedTitle || null,
      inventoryMatchStatus,
      images,
      primaryThumbnail: images[0]?.thumbnailPath || null,
    };
  });

  const stats = {
    total: items.length,
    verified: items.filter((i) => i.status === "verified").length,
    reviewRequired: items.filter(
      (i) => i.status === "review_required" || i.status === "suggested_match"
    ).length,
    processing: items.filter(
      (i) => i.status === "processing" || i.status === "queued"
    ).length,
    failed: items.filter((i) => i.status === "failed").length,
  };

  return NextResponse.json({
    rma,
    items: itemsWithImages,
    stats,
  }, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateRmaSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.format() },
      { status: 400 }
    );
  }

  // Check completion rule: Cannot mark "completed" if unverified or unresolved items remain without explicit confirmation
  if (parsed.data.status === "completed") {
    const unverified = await db
      .select()
      .from(rmaItems)
      .where(eq(rmaItems.rmaId, id));

    const incomplete = unverified.filter((item) => item.status !== "verified");
    if (incomplete.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot complete RMA: ${incomplete.length} display items still require review or verification.`,
        },
        { status: 400 }
      );
    }
  }

  const [updated] = await db
    .update(rmas)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(rmas.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "RMA record not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, rma: updated });
}
