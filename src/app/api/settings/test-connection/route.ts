import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";
import { getVisualRecognitionProvider } from "@/lib/recognition/lens";
import { OpenAiVisionOcrService } from "@/lib/recognition/openai";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const TestConnectionSchema = z.object({
  provider: z.enum(["lens", "openai"]),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = TestConnectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid provider specified" }, { status: 400 });
  }

  // Generate a 1x1 test pixel buffer
  const testBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  if (parsed.data.provider === "lens") {
    try {
      let configuredProvider: string | undefined;
      let configuredQuery: string | undefined;
      try {
        const [lensSetting] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, "LENS_PROVIDER"));
        if (lensSetting?.value && typeof lensSetting.value === "string") {
          configuredProvider = lensSetting.value;
        }

        const [querySetting] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, "LENS_FILTER_QUERY"));
        if (querySetting?.value && typeof querySetting.value === "string") {
          configuredQuery = querySetting.value;
        }
      } catch {
        // Fallback to env default
      }

      if (
        process.env.NODE_ENV === "test" ||
        process.env.LENS_PROVIDER === "mock" ||
        (process.env.NODE_ENV !== "production" &&
          !process.env.SERPAPI_API_KEY &&
          (configuredProvider === "serpapi_lens" || configuredProvider === "serpapi"))
      ) {
        configuredProvider = "mock";
      }

      const provider = getVisualRecognitionProvider(configuredProvider, undefined, configuredQuery);
      const res = await provider.identifyDisplay(testBuffer, {
        filename: "test.png",
        q: configuredQuery,
      });

      return NextResponse.json({
        success: !res.error,
        provider: provider.name,
        durationMs: res.durationMs,
        message: res.error
          ? `Provider error: ${res.error}`
          : `Successfully connected to ${provider.name}${res.usedQuery ? ` (filter q='${res.usedQuery}')` : ""}.`,
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (parsed.data.provider === "openai") {
    try {
      let configuredModel: string | undefined;
      let configuredProvider: string | undefined;
      try {
        const [setting] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, "OPENAI_VISION_MODEL"));
        if (setting?.value && typeof setting.value === "string") {
          configuredModel = setting.value;
        }

        const [lensSetting] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, "LENS_PROVIDER"));
        if (lensSetting?.value && typeof lensSetting.value === "string") {
          configuredProvider = lensSetting.value;
        }
      } catch {
        // Fallback to env default
      }

      const isMock =
        process.env.LENS_PROVIDER === "mock" ||
        configuredProvider === "mock" ||
        process.env.NODE_ENV === "test";

      const ocr = new OpenAiVisionOcrService(undefined, configuredModel);
      const res = await ocr.extractMarkings(testBuffer, {
        filename: "test.png",
        isMock,
      });

      return NextResponse.json({
        success: !res.error,
        model: res.model,
        durationMs: res.durationMs,
        message: res.error
          ? `OpenAI Vision error: ${res.error}`
          : `Successfully connected to OpenAI Vision model (${res.model}).`,
      });
    } catch (err) {
      return NextResponse.json({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
}
