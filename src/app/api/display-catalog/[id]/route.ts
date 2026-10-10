import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { displayCatalog } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { eq } from "drizzle-orm";
import { z } from "zod";

const UpdateDisplayCatalogSchema = z.object({
  manufacturer: z.string().trim().min(1).max(160).optional(),
  modelName: z.string().trim().min(1).max(200).optional(),
  normalizedModelIdentifier: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  aliases: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  internalSku: z.string().trim().max(100).nullable().optional(),
  knownPartNumbers: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  displayTechnology: z.string().trim().max(160).nullable().optional(),
  compatibleDeviceModels: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one catalog field to update.");

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateDisplayCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });
  }

  const [updated] = await db
    .update(displayCatalog)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(displayCatalog.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, item: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  // Safe soft delete by setting isActive to false
  const [deactivated] = await db
    .update(displayCatalog)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(displayCatalog.id, id))
    .returning();

  return NextResponse.json({ success: true, item: deactivated });
}
