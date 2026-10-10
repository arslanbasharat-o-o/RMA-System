import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { displayCatalog } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { ilike, or, desc } from "drizzle-orm";
import { z } from "zod";

const CreateDisplayCatalogSchema = z.object({
  manufacturer: z.string().min(1),
  modelName: z.string().min(1),
  normalizedModelIdentifier: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  internalSku: z.string().optional().nullable(),
  knownPartNumbers: z.array(z.string()).default([]),
  displayTechnology: z.string().optional().nullable(),
  compatibleDeviceModels: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const search = url.searchParams.get("q") || "";

  if (search) {
    const term = `%${search}%`;
    const results = await db
      .select()
      .from(displayCatalog)
      .where(
        or(
          ilike(displayCatalog.modelName, term),
          ilike(displayCatalog.manufacturer, term),
          ilike(displayCatalog.normalizedModelIdentifier, term)
        )
      )
      .orderBy(desc(displayCatalog.createdAt));
    return NextResponse.json({ catalog: results });
  }

  const all = await db
    .select()
    .from(displayCatalog)
    .orderBy(desc(displayCatalog.createdAt));

  return NextResponse.json({ catalog: all });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateDisplayCatalogSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const [newItem] = await db
      .insert(displayCatalog)
      .values(parsed.data)
      .returning();

    return NextResponse.json({ success: true, item: newItem });
  } catch (error) {
    console.error("Create display catalog error:", error);
    return NextResponse.json(
      { error: "Failed to create display catalog item." },
      { status: 500 }
    );
  }
}
