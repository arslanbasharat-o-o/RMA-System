import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems } from "@/db/schema";
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
    })
    .from(rmaItems)
    .where(eq(rmaItems.rmaId, id))
    .orderBy(asc(rmaItems.itemNumber));

  return NextResponse.json({ items }, {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}
