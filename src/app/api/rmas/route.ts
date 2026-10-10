import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmas, customers, returnReasons, rmaItems } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { generateNextRmaNumber } from "@/lib/utils/rma-sequence";
import { eq, desc, and, or, ilike, sql } from "drizzle-orm";
import { z } from "zod";

const CreateRmaSchema = z.object({
  customerId: z.string().uuid("Please select a valid customer"),
  returnReasonId: z.string().uuid("Please select a return reason"),
  returnReasonNotes: z.string().optional(),
  externalRmaNumber: z.string().optional(),
  trackingNumber: z.string().optional(),
  expectedDisplayCount: z.number().int().positive().optional().nullable(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customerId");
  const query = url.searchParams.get("search") || url.searchParams.get("q") || "";

  // Query with join to customer and return reason
  const conditions = [];

  if (status && status !== "all") {
    conditions.push(eq(rmas.status, status as any));
  }
  if (customerId && customerId !== "all") {
    conditions.push(eq(rmas.customerId, customerId));
  }
  if (query) {
    const term = `%${query}%`;
    conditions.push(
      or(
        ilike(rmas.rmaNumber, term),
        ilike(rmas.trackingNumber, term),
        ilike(rmas.externalRmaNumber, term),
        ilike(customers.name, term)
      )
    );
  }

  const rmaList = await db
    .select({
      id: rmas.id,
      rmaNumber: rmas.rmaNumber,
      externalRmaNumber: rmas.externalRmaNumber,
      trackingNumber: rmas.trackingNumber,
      status: rmas.status,
      expectedDisplayCount: rmas.expectedDisplayCount,
      notes: rmas.notes,
      createdAt: rmas.createdAt,
      updatedAt: rmas.updatedAt,
      customerName: customers.name,
      customerId: customers.id,
      returnReasonLabel: returnReasons.label,
      totalItems: sql<number>`(SELECT COUNT(*) FROM rma_items WHERE rma_items.rma_id = ${rmas.id})::int`,
      verifiedItems: sql<number>`(SELECT COUNT(*) FROM rma_items WHERE rma_items.rma_id = ${rmas.id} AND rma_items.status = 'verified')::int`,
      reviewRequiredItems: sql<number>`(SELECT COUNT(*) FROM rma_items WHERE rma_items.rma_id = ${rmas.id} AND (rma_items.status = 'review_required' OR rma_items.status = 'suggested_match'))::int`,
    })
    .from(rmas)
    .leftJoin(customers, eq(rmas.customerId, customers.id))
    .leftJoin(returnReasons, eq(rmas.returnReasonId, returnReasons.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(rmas.createdAt));

  return NextResponse.json({ rmas: rmaList });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateRmaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Atomic, concurrency-safe sequential RMA number generation
    const rmaNumber = await generateNextRmaNumber();

    const [newRma] = await db
      .insert(rmas)
      .values({
        rmaNumber,
        customerId: parsed.data.customerId,
        returnReasonId: parsed.data.returnReasonId,
        returnReasonNotes: parsed.data.returnReasonNotes || null,
        externalRmaNumber: parsed.data.externalRmaNumber?.trim() || null,
        trackingNumber: parsed.data.trackingNumber?.trim() || null,
        expectedDisplayCount: parsed.data.expectedDisplayCount || null,
        notes: parsed.data.notes?.trim() || null,
        status: "receiving",
        createdByUserId: auth.user.userId,
      })
      .returning();

    return NextResponse.json({ success: true, rma: newRma });
  } catch (error) {
    console.error("Create RMA error:", error);
    return NextResponse.json(
      { error: "Failed to create RMA. Please try again." },
      { status: 500 }
    );
  }
}
