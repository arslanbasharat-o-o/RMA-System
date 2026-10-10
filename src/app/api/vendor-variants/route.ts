import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vendorVariants } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

const CreateVariantSchema = z.object({
  vendorId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  displayTechnology: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const vendorId = url.searchParams.get("vendorId");

  if (vendorId) {
    const list = await db
      .select()
      .from(vendorVariants)
      .where(eq(vendorVariants.vendorId, vendorId))
      .orderBy(desc(vendorVariants.createdAt));
    return NextResponse.json({ variants: list });
  }

  const all = await db
    .select()
    .from(vendorVariants)
    .orderBy(desc(vendorVariants.createdAt));

  return NextResponse.json({ variants: all });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateVariantSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const [newVariant] = await db
      .insert(vendorVariants)
      .values(parsed.data)
      .returning();

    return NextResponse.json({ success: true, variant: newVariant });
  } catch (error) {
    console.error("Create variant error:", error);
    return NextResponse.json(
      { error: "Failed to create variant." },
      { status: 500 }
    );
  }
}
