import { NextRequest, NextResponse } from "next/server";
import { getCookieOptions, revokeSession } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  await revokeSession(req);
  const response = NextResponse.json({ success: true, message: "Logged out." });
  const cookieOpts = getCookieOptions();
  response.cookies.set(cookieOpts.name, "", { ...cookieOpts, maxAge: 0 });
  return response;
}
