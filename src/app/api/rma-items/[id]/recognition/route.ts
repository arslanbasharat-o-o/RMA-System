import { hasIntakeCustomer, CUSTOMER_REQUIRED } from "@/lib/intake-customer";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { enqueueRmaItem } from "@/lib/queue";
import { eq } from "drizzle-orm";
import { z } from "zod";

const RecognitionRetrySchema = z.object({
  pipeline: z.enum(["all", "visual", "vendor_ocr"]).default("all"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  const { id: itemId } = await params;

  const [item] = await db
    .select()
    .from(rmaItems)
    .where(eq(rmaItems.id, itemId));

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  if (!await hasIntakeCustomer(item.rmaId)) {
    return NextResponse.json({ error: CUSTOMER_REQUIRED }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = RecognitionRetrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid retry parameters" }, { status: 400 });
  }

  await db
    .update(rmaItems)
    .set({
      status: "queued",
      visualStatus: parsed.data.pipeline !== "vendor_ocr" ? "pending" : item.visualStatus,
      vendorOcrStatus: parsed.data.pipeline !== "visual" ? "pending" : item.vendorOcrStatus,
      updatedAt: new Date(),
    })
    .where(eq(rmaItems.id, itemId));

  await enqueueRmaItem(itemId, { pipeline: parsed.data.pipeline, force: true });

  return NextResponse.json({
    success: true,
    message: `Enqueued display #${item.itemNumber} for ${parsed.data.pipeline} re-analysis.`,
  });
}
