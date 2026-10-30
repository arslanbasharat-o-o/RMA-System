import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vendorVariants, vendors } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { syncVendorRecognitionRules } from "@/lib/recognition/rules/sync";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const UpdateVariantSchema = z.object({
  vendorId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  code: z.string().trim().min(1).max(80).optional(),
  aliases: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
  displayTechnology: z.string().trim().max(160).nullable().optional(),
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
  const parsed = UpdateVariantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });
  if (parsed.data.vendorId) {
    const [vendor] = await db.select({ id: vendors.id }).from(vendors)
      .where(and(eq(vendors.id, parsed.data.vendorId), eq(vendors.isActive, true)));
    if (!vendor) return NextResponse.json({ error: "The selected vendor is missing or inactive." }, { status: 400 });
  }

  const [updated] = await db
    .update(vendorVariants)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(vendorVariants.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Variant not found." }, { status: 404 });
  }

  // Automatically synchronize rules for the parent vendor
  await syncVendorRecognitionRules(updated.vendorId);

  return NextResponse.json({ success: true, variant: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const [deactivated] = await db
    .update(vendorVariants)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(vendorVariants.id, id))
    .returning();

  if (deactivated) {
    await syncVendorRecognitionRules(deactivated.vendorId);
  }

  return NextResponse.json({ success: true, variant: deactivated });
}
