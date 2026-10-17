import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { eq } from "drizzle-orm";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const settingsList = await db.select().from(appSettings);

  const formatted: Record<string, any> = {};
  for (const s of settingsList) {
    formatted[s.key] = s.value;
  }

  // Include environment status (never exposing secret values directly)
  const providerStatus = {
    selfHostedConfigured: Boolean(process.env.LENS_API_BASE_URL && process.env.LENS_API_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    providerManagedByEnvironment: Boolean(process.env.LENS_PROVIDER),
    activeLensProvider: process.env.LENS_PROVIDER || formatted.LENS_PROVIDER || "mock",
    activeOpenAiModel: formatted.OPENAI_VISION_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-5.6-terra",
    storageDriver: formatted.STORAGE_DRIVER || process.env.STORAGE_DRIVER || "local",
    timezone: formatted.BUSINESS_TIMEZONE || process.env.BUSINESS_TIMEZONE || "UTC",
  };

  return NextResponse.json({ settings: formatted, providerStatus });
}

const UpdateSettingsSchema = z.record(z.any());

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = UpdateSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settings format" }, { status: 400 });
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    const existing = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key));

    if (existing.length > 0) {
      await db
        .update(appSettings)
        .set({
          value,
          updatedByUserId: auth.user.userId,
          updatedAt: new Date(),
        })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({
        key,
        value,
        updatedByUserId: auth.user.userId,
      });
    }
  }

  return NextResponse.json({ success: true, message: "Settings saved successfully." });
}
