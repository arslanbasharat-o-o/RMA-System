import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { returnReasons } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { eq, asc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const reasons = await db
    .select()
    .from(returnReasons)
    .where(eq(returnReasons.isActive, true))
    .orderBy(asc(returnReasons.sortOrder));

  return NextResponse.json({ returnReasons: reasons });
}
