import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { displayCatalog } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { ilike, or, desc, count } from "drizzle-orm";
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
  const search = (url.searchParams.get("q") || url.searchParams.get("search") || "").trim();
  const isCompact = url.searchParams.get("compact") === "true";
  const fetchAll = url.searchParams.get("all") === "true";
  const limitParam = url.searchParams.get("limit");
  const pageParam = url.searchParams.get("page");

  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : fetchAll ? 3000 : 50;
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const offset = (page - 1) * limit;

  const whereClause = search
    ? or(
        ilike(displayCatalog.modelName, `%${search}%`),
        ilike(displayCatalog.manufacturer, `%${search}%`),
        ilike(displayCatalog.normalizedModelIdentifier, `%${search}%`),
        ilike(displayCatalog.internalSku, `%${search}%`)
      )
    : undefined;

  const selectFields = isCompact
    ? {
        id: displayCatalog.id,
        manufacturer: displayCatalog.manufacturer,
        modelName: displayCatalog.modelName,
        displayTechnology: displayCatalog.displayTechnology,
        internalSku: displayCatalog.internalSku,
      }
    : undefined;

  const [totalResult] = await db
    .select({ total: count() })
    .from(displayCatalog)
    .where(whereClause);

  const total = Number(totalResult?.total || 0);
  const totalPages = Math.ceil(total / limit) || 1;

  let query = selectFields
    ? db.select(selectFields).from(displayCatalog)
    : db.select().from(displayCatalog);

  if (whereClause) {
    query = query.where(whereClause) as any;
  }

  const results = await query
    .orderBy(desc(displayCatalog.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    catalog: results,
    total,
    page,
    limit,
    totalPages,
  });
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
