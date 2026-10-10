import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, getCookieOptions } from "@/lib/auth/session";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Simple in-memory rate limiter per IP for login
const ipAttempts = new Map<string, { count: number; lastAttempt: number }>();

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    const now = Date.now();
    const attempts = ipAttempts.get(ip) || { count: 0, lastAttempt: now };

    // Reset after 1 minute
    if (now - attempts.lastAttempt > 60000) {
      attempts.count = 0;
    }

    if (attempts.count >= 10) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a minute." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid email or password format." },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()));

    if (!user || !user.active) {
      attempts.count++;
      attempts.lastAttempt = now;
      ipAttempts.set(ip, attempts);
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      attempts.count++;
      attempts.lastAttempt = now;
      ipAttempts.set(ip, attempts);
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // Reset attempts on success
    ipAttempts.delete(ip);

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "admin" | "operator" | "viewer",
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    const cookieOpts = getCookieOptions();
    response.cookies.set(cookieOpts.name, token, cookieOpts);

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during authentication." },
      { status: 500 }
    );
  }
}
