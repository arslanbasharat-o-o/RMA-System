import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems, reviewActions } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { enqueueRmaItem } from "@/lib/queue";
import { inArray, eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const BulkActionSchema = z.object({
  action: z.enum(["bulk_confirm", "bulk_reprocess"]),
  itemIds: z.array(z.string().uuid()).min(1),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  const { id: rmaId } = await params;
  const body = await req.json();
  const parsed = BulkActionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { action, itemIds, notes } = parsed.data;

  if (action === "bulk_confirm") {
    // Only items that are in suggested_match or review_required with identified values can be confirmed
    // Section 12: "Do not silently bulk-verify ambiguous records."
    const items = await db
      .select()
      .from(rmaItems)
      .where(and(eq(rmaItems.rmaId, rmaId), inArray(rmaItems.id, itemIds)));

    const verifiedIds: string[] = [];
    const skippedIds: string[] = itemIds.filter((id) => !items.some((item) => item.id === id));

    for (const item of items) {
      const hasSuggestion = Boolean(item.predictedModel || item.identifiedVendorId);
      if (
        !["suggested_match", "review_required"].includes(item.status) ||
        !hasSuggestion ||
        ["ambiguous", "unknown"].includes(item.matchStatus) ||
        item.status === "failed"
      ) {
        skippedIds.push(item.id);
        continue;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(rmaItems)
          .set({
            status: "verified",
            matchStatus: "manually_verified",
            verifiedByUserId: auth.user.userId,
            verifiedAt: new Date(),
            recognitionRevision: sql`${rmaItems.recognitionRevision} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(rmaItems.id, item.id));

        await tx.insert(reviewActions).values({
          rmaItemId: item.id,
          userId: auth.user.userId,
          actionType: "bulk_confirm",
          previousState: { status: item.status, matchStatus: item.matchStatus },
          newState: { status: "verified", matchStatus: "manually_verified" },
          notes: notes || "Bulk verified by operator",
        });
      });

      verifiedIds.push(item.id);
    }

    return NextResponse.json({
      success: true,
      verifiedCount: verifiedIds.length,
      skippedCount: skippedIds.length,
      skippedItemIds: skippedIds,
      message: `Verified ${verifiedIds.length} displays. ${skippedIds.length > 0 ? `Skipped ${skippedIds.length} ambiguous/failed displays.` : ""}`,
    });
  }

  if (action === "bulk_reprocess") {
    const items = await db
      .select({ id: rmaItems.id })
      .from(rmaItems)
      .where(and(eq(rmaItems.rmaId, rmaId), inArray(rmaItems.id, [...new Set(itemIds)])));
    const validIds = new Set(items.map((item) => item.id));
    const skippedIds = [...new Set(itemIds)].filter((itemId) => !validIds.has(itemId));
    for (const { id: itemId } of items) {
      await db
        .update(rmaItems)
        .set({
          status: "queued",
          visualStatus: "pending",
          vendorOcrStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(rmaItems.id, itemId));

      await enqueueRmaItem(itemId);
    }

    return NextResponse.json({
      success: true,
      reprocessedCount: items.length,
      skippedCount: skippedIds.length,
      skippedItemIds: skippedIds,
      message: `Queued ${items.length} displays for background re-analysis.${skippedIds.length ? ` Skipped ${skippedIds.length} invalid or out-of-RMA IDs.` : ""}`,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
