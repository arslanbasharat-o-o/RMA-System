import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vendorRecognitionRules, vendors, vendorVariants } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

const CreateRuleSchema = z.object({
  vendorId: z.string().uuid(),
  vendorVariantId: z.string().uuid().optional().nullable(),
  ruleType: z.enum([
    "exact_code",
    "alias",
    "regex",
    "normalized_text",
    "stamp_pattern",
  ]),
  pattern: z.string().min(1),
  priority: z.number().int().default(100),
  confidenceWeight: z.number().min(0).max(1).default(1.0),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rules = await db
    .select({
      id: vendorRecognitionRules.id,
      vendorId: vendorRecognitionRules.vendorId,
      vendorVariantId: vendorRecognitionRules.vendorVariantId,
      vendorName: vendors.name,
      variantName: vendorVariants.name,
      ruleType: vendorRecognitionRules.ruleType,
      pattern: vendorRecognitionRules.pattern,
      priority: vendorRecognitionRules.priority,
      confidenceWeight: vendorRecognitionRules.confidenceWeight,
      description: vendorRecognitionRules.description,
      isActive: vendorRecognitionRules.isActive,
      createdAt: vendorRecognitionRules.createdAt,
    })
    .from(vendorRecognitionRules)
    .leftJoin(vendors, eq(vendorRecognitionRules.vendorId, vendors.id))
    .leftJoin(
      vendorVariants,
      eq(vendorRecognitionRules.vendorVariantId, vendorVariants.id)
    )
    .orderBy(desc(vendorRecognitionRules.priority));

  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const [newRule] = await db
      .insert(vendorRecognitionRules)
      .values(parsed.data)
      .returning();

    return NextResponse.json({ success: true, rule: newRule });
  } catch (error) {
    console.error("Create rule error:", error);
    return NextResponse.json(
      { error: "Failed to create recognition rule." },
      { status: 500 }
    );
  }
}
