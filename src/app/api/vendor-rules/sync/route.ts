import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { syncAllVendorsRecognitionRules } from "@/lib/recognition/rules/sync";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await syncAllVendorsRecognitionRules();
    return NextResponse.json({
      success: true,
      message: `Synchronized recognition rules for ${result.totalVendors} vendors (${result.rulesSynced} rules updated/created).`,
      ...result,
    });
  } catch (error) {
    console.error("Failed to sync vendor rules:", error);
    return NextResponse.json(
      { error: "Failed to sync vendor recognition rules." },
      { status: 500 }
    );
  }
}
