import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems, seededDisplayProducts } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { deriveInventoryMatchStatus } from "@/lib/recognition/seeded-inventory";
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
      inventoryMatchStatus: rmaItems.inventoryMatchStatus,
      inventoryMatchEvidence: rmaItems.inventoryMatchEvidence,
      seededDisplayProductId: rmaItems.seededDisplayProductId,
      barcodeValue: seededDisplayProducts.barcodeValue,
      supplierSku: seededDisplayProducts.supplierSku,
      printedTitle: seededDisplayProducts.printedTitle,
    })
    .from(rmaItems)
    .leftJoin(seededDisplayProducts, eq(rmaItems.seededDisplayProductId, seededDisplayProducts.id))
    .where(eq(rmaItems.rmaId, id))
    .orderBy(asc(rmaItems.itemNumber));

  const enrichedItems = items.map((i) => {
    const inventoryMatchStatus = deriveInventoryMatchStatus(i);
    const isVerifiedMatch = inventoryMatchStatus === "matched" && Boolean(i.seededDisplayProductId);
    return {
      id: i.id,
      itemNumber: i.itemNumber,
      status: i.status,
      predictedModel: i.predictedModel,
      matchStatus: i.matchStatus,
      barcodeValue: isVerifiedMatch ? (i.barcodeValue || null) : null,
      supplierSku: isVerifiedMatch ? ((i.supplierSku || i.printedTitle) || null) : null,
      inventoryMatchStatus,
    };
  });

  return NextResponse.json({ items: enrichedItems }, {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}
