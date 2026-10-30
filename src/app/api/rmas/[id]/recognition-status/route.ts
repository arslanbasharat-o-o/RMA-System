import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems, seededDisplayProducts } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { asc, eq } from "drizzle-orm";
import { matchSeededProductByText } from "@/lib/recognition/seeded-inventory";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const items = await db
    .select({
      id: rmaItems.id,
      itemNumber: rmaItems.itemNumber,
      status: rmaItems.status,
      predictedModel: rmaItems.predictedModel,
      matchStatus: rmaItems.matchStatus,
      seededDisplayProductId: rmaItems.seededDisplayProductId,
      barcodeValue: seededDisplayProducts.barcodeValue,
      supplierSku: seededDisplayProducts.supplierSku,
      printedTitle: seededDisplayProducts.printedTitle,
    })
    .from(rmaItems)
    .leftJoin(seededDisplayProducts, eq(rmaItems.seededDisplayProductId, seededDisplayProducts.id))
    .where(eq(rmaItems.rmaId, id))
    .orderBy(asc(rmaItems.itemNumber));

  // Fallback lookup: if barcodeValue was not linked directly, resolve via catalog model matching
  const needsFallback = items.filter((i) => !i.barcodeValue && i.predictedModel);
  let allSeeds: Array<{
    id: string;
    manufacturer: string;
    modelName: string;
    variantName: string | null;
    printedTitle: string;
    barcodeValue: string | null;
    supplierSku: string | null;
  }> = [];

  if (needsFallback.length > 0) {
    allSeeds = await db
      .select({
        id: seededDisplayProducts.id,
        manufacturer: seededDisplayProducts.manufacturer,
        modelName: seededDisplayProducts.modelName,
        variantName: seededDisplayProducts.variantName,
        printedTitle: seededDisplayProducts.printedTitle,
        barcodeValue: seededDisplayProducts.barcodeValue,
        supplierSku: seededDisplayProducts.supplierSku,
      })
      .from(seededDisplayProducts);
  }

  const enrichedItems = items.map((i) => {
    let barcodeValue = i.barcodeValue;
    let supplierSku = i.supplierSku || i.printedTitle;

    if (!barcodeValue && i.predictedModel && allSeeds.length > 0) {
      const match = matchSeededProductByText(i.predictedModel, allSeeds);
      if (match) {
        barcodeValue = match.barcodeValue;
        supplierSku = match.supplierSku || match.printedTitle;
      }
    }

    return {
      id: i.id,
      itemNumber: i.itemNumber,
      status: i.status,
      predictedModel: i.predictedModel,
      matchStatus: i.matchStatus,
      barcodeValue: barcodeValue || null,
      supplierSku: supplierSku || null,
    };
  });

  return NextResponse.json({ items: enrichedItems }, {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}
