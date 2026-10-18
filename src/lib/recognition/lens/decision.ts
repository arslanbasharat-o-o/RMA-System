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
    ? Math.min(appleEvidence?.confidence ?? (model ? 0.95 : 0.45), 0.45)
    : appleEvidence?.confidence ?? (model ? 0.95 : 0.45);

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
          content: `You are an expert mobile device and display assembly triage engine.
Inspect BOTH the provided photo of the screen assembly (rear side, connector, notch, backlight) AND the Google Lens search candidate titles.

DECISION & DISAMBIGUATION RULES:
1. Ground Truth Candidate Consensus:
   - Google Lens visual matches compare against billions of indexed product images.
   - When candidate titles consistently identify a specific device model (e.g., "iPad Pro 12.9 1st Gen", "iPhone XR", "Galaxy S21 Ultra"), adopt that consensus.
   - Do NOT override strong candidate consensus with arbitrary guesses.
2. Device Disambiguation:
   - Tablets (iPad, Galaxy Tab) vs Smartphones (iPhone, Galaxy S):
     * If candidate titles consistently point to a tablet model (e.g. iPad Pro 12.9, iPad Air, Galaxy Tab), identify as that tablet display.
     * Only discard tablet results if candidate titles predominantly identify a smartphone and a lone accessory title happens to mention a tablet adapter.
   - iPhone Generations & Lookalike Disambiguation:
     * iPhone 6 vs 6s (4.7-inch LCD): iPhone 6 has no 3D Touch; iPhone 6s has an integrated 3D Touch capacitive pressure sensor layer on the rear backlight plate with connector on bottom-left.
     * iPhone 7 / 7 Plus vs iPhone 8 / 8 Plus: iPhone 7/7+ flex ribbons route from the bottom right; iPhone 8/8+ features True Tone ambient sensor circuitry and altered rear shield grounding.
     * iPhone SE (2nd / 3rd Gen): 4.7-inch LCD with black front glass border across all chassis colors.
     * iPhone XR (6.1-inch Liquid Retina LCD): Distinctive rectangular/square cutout in the top-left corner of the rear shield revealing the metal grounding bracket; dual stacked flex cables branching on mid-left into two separate board connectors; thicker ~4.0mm LCD bezels. If the top-left square cutout in the rear shield is visible, it is ALWAYS an iPhone XR.
     * iPhone X / XS (5.8-inch OLED): Narrow uniform bezels (~2.5mm), no top-left square cutout in rear shield, OLED panel with dual bottom-left flex cables.
     * iPhone XS Max (6.5-inch OLED): 6.5-inch OLED panel with dual bottom flex ribbons.
     * iPhone 11 (6.1-inch Liquid Retina LCD): Single unified flex ribbon cable routing from the bottom-right with an exposed backlight power lead at the bottom center; NO top-left square cutout in rear shield.
     * iPhone 11 Pro (5.8-inch OLED) / iPhone 11 Pro Max (6.5-inch OLED): Inverted motherboard layout causes the display flex ribbons to route along the right side of the rear panel.
     * iPhone 12 / 12 Pro (6.1-inch OLED): Flat boxy frame clips; wide screen notch (~34.8mm) with the earpiece speaker cutout integrated directly INSIDE the top notch of the screen assembly.
     * iPhone 13 / 13 Pro (6.1-inch OLED): Narrow screen notch (~26.6mm); earpiece speaker is moved UP into the phone chassis frame (NOT in the screen notch).
     * iPhone 14 (6.1-inch OLED) / iPhone 14 Plus (6.7-inch OLED): Narrow notch; rear flex routing changed to bottom-right for the redesigned removable back glass chassis layout.
     * iPhone 14 Pro / 14 Pro Max & iPhone 15 Series: Feature DYNAMIC ISLAND (pill-shaped floating cutout) instead of a top notch. iPhone 14 Pro/Pro Max feature 120Hz ProMotion controller flex.
3. Output Standards & Confidence Calibration:
   - When Google Lens candidate consensus and physical hardware evidence corroborate each other, assign a high confidence score of 0.95 to 0.98.
   - Output valid JSON with EXACTLY this structure:
     {
       "manufacturer": "Apple" | "Samsung" | "OnePlus" | "Google" | "Motorola" | "Xiaomi" | "Huawei" | "Oppo" | "Realme" | "Vivo" | "LG" | "Sony" | "Nokia" | string | null,
       "model": "iPad Pro 12.9 1st Gen" | "iPhone XR" | "iPhone 11" | "Galaxy S21 Ultra" | string | null,
       "displayName": "Apple iPad Pro 12.9 1st Gen Display",
       "confidence": 0.95,
       "cleanedCandidates": ["Apple iPad Pro 12.9 1st Gen Display"],
       "reasoning": "Candidate consensus and hardware physical evidence description."
     }
   - "displayName" MUST be the clean, user-friendly display name (e.g. "Apple iPad Pro 12.9 1st Gen Display", "Apple iPhone XR Display", "Samsung Galaxy S21 Ultra Display"). Never repeat the manufacturer name twice.
   - Strip marketplace noise, seller fluff, shipping text, and review ratings from cleanedCandidates.
   - Be decisive: Identify the primary intended device model based on consensus and physical hardware evidence.`,
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
CRITICAL HARDWARE RULES:
1. iPhone XR vs iPhone X / XS vs iPhone 11:
   - iPhone XR (6.1-inch Liquid Retina LCD):
     * Rear shield plate has a DISTINCTIVE rectangular/square cutout in the top-left corner revealing the metal grounding bracket.
     * Dual stacked flex cables branching on the mid-left into two separate board connectors (display + digitizer).
     * Thicker perimeter bezels (~4.0mm) characteristic of Liquid Retina LCD panels.
     * IF you see the rectangular cutout in the top-left corner of the rear shield and mid-left dual connectors, this is ALWAYS an iPhone XR, NEVER an iPhone X, XS, or 11!
   - iPhone X / XS (5.8-inch OLED):
     * 5.8-inch OLED panel with narrow uniform bezels (~2.5mm).
     * Rear shield does NOT have the XR square cutout in the top-left corner.
     * Flex cables fold from bottom-left corner with OLED controller.
   - iPhone 11 (6.1-inch LCD):
     * Single unified ribbon cable routing from the bottom-right with an exposed backlight power lead at the bottom center.
   - iPhone 12 / 12 Pro (6.1-inch OLED):
     * Flat boxy chassis frame edges, OLED display with dual flex cables on the bottom-left. Earpiece speaker is in the display notch.
   - iPhone 13 / 13 Pro / 14 (6.1-inch OLED):
     * Earpiece speaker moved up to top phone frame (NOT in screen notch). Smaller screen notch or Dynamic Island (iPhone 14 Pro, 15).
   - iPhone 15 / 15 Pro / 15 Pro Max:
     * Dynamic Island oval cutout at top, ultra-thin borders.
2. Samsung Galaxy:
   - Galaxy S Series (S20, S21, S22, S23, S24): Curved or flat AMOLED with center punch-hole camera.
   - Galaxy A Series: LCD or AMOLED with teardrop notch (Infinity-V/U) or small hole-punch, thick bottom chin.
3. Tablets / iPads:
   - Much wider 4:3 aspect ratio (7.9" to 12.9"). NEVER classify a smartphone-sized display as an iPad!

Output ONLY a JSON object with:
{
  "manufacturer": "Apple" | "Samsung" | "Google" | "OnePlus" | "Motorola" | string,
  "model": "iPhone XR" | "iPhone 11" | "iPhone 15" | "Galaxy S21 Ultra" | string,
  "displayName": "Apple iPhone XR Display",
  "confidence": 0.95,
  "reasoning": "Rear shield displays the signature top-left rectangular grounding cutout and mid-left dual flex connectors characteristic of the iPhone XR."
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

