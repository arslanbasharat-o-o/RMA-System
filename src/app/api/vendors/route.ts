import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vendors, vendorVariants, vendorRecognitionRules } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

const CreateVendorSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional().nullable(),
  aliases: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const vendorList = await db
    .select()
    .from(vendors)
    .orderBy(desc(vendors.createdAt));

  // Include child variants
  const fullVendors = await Promise.all(
    vendorList.map(async (v) => {
      const variants = await db
        .select()
        .from(vendorVariants)
        .where(eq(vendorVariants.vendorId, v.id));
      const rules = await db
        .select()
        .from(vendorRecognitionRules)
        .where(eq(vendorRecognitionRules.vendorId, v.id));
      return {
        ...v,
        variants,
        rules,
      };
    })
  );

  return NextResponse.json({ vendors: fullVendors });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateVendorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const [newVendor] = await db
      .insert(vendors)
      .values(parsed.data)
      .returning();

    return NextResponse.json({ success: true, vendor: newVendor });
  } catch (error) {
    console.error("Create vendor error:", error);
    return NextResponse.json(
      { error: "Failed to create vendor (check unique code)." },
      { status: 500 }
    );
  }
}
