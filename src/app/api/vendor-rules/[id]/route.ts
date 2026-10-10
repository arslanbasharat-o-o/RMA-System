import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vendorRecognitionRules, vendors, vendorVariants } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const UpdateRuleSchema = z.object({
  vendorId: z.string().uuid().optional(),
  vendorVariantId: z.string().uuid().nullable().optional(),
  ruleType: z.enum(["exact_code", "alias", "regex", "normalized_text", "stamp_pattern"]).optional(),
  pattern: z.string().trim().min(1).max(500).optional(),
  priority: z.number().int().min(0).max(100000).optional(),
  confidenceWeight: z.number().min(0).max(1).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateRuleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });

  const [current] = await db.select().from(vendorRecognitionRules)
    .where(eq(vendorRecognitionRules.id, id));
  if (!current) return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  const nextVendorId = parsed.data.vendorId || current.vendorId;
  const nextVariantId = parsed.data.vendorVariantId === undefined ? current.vendorVariantId : parsed.data.vendorVariantId;
  const [vendor] = await db.select({ id: vendors.id }).from(vendors)
    .where(and(eq(vendors.id, nextVendorId), eq(vendors.isActive, true)));
  if (!vendor) return NextResponse.json({ error: "The selected vendor is missing or inactive." }, { status: 400 });
  if (nextVariantId) {
    const [variant] = await db.select({ id: vendorVariants.id }).from(vendorVariants)
      .where(and(eq(vendorVariants.id, nextVariantId), eq(vendorVariants.vendorId, nextVendorId), eq(vendorVariants.isActive, true)));
    if (!variant) return NextResponse.json({ error: "The selected variant does not belong to this active vendor." }, { status: 400 });
  }

  const [updated] = await db
    .update(vendorRecognitionRules)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(vendorRecognitionRules.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, rule: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  await db
    .delete(vendorRecognitionRules)
    .where(eq(vendorRecognitionRules.id, id));

  return NextResponse.json({ success: true, message: "Rule deleted." });
}
