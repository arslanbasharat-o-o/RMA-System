import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: "admin" | "operator" | "viewer";
}

const COOKIE_NAME = process.env.COOKIE_NAME || "rma_session";
const SESSION_MAX_AGE_SECONDS = parseInt(
  process.env.SESSION_MAX_AGE_SECONDS || "604800", // 7 days default
  10
);

function getSecretKey() {
  const configured = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!configured || configured.length < 32 || /change-this|replace_with|default_super_secret/i.test(configured)) {
      throw new Error("SESSION_SECRET must be set to a unique value of at least 32 characters in production.");
    }
    return new TextEncoder().encode(configured);
  }
  return new TextEncoder().encode(
    configured || "local-development-only-session-secret-minimum-32-characters"
  );
}

/**
 * Creates an encrypted JWT session token.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());

  await db.insert(sessions).values({
    id: sessionId,
    userId: payload.userId,
    expiresAt,
  });
  return token;
}

/**
 * Verifies and decodes a session JWT token.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.role !== "string" ||
      !["admin", "operator", "viewer"].includes(payload.role)
    ) return null;

    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, payload.jti), eq(sessions.userId, payload.userId), gt(sessions.expiresAt, new Date())));
    if (!session) return null;

    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
      .from(users)
      .where(eq(users.id, payload.userId));
    if (!user?.active || !["admin", "operator", "viewer"].includes(user.role)) return null;

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as SessionPayload["role"],
    };
  } catch {
    return null;
  }
}

export async function revokeSession(req: NextRequest): Promise<void> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (typeof payload.jti === "string") {
      await db.delete(sessions).where(eq(sessions.id, payload.jti));
    }
  } catch {
    // Invalid or expired tokens have no active session to revoke.
  }
}

/**
 * Extracts and verifies the current session user from incoming request or Next cookies.
 */
export async function getSession(
  req?: NextRequest
): Promise<SessionPayload | null> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(COOKIE_NAME)?.value;
  } else {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      // In non-request contexts or static generation
      return null;
    }
  }

  if (!token) return null;
  return await verifySessionToken(token);
}

/**
 * Helper to get cookie options.
 */
export function getCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
