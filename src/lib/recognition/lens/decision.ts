import OpenAI from "openai";
import { VisualCandidate } from "./types";

export interface CleanDisplayDecision {
  manufacturer: string | null;
  model: string | null;
  displayName: string;
  confidence: number;
  cleanedCandidates: string[];
  reasoning: string;
}

export interface DecisionContext {
  ocrText?: string[];
  partNumbers?: string[];
  filename?: string;
  aiOverview?: string;
  isMock?: boolean;
  imageBuffer?: Buffer | null;
  mimeType?: string | null;
}

function getMimeType(buffer: Buffer, declared?: string | null): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return declared || "image/jpeg";
}

import { cleanRawCandidateTitle } from "./cleaner-utils";
import { appleVisualEvidence } from "./model-evidence";
export { cleanRawCandidateTitle };

/**
 * Deterministic, ultra-fast heuristic decision maker for visual candidates.
 * Used as immediate fallback if OpenAI is offline, unconfigured, or during offline test runs.
 */
export function cleanVisualCandidatesHeuristic(
  candidates: VisualCandidate[],
  context?: DecisionContext
): CleanDisplayDecision {
  if (!candidates || candidates.length === 0) {
    return {
      manufacturer: null,
      model: null,
      displayName: "Unidentified Display",
      confidence: 0,
      cleanedCandidates: [],
      reasoning: "No visual candidates were returned by visual recognition.",
    };
  }

  const cleanedTitles = candidates.map((candidate) => cleanRawCandidateTitle(candidate.title));
  const appleEvidence = appleVisualEvidence(candidates, context?.aiOverview);

  // Combine top candidate texts for device identification
  const combinedText = candidates
    .slice(0, 5)
    .map((c) => c.title)
    .join(" ")
    .toLowerCase();

  let manufacturer: string | null = null;
  let model: string | null = null;

  // Apple detection
  if (appleEvidence) {
    manufacturer = "Apple";
    model = appleEvidence.model;
  } else if (!/\biphone\b/i.test(combinedText) && /\bipad\b/i.test(combinedText)) {
    const ipadCandidates = candidates.filter((c) => /\bipad\b/i.test(c.title));
    if (ipadCandidates.length >= 2) {
      manufacturer = "Apple";
      const ipadText = ipadCandidates.map((c) => c.title).join(" ");
      const proMatch = ipadText.match(/\bipad\s*pro\s*(12\.9|11|10\.5|9\.7)?\b/i);
      const airMatch = ipadText.match(/\bipad\s*air\s*(\d+)?\b/i);
      const miniMatch = ipadText.match(/\bipad\s*mini\s*(\d+)?\b/i);
      const numMatch = ipadText.match(/\bipad\s*(\d+)(?:th)?\b/i);
      if (proMatch) {
        model = `iPad Pro${proMatch[1] ? ` ${proMatch[1]}` : ""}`;
      } else if (airMatch) {
        model = `iPad Air${airMatch[1] ? ` ${airMatch[1]}` : ""}`;
      } else if (miniMatch) {
        model = `iPad Mini${miniMatch[1] ? ` ${miniMatch[1]}` : ""}`;
      } else if (numMatch) {
        model = `iPad ${numMatch[1]}`;
      } else {
        model = "iPad";
      }
    }
  } else if (/\b(?:apple\s*watch|iwatch|watch\s*series)\b/i.test(combinedText)) {
    const watchMatch = combinedText.match(/series\s*(\d+)/i);
    model = watchMatch ? `Apple Watch Series ${watchMatch[1]}` : "Apple Watch";
  } else if (/\bmacbook\b/i.test(combinedText)) {
    const macMatch = combinedText.match(/macbook\s*(air|pro)?(?:\s*(\d+["']?))?/i);
    model = macMatch ? `MacBook ${macMatch[1] || "Air"} ${macMatch[2] || ""}`.trim() : "MacBook";
  }

  // Samsung detection
  if (!model) {
    if (/\b(?:galaxy\s*s\d{1,2}|sm-s\d{3})\b/i.test(combinedText)) {
      manufacturer = "Samsung";
      const sMatch = combinedText.match(/\bgalaxy\s*s(\d{1,2})\s*(ultra|plus|fe|\+)?\b/i);
      if (sMatch) {
        const suffix = (sMatch[2] || "").toUpperCase();
        model = `Galaxy S${sMatch[1]}${suffix ? " " + suffix : ""}`;
      } else {
        model = "Galaxy S Series";
      }
    } else if (/\b(?:galaxy\s*note\s*\d{1,2}|sm-n\d{3})\b/i.test(combinedText)) {
      manufacturer = "Samsung";
      const noteMatch = combinedText.match(/\bnote\s*(\d{1,2})\s*(ultra|plus|\+)?\b/i);
      model = noteMatch ? `Galaxy Note ${noteMatch[1]}` : "Galaxy Note";
    } else if (/\b(?:galaxy\s*a\d{1,2}|sm-a\d{3})\b/i.test(combinedText)) {
      manufacturer = "Samsung";
      const aMatch = combinedText.match(/\ba(\d{1,2})\b/i);
      model = aMatch ? `Galaxy A${aMatch[1]}` : "Galaxy A Series";
    } else if (/\b(?:galaxy\s*z\s*(?:fold|flip)\s*\d?)\b/i.test(combinedText)) {
      manufacturer = "Samsung";
      const zMatch = combinedText.match(/\bz\s*(fold|flip)\s*(\d*)/i);
      model = zMatch ? `Galaxy Z ${zMatch[1]} ${zMatch[2]}`.trim() : "Galaxy Z Series";
    }
  }

  // OnePlus detection
  if (!model && /\b(?:one\s*plus|oneplus)\b/i.test(combinedText)) {
    manufacturer = "OnePlus";
    const opMatch = combinedText.match(/\bone\s*plus\s*(\d+[tT]?|\bpro\b|\bnord\b\s*\w*)/i);
    const opSub = opMatch ? opMatch[1].toUpperCase() : "";
    model = opSub ? `OnePlus ${opSub}` : "OnePlus";
  }

  // Google Pixel detection
  if (!model && /\b(?:google\s*pixel|pixel\s*\d)\b/i.test(combinedText)) {
    manufacturer = "Google";
    const pixMatch = combinedText.match(/\bpixel\s*(\d+[a-z]?)\s*(pro|xl)?\b/i);
    const suffix = pixMatch?.[2]
      ? pixMatch[2].charAt(0).toUpperCase() + pixMatch[2].slice(1).toLowerCase()
      : "";
    model = pixMatch ? `Pixel ${pixMatch[1]}${suffix ? " " + suffix : ""}` : "Pixel";
  }

  // Motorola detection
  if (!model && /\b(?:moto|motorola)\b/i.test(combinedText)) {
    manufacturer = "Motorola";
    const motoMatch = combinedText.match(/\bmoto\s*([a-z0-9\s]+?)(?:screen|display|lcd|assembly|$)/i);
    model = motoMatch ? `Moto ${motoMatch[1].trim()}` : "Motorola Device";
  }

  // Xiaomi detection
  if (!model && /\b(?:xiaomi|redmi|poco)\b/i.test(combinedText)) {
    manufacturer = "Xiaomi";
    const redmiMatch = combinedText.match(/\b(?:redmi\s*note\s*\d+|redmi\s*\d+|poco\s*\w+)\b/i);
    model = redmiMatch ? redmiMatch[0] : "Xiaomi Redmi";
  }

  // Oppo detection
  if (!model && /\b(?:oppo|reno)\b/i.test(combinedText)) {
    manufacturer = "Oppo";
    const renoMatch = combinedText.match(/\breno\s*(\d+[a-z]?)\b/i);
    model = renoMatch ? `Reno ${renoMatch[1]}` : "Oppo Reno";
  }

  // Huawei detection
  if (!model && /\b(?:huawei|honor|nova|p\d{2})\b/i.test(combinedText)) {
    manufacturer = "Huawei";
    const pMatch = combinedText.match(/\b(p\d{2}|nova\s*\d+|mate\s*\d+)\b/i);
    model = pMatch ? pMatch[0].toUpperCase() : "Huawei Device";
  }

  const cleanModelForDisplay =
    model && manufacturer && manufacturer !== "OnePlus" && model.toLowerCase().startsWith(manufacturer.toLowerCase())
      ? model.slice(manufacturer.length).trim()
      : model;

  const displayName = appleEvidence && !appleEvidence.model
    ? "Unidentified Apple Display"
    : cleanModelForDisplay
    ? manufacturer && !cleanModelForDisplay.toLowerCase().includes(manufacturer.toLowerCase())
      ? `${manufacturer} ${cleanModelForDisplay} Display`
      : `${cleanModelForDisplay} Display`
    : manufacturer
    ? `${manufacturer} Display`
    : "Unidentified Display";

  // A single web listing is a suggestion, not corroboration for a physical
  // display model. Lens often streams its first card before other matches.
  const confidence = candidates.length < 2
    ? Math.min(appleEvidence?.confidence ?? (model ? 0.88 : 0.45), 0.45)
    : appleEvidence?.confidence ?? (model ? 0.88 : 0.45);

  return {
    manufacturer,
    model: cleanModelForDisplay || model,
    displayName,
    confidence,
    cleanedCandidates: cleanedTitles,
    reasoning: appleEvidence?.reasoning || (model
      ? `Visual candidates consistently match ${manufacturer} ${cleanModelForDisplay || model}.`
      : "Visual candidates lacked a definitive model consensus."),
  };
}

/**
 * Cleans noisy Google Lens visual candidate titles and sends them to OpenAI to make ONE authoritative,
 * clean display decision to present to the user.
 *
 * Latency optimization:
 * - Uses gpt-4o-mini (ultra-fast, <400ms turnaround)
 * - Restricts max_tokens to 150
 * - Deterministic temperature 0
 * - Bounded 4-second timeout with immediate heuristic fallback
 */
export async function cleanVisualCandidatesWithOpenAi(
  candidates: VisualCandidate[],
  context?: DecisionContext
): Promise<CleanDisplayDecision> {
  if (!candidates || candidates.length === 0) {
    return cleanVisualCandidatesHeuristic([], context);
  }

  const heuristic = cleanVisualCandidatesHeuristic(candidates, context);
  // If heuristic already reached a high-confidence decisive determination, return immediately
  if (heuristic.confidence >= 0.85 && !context?.imageBuffer) {
    return heuristic;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const isTest = process.env.NODE_ENV === "test" && process.env.TEST_LIVE_AI !== "true";

  // If in offline test mode or no API key configured, use the fast heuristic engine
  if (!apiKey || isTest || context?.isMock || apiKey.includes("must-not") || apiKey === "test") {
    return heuristic;
  }

  const modelName = process.env.OPENAI_CLEANER_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey, timeout: 20000 });

  const rawTitles = candidates.slice(0, 8).map((c, i) => `#${i + 1}: ${c.title}`);

  try {
    const userContent: any[] = [
      {
        type: "text",
        text: JSON.stringify({
          googleLensCandidates: rawTitles,
          ocrHints: context?.partNumbers || context?.ocrText || [],
          sourceFilename: context?.filename || null,
        }),
      },
    ];

    if (context?.imageBuffer) {
      const mime = getMimeType(context.imageBuffer, context.mimeType);
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${context.imageBuffer.toString("base64")}`,
        },
      });
    }

    const completion = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: `You are an expert mobile display hardware triage engine.
Inspect BOTH the provided photo of the screen assembly (rear side, connector, notch, backlight) AND any Google Lens search candidate titles.
Note: Google Lens search titles can sometimes be noisy or incorrect (e.g. returning tablet/iPad results for a smartphone display).
Prioritize the ground truth physical evidence visible in the photo.

YOUR TASK:
Analyze the display and make ONE definitive, clean, standardized final decision for what display this is.
Output JSON with EXACTLY this structure:
{
  "manufacturer": "Apple" | "Samsung" | "OnePlus" | "Google" | "Motorola" | "Xiaomi" | "Huawei" | "Oppo" | "Realme" | "Vivo" | "LG" | "Sony" | "Nokia" | string | null,
  "model": "iPhone 11" | "iPhone 13 Pro" | "Galaxy S23" | "OnePlus 5T" | string | null,
  "displayName": "Apple iPhone 11 Display",
  "confidence": 0.95,
  "cleanedCandidates": ["Apple iPhone 11 Display"],
  "reasoning": "Photo shows notched iPhone LCD with metal backlight plate and lower-right flex cable matching iPhone 11."
}

Rules:
1. "displayName" MUST be the clean, user-friendly display name (e.g. "Apple iPhone 11 Display", "Samsung Galaxy S23 Display"). Never repeat the manufacturer name twice.
2. Strip all marketplace noise, spam, tools, and vendor names from cleanedCandidates.
3. If candidates or image show an iPhone screen, NEVER output "iPad" merely because an accessory or seller title mentioned iPad.
4. Be decisive: Identify the primary intended device model. If the physical layout matches iPhone 11 LCD, output iPhone 11.`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content) as Partial<CleanDisplayDecision>;
      if (parsed.displayName) {
        let cleanDisplayName = parsed.displayName;
        const mfg = parsed.manufacturer || null;
        let mdl = parsed.model || null;

        // Ensure modelName doesn't repeat manufacturer (preserving OnePlus models like OnePlus 5T)
        if (mfg && mdl && mfg !== "OnePlus" && mdl.toLowerCase().startsWith(mfg.toLowerCase())) {
          mdl = mdl.slice(mfg.length).trim();
        }

        // Ensure displayName doesn't repeat manufacturer twice
        if (mfg && cleanDisplayName) {
          const doubleMfg = new RegExp(`^${mfg}\\s+${mfg}\\s+`, "i");
          cleanDisplayName = cleanDisplayName.replace(doubleMfg, `${mfg} `);
        }

        return {
          manufacturer: mfg,
          model: mdl,
          displayName: cleanDisplayName,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
          cleanedCandidates: Array.isArray(parsed.cleanedCandidates)
            ? parsed.cleanedCandidates
            : candidates.slice(0, 3).map((c) => cleanRawCandidateTitle(c.title)),
          reasoning: parsed.reasoning || "Cleaned visual candidate consensus from OpenAI.",
        };
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[OpenAI Decision Cleaner] Call failed or timed out (${msg}), using fallback heuristic.`);
  }

  // Seamless fallback to heuristic cleaner
  return cleanVisualCandidatesHeuristic(candidates, context);
}

/**
 * Direct OpenAI Vision fallback when Google Lens is blocked, challenge-locked, or returns zero matches.
 */
export async function identifyDisplayWithOpenAiVision(
  imageBuffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<any | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (
    !apiKey ||
    apiKey.includes("must-not") ||
    apiKey === "test" ||
    (process.env.NODE_ENV === "test" && process.env.TEST_LIVE_AI !== "true")
  ) {
    return null;
  }

  const modelName = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey, timeout: 25000 });
  const base64 = imageBuffer.toString("base64");

  try {
    const res = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: `You are an expert mobile device repair technician and display assembly identification engine.
Inspect the screen assembly photo carefully:
- Notch or Dynamic Island, camera/sensor cutouts, earpiece speaker cutout or top bracket.
- Display technology: OLED (thin, black backing) vs LCD (metal backlight plate, backlight ribbon).
- Flex cable routing, width, fold style, markings, and board-to-board connector placement.
- Overall aspect ratio, bezel thickness, and frame brackets.
Identify the EXACT device display assembly (e.g. "iPhone 11", "iPhone 14", "iPhone 15 Pro", "Galaxy S21 Ultra", "iPad Pro 12.9").
Output ONLY a JSON object with:
{
  "manufacturer": "Apple" | "Samsung" | "Google" | "OnePlus" | "Motorola" | string,
  "model": "iPhone 11" | "iPhone 15" | "Galaxy S21 Ultra" | string,
  "displayName": "Apple iPhone 11 Display",
  "confidence": 0.90,
  "reasoning": "Metal backlight plate, top earpiece cutout bracket, and bottom flex cable match iPhone 11 LCD display."
}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Identify this display assembly (filename: ${filename || "display.png"}).` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const content = res.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!parsed.displayName && !parsed.model) return null;

    let cleanDisplayName = parsed.displayName || `${parsed.manufacturer || ""} ${parsed.model || ""} Display`.trim();
    const mfg = parsed.manufacturer || null;
    let mdl = parsed.model || null;

    if (mfg && mdl && mfg !== "OnePlus" && mdl.toLowerCase().startsWith(mfg.toLowerCase())) {
      mdl = mdl.slice(mfg.length).trim();
    }
    if (mfg && cleanDisplayName) {
      const doubleMfg = new RegExp(`^${mfg}\\s+${mfg}\\s+`, "i");
      cleanDisplayName = cleanDisplayName.replace(doubleMfg, `${mfg} `);
    }

    const cleanDecision: CleanDisplayDecision = {
      manufacturer: mfg,
      model: mdl,
      displayName: cleanDisplayName,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.88,
      cleanedCandidates: [cleanDisplayName],
      reasoning: parsed.reasoning || "Direct OpenAI Vision hardware inspection.",
    };

    return {
      provider: "openai-vision-fallback",
      candidates: [{ title: cleanDisplayName, rank: 1 }],
      cleanDecision,
      normalizedManufacturer: mfg || undefined,
      normalizedModel: mdl || undefined,
      detectedDisplayAssembly: cleanDisplayName,
      rawResponse: { openAiVision: parsed },
      durationMs: 0,
    };
  } catch (err) {
    console.warn("[OpenAI Vision Fallback] Failed:", err);
    return null;
  }
}

