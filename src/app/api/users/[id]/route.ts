import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { hashPassword } from "@/lib/auth/password";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const UpdateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.format() },
      { status: 400 }
    );
  }
  if (auth.user.userId === id && (parsed.data.active === false || (parsed.data.role && parsed.data.role !== "admin"))) {
    return NextResponse.json({ error: "An administrator cannot deactivate or demote their own account." }, { status: 400 });
  }


  const updateData: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
  if (parsed.data.password) {
    updateData.passwordHash = await hashPassword(parsed.data.password);
  }

  const updated = await db.transaction(async (tx) => {
    const admins = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true)))
      .for("update");
    const removesAdmin = admins.some((admin) => admin.id === id) &&
      (parsed.data.active === false || (parsed.data.role !== undefined && parsed.data.role !== "admin"));
    if (removesAdmin && admins.length <= 1) return { error: "last_admin" as const };

    const [user] = await tx
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
        updatedAt: users.updatedAt,
      });
    if (user && (parsed.data.role !== undefined || parsed.data.active === false || parsed.data.password !== undefined)) {
      await tx.delete(sessions).where(eq(sessions.userId, id));
    }
    return { user };
  });

  if ("error" in updated) {
    return NextResponse.json({ error: "The last active administrator cannot be demoted or deactivated." }, { status: 409 });
  }
  if (!updated.user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, user: updated.user });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  // Prevent self-deactivation of logged-in admin
  if (auth.user.userId === id) {
    return NextResponse.json(
      { error: "An administrator cannot deactivate their own account." },
      { status: 400 }
    );
  }



  const deactivated = await db.transaction(async (tx) => {
    const admins = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true)))
      .for("update");
    const targetIsAdmin = admins.some((admin) => admin.id === id);
    if (targetIsAdmin && admins.length <= 1) return { error: "last_admin" as const };

    const [user] = await tx
      .update(users)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        active: users.active,
      });
    if (user) await tx.delete(sessions).where(eq(sessions.userId, id));
    return { user };
  });

  if ("error" in deactivated) {
    return NextResponse.json({ error: "The last active administrator cannot be deactivated." }, { status: 409 });
  }
  if (!deactivated.user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, user: deactivated.user });
}
