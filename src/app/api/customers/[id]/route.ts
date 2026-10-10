import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, rmas } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const UpdateCustomerSchema = z.object({
  name: z.string().min(2).optional(),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id));

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const customerRmas = await db
    .select()
    .from(rmas)
    .where(eq(rmas.customerId, id))
    .orderBy(desc(rmas.createdAt));

  return NextResponse.json({ customer, rmas: customerRmas });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(customers)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, customer: updated });
}
