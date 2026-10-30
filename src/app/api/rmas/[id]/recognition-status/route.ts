import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems, seededDisplayProducts } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { asc, eq } from "drizzle-orm";

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
    })
    .from(rmaItems)
    .leftJoin(seededDisplayProducts, eq(rmaItems.seededDisplayProductId, seededDisplayProducts.id))
    .where(eq(rmaItems.rmaId, id))
    .orderBy(asc(rmaItems.itemNumber));

  // Fallback lookup: if seededDisplayProductId was not linked but predictedModel exists, resolve barcode
  const needsFallback = items.filter((i) => !i.barcodeValue && i.predictedModel);
  let barcodeMap = new Map<string, { barcodeValue: string | null; supplierSku: string | null }>();

  if (needsFallback.length > 0) {
    const allSeeds = await db
      .select({
        modelName: seededDisplayProducts.modelName,
        printedTitle: seededDisplayProducts.printedTitle,
        barcodeValue: seededDisplayProducts.barcodeValue,
        supplierSku: seededDisplayProducts.supplierSku,
      })
      .from(seededDisplayProducts);

    for (const s of allSeeds) {
      if (s.modelName) {
        barcodeMap.set(s.modelName.toLowerCase().trim(), {
          barcodeValue: s.barcodeValue,
          supplierSku: s.supplierSku,
        });
      }
      if (s.printedTitle) {
        barcodeMap.set(s.printedTitle.toLowerCase().trim(), {
          barcodeValue: s.barcodeValue,
          supplierSku: s.supplierSku,
        });
      }
    }
  }

  const enrichedItems = items.map((i) => {
    let barcodeValue = i.barcodeValue;
    let supplierSku = i.supplierSku;

    if (!barcodeValue && i.predictedModel) {
      const match = barcodeMap.get(i.predictedModel.toLowerCase().trim());
      if (match) {
        barcodeValue = match.barcodeValue;
        supplierSku = match.supplierSku;
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
