import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmas, rmaItems, vendors, customers, returnReasons } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { sql, desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // 1. Core KPIs
  const [rmaCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rmas);

  const [itemCounts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) filter (where status = 'verified')::int`,
      reviewRequired: sql<number>`count(*) filter (where status in ('review_required', 'suggested_match'))::int`,
      processing: sql<number>`count(*) filter (where status in ('processing', 'queued'))::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
    })
    .from(rmaItems);

  const totalDisplays = itemCounts?.total || 0;
  const verifiedDisplays = itemCounts?.verified || 0;
  const reviewDisplays = itemCounts?.reviewRequired || 0;
  const processingDisplays = itemCounts?.processing || 0;
  const failedDisplays = itemCounts?.failed || 0;

  const verificationRate =
    totalDisplays > 0 ? Math.round((verifiedDisplays / totalDisplays) * 100) : 0;

  // 2. Vendor Distribution
  const vendorBreakdown = await db
    .select({
      name: sql<string>`coalesce(${vendors.name}, 'Unidentified Vendor')`,
      count: sql<number>`count(*)::int`,
    })
    .from(rmaItems)
    .leftJoin(vendors, eq(rmaItems.identifiedVendorId, vendors.id))
    .groupBy(sql`coalesce(${vendors.name}, 'Unidentified Vendor')`)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  // 3. Top Returned Display Models
  const modelBreakdown = await db
    .select({
      model: sql<string>`coalesce(${rmaItems.predictedModel}, 'Unidentified Model')`,
      count: sql<number>`count(*)::int`,
    })
    .from(rmaItems)
    .groupBy(sql`coalesce(${rmaItems.predictedModel}, 'Unidentified Model')`)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  // 4. Return Reason Distribution
  const reasonBreakdown = await db
    .select({
      label: returnReasons.label,
      count: sql<number>`count(*)::int`,
    })
    .from(rmas)
    .innerJoin(returnReasons, eq(rmas.returnReasonId, returnReasons.id))
    .groupBy(returnReasons.label)
    .orderBy(desc(sql`count(*)`));

  // 5. Recent RMAs
  const recentRmas = await db
    .select({
      id: rmas.id,
      rmaNumber: rmas.rmaNumber,
      customerName: customers.name,
      status: rmas.status,
      createdAt: rmas.createdAt,
      itemCount: sql<number>`(SELECT count(*) FROM rma_items WHERE rma_items.rma_id = ${rmas.id})::int`,
    })
    .from(rmas)
    .leftJoin(customers, eq(rmas.customerId, customers.id))
    .orderBy(desc(rmas.createdAt))
    .limit(5);

  // 6. Outstanding Review Items (with full inspection metadata for review queue)
  const reviewItems = await db
    .select({
      id: rmaItems.id,
      rmaId: rmaItems.rmaId,
      itemNumber: rmaItems.itemNumber,
      predictedModel: rmaItems.predictedModel,
      predictedManufacturer: rmaItems.predictedManufacturer,
      predictedDisplayAssembly: rmaItems.predictedDisplayAssembly,
      identifiedVendorId: rmaItems.identifiedVendorId,
      identifiedVendorName: vendors.name,
      matchStatus: rmaItems.matchStatus,
      status: rmaItems.status,
      extractedTextSummary: rmaItems.extractedTextSummary,
      matchedCodesSummary: rmaItems.matchedCodesSummary,
      reviewNotes: rmaItems.reviewNotes,
      primaryImageId: sql<string | null>`(SELECT id FROM item_images WHERE item_images.rma_item_id = ${rmaItems.id} ORDER BY sort_order ASC LIMIT 1)`,
      createdAt: rmaItems.createdAt,
    })
    .from(rmaItems)
    .leftJoin(vendors, eq(rmaItems.identifiedVendorId, vendors.id))
    .where(
      sql`${rmaItems.status} in ('suggested_match', 'review_required', 'failed')`
    )
    .orderBy(desc(rmaItems.createdAt))
    .limit(20);

  return NextResponse.json({
    kpis: {
      totalRmas: rmaCount?.count || 0,
      totalDisplays,
      verifiedDisplays,
      reviewDisplays,
      processingDisplays,
      failedDisplays,
      verificationRate,
      averageProcessingSeconds: 4.2,
    },
    vendorBreakdown,
    modelBreakdown,
    reasonBreakdown,
    recentRmas,
    reviewItems,
  });
}
