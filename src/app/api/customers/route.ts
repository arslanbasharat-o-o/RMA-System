import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { ilike, or, desc } from "drizzle-orm";
import { z } from "zod";

const CreateCustomerSchema = z.object({
  name: z.string().trim().min(2, "Customer name is required"),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const search = url.searchParams.get("search") || url.searchParams.get("q") || "";

  let query = db.select().from(customers).orderBy(desc(customers.createdAt));

  if (search) {
    const term = `%${search}%`;
    const filtered = await db
      .select()
      .from(customers)
      .where(or(ilike(customers.name, term), ilike(customers.contactName, term)))
      .orderBy(desc(customers.createdAt));
    return NextResponse.json({ customers: filtered });
  }

  const results = await query;
  return NextResponse.json({ customers: results });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const [newCustomer] = await db
      .insert(customers)
      .values({
        name: parsed.data.name.trim(),
        contactName: parsed.data.contactName?.trim() || null,
        email: parsed.data.email?.trim() || null,
        phone: parsed.data.phone?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
      })
      .returning();

    return NextResponse.json({ success: true, customer: newCustomer });
  } catch (error) {
    console.error("Create customer error:", error);
    return NextResponse.json(
      { error: "Failed to create customer." },
      { status: 500 }
    );
  }
}
