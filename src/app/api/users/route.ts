import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "operator", "viewer"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const staff = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return NextResponse.json({ users: staff });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase().trim();

    // Check if user already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (existing) {
      return NextResponse.json(
        { error: "A user with this email address already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const [newUser] = await db
      .insert(users)
      .values({
        name: parsed.data.name.trim(),
        email,
        role: parsed.data.role,
        passwordHash,
        active: true,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
      });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Failed to create staff account." },
      { status: 500 }
    );
  }
}
