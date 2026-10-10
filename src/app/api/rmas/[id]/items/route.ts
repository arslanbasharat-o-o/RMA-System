import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems, rmas, itemImages } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { eq, desc, asc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const items = await db
    .select()
    .from(rmaItems)
    .where(eq(rmaItems.rmaId, id))
    .orderBy(asc(rmaItems.itemNumber));

  return NextResponse.json({ items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  const { id: rmaId } = await params;

  // Verify RMA exists
  const newItem = await db.transaction(async (tx) => {
    // Lock the parent so concurrent item creation for this RMA is serialized.
    const [rma] = await tx
      .select({ id: rmas.id })
      .from(rmas)
      .where(eq(rmas.id, rmaId))
      .for("update");
    if (!rma) return null;

    const [lastItem] = await tx
      .select({ itemNumber: rmaItems.itemNumber })
      .from(rmaItems)
      .where(eq(rmaItems.rmaId, rmaId))
      .orderBy(desc(rmaItems.itemNumber))
      .limit(1);

    const [inserted] = await tx
      .insert(rmaItems)
      .values({
        rmaId,
        itemNumber: (lastItem?.itemNumber || 0) + 1,
        status: "pending_upload",
        matchStatus: "unknown",
        visualStatus: "pending",
        vendorOcrStatus: "pending",
      })
      .returning();
    return inserted;
  });
  if (!newItem) return NextResponse.json({ error: "RMA not found." }, { status: 404 });

  return NextResponse.json({ success: true, item: newItem });
}
