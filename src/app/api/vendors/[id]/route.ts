import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vendors } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { eq } from "drizzle-orm";
import { z } from "zod";

const UpdateVendorSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  code: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
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
  const parsed = UpdateVendorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });

  const [updated] = await db
    .update(vendors)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, vendor: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  // Safe soft delete
  const [deactivated] = await db
    .update(vendors)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(vendors.id, id))
    .returning();

  return NextResponse.json({ success: true, vendor: deactivated });
}
