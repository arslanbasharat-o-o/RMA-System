import { NextRequest, NextResponse } from "next/server";
import { getSession, SessionPayload } from "./session";

export type Role = "admin" | "operator" | "viewer";

/**
 * Validates session and checks role authorization for API routes.
 */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: Role[]
): Promise<{ user: SessionPayload } | NextResponse> {
  const user = await getSession(req);

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized. Please log in." },
      { status: 401 }
    );
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: "Forbidden. Insufficient permissions for this action." },
      { status: 403 }
    );
  }

  return { user };
}
