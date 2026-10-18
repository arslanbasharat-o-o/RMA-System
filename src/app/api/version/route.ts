import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Public release identity only; no configuration, secrets, or infrastructure. */
export async function GET() {
  return NextResponse.json(APP_VERSION, {
    headers: { "Cache-Control": "no-store" },
  });
}
