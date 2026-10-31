import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vendors, vendorVariants, vendorRecognitionRules } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { syncVendorRecognitionRules } from "@/lib/recognition/rules/sync";
import { and, desc, eq } from "drizzle-orm";
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
    .where(eq(vendors.isActive, true))
    .orderBy(desc(vendors.createdAt));

  // Include child variants
  const fullVendors = await Promise.all(
    vendorList.map(async (v) => {
      const variants = await db
        .select()
        .from(vendorVariants)
        .where(
          and(
            eq(vendorVariants.vendorId, v.id),
            eq(vendorVariants.isActive, true)
          )
        );
      const rules = await db
        .select()
        .from(vendorRecognitionRules)
        .where(
          and(
            eq(vendorRecognitionRules.vendorId, v.id),
            eq(vendorRecognitionRules.isActive, true)
          )
        );
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

    // Automatically synchronize recognition rules on the system side
    await syncVendorRecognitionRules(newVendor.id);

    return NextResponse.json({ success: true, vendor: newVendor });
  } catch (error) {
    console.error("Create vendor error:", error);
    return NextResponse.json(
      { error: "Failed to create vendor (check unique code)." },
      { status: 500 }
    );
  }
}
