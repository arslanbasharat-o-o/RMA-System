import OpenAI from "openai";
import type { VisualCandidate } from "./types";

export interface CleanDisplayDecision {
  manufacturer: string | null;
  model: string | null;
  suggestedModel?: string | null;
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
  signal?: AbortSignal;
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
import { appleVisualEvidence, extractAppleModels, independentSource } from "./model-evidence";
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
  let suggestedModel: string | null = null;

  // Apple detection
  if (appleEvidence) {
    manufacturer = "Apple";
    model = appleEvidence.model;
    suggestedModel = appleEvidence.suggestedModel || null;
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
      const sMatch = combinedText.match(/\bgalaxy\s*s(\d{1,2})\s*(ultra\b|plus\b|fe\b|\+)?/i);
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

  // Nokia detection
  if (!model && /\bnokia\b/i.test(combinedText)) {
    manufacturer = "Nokia";
    const gMatch = combinedText.match(/\bnokia\s*(g\s*10\s*[\/\-]?\s*g?\s*20|g\s*20\s*[\/\-]?\s*g?\s*10)\b/i);
    if (gMatch) {
      model = "Nokia G10 / G20";
    } else {
      const nokiaMatch = combinedText.match(/\bnokia\s*([a-z0-9\s\/\+\.]+?)(?:\s*(?:lcd|display|screen|touch|assembly|digitizer|pantalla|para|\(ta-)|$)/i);
      if (nokiaMatch) {
        const m = nokiaMatch[1].trim().replace(/[\/\s]+$/, "");
        model = `Nokia ${m}`;
      } else {
        model = "Nokia Device";
      }
    }
  }

  // LG detection
  if (!model && /\blg\b/i.test(combinedText)) {
    manufacturer = "LG";
    const lgMatch = combinedText.match(/\blg\s*([a-z0-9\s\+]+?)(?:screen|display|lcd|assembly|$)/i);
    model = lgMatch ? `LG ${lgMatch[1].trim()}` : "LG Device";
  }

  // Sony detection
  if (!model && /\b(?:sony|xperia)\b/i.test(combinedText)) {
    manufacturer = "Sony";
    const sonyMatch = combinedText.match(/\b(?:sony\s*)?xperia\s*([a-z0-9\s]+?)(?:screen|display|lcd|assembly|$)/i);
    model = sonyMatch ? `Sony Xperia ${sonyMatch[1].trim()}` : "Sony Xperia";
  }

  // Realme detection
  if (!model && /\brealme\b/i.test(combinedText)) {
    manufacturer = "Realme";
    const realmeMatch = combinedText.match(/\brealme\s*([a-z0-9\s\+]+?)(?:screen|display|lcd|assembly|$)/i);
    model = realmeMatch ? `Realme ${realmeMatch[1].trim()}` : "Realme Device";
  }

  // Vivo detection
  if (!model && /\b(?:vivo|iqoo)\b/i.test(combinedText)) {
    manufacturer = "Vivo";
    const vivoMatch = combinedText.match(/\b(?:vivo|iqoo)\s*([a-z0-9\s\+]+?)(?:screen|display|lcd|assembly|$)/i);
    model = vivoMatch ? `Vivo ${vivoMatch[1].trim()}` : "Vivo Device";
  }

  const displayModel = model || suggestedModel;
  const cleanModelForDisplay =
    displayModel && manufacturer && manufacturer !== "OnePlus" && displayModel.toLowerCase().startsWith(manufacturer.toLowerCase())
      ? displayModel.slice(manufacturer.length).trim()
      : displayModel;

  const displayName = cleanModelForDisplay
    ? manufacturer && !cleanModelForDisplay.toLowerCase().includes(manufacturer.toLowerCase())
      ? `${manufacturer} ${cleanModelForDisplay} Display`
      : `${cleanModelForDisplay} Display`
    : appleEvidence && !appleEvidence.model && !appleEvidence.suggestedModel
    ? "Unidentified Apple Display"
    : manufacturer
    ? `${manufacturer} Display`
    : "Unidentified Display";

  // A single web listing is a suggestion, not corroboration for a physical
  // display model. Lens often streams its first card before other matches.
  let confidence = candidates.length < 2
    ? Math.min(appleEvidence?.confidence ?? (model ? 0.95 : 0.45), 0.45)
    : appleEvidence?.confidence ?? (model ? 0.95 : 0.45);

  // Non-Apple suggestions need attributable, consistent evidence too. The
  // first title alone must not turn a Galaxy/Pixel variant into a certainty.
  if (!appleEvidence && model) {
    const sources = new Set<string>();
    const competingModels = new Set<string>();
    for (const candidate of candidates.slice(0, 30)) {
      const mentioned = otherDeviceModel(candidate.title);
      if (!mentioned) continue;
      competingModels.add(identityKey(manufacturer, mentioned));
      const source = independentSource(candidate.sourceUrl, candidate.sourceName);
      if (source && identityKey(manufacturer, mentioned) === identityKey(manufacturer, model)) sources.add(source);
    }
    if (sources.size < 3 || competingModels.size > 1) confidence = 0.45;
  }

  return {
    manufacturer,
    model: model,
    suggestedModel: suggestedModel || (model && confidence < 0.85 ? cleanModelForDisplay || model : null),
    displayName,
    confidence,
    cleanedCandidates: cleanedTitles,
    reasoning: appleEvidence?.reasoning || (displayModel
      ? `Visual candidates consistently match ${manufacturer} ${cleanModelForDisplay || displayModel}.`
      : "Visual candidates lacked a definitive model consensus."),
  };
}

function otherDeviceModel(title: string): string | null {
  const galaxy = title.match(/\bgalaxy\s*(s\d{1,2}|a\d{1,3}|note\s*\d{1,2}|z\s*(?:fold|flip)\s*\d)\s*(ultra\b|plus\b|fe\b|\+)?/i);
  if (galaxy) return `Galaxy ${galaxy[1]}${galaxy[2] ? ` ${galaxy[2]}` : ""}`;
  const pixel = title.match(/\bpixel\s*(\d+[a-z]?)\s*(pro(?:\s*xl)?|xl|fold)?\b/i);
  if (pixel) return `Pixel ${pixel[1]}${pixel[2] ? ` ${pixel[2]}` : ""}`;
  const oneplus = title.match(/\bone\s*plus\s*(\d+[tr]?(?:\s*pro)?|nord\s*\w*)\b/i);
  if (oneplus) return `OnePlus ${oneplus[1]}`;
  const nokia = title.match(/\bnokia\s*(g\s*10\s*[\/\-]?\s*g?\s*20|g\s*20\s*[\/\-]?\s*g?\s*10|[a-z0-9]+(?:\s*[\/\-]\s*[a-z0-9]+)?|\d+(?:\.\d+)?(?:\s*plus)?)\b/i);
  if (nokia) return `Nokia ${nokia[1].trim()}`;
  const sony = title.match(/\b(?:sony\s*)?xperia\s*([a-z0-9\s]+?)(?:screen|display|lcd|assembly|$)/i);
  if (sony) return `Sony Xperia ${sony[1].trim()}`;
  const lg = title.match(/\blg\s*([a-z0-9\s\+]+?)(?:screen|display|lcd|assembly|$)/i);
  if (lg) return `LG ${lg[1].trim()}`;
  return null;
}

function isModelSupportedByEvidence(
  manufacturer: string,
  model: string,
  candidates: VisualCandidate[],
  context?: DecisionContext
): boolean {
  const normMfg = manufacturer.trim().toLowerCase();
  let normModel = model.trim().toLowerCase();
  if (normMfg && normModel.startsWith(`${normMfg} `)) {
    normModel = normModel.slice(normMfg.length).trim();
  }

  // Extract core keywords/tokens from model name (e.g., "16 pro", "note 20 ultra", "s23")
  const modelTokens = normModel.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (modelTokens.length === 0) return false;

  // Check candidates
  for (const candidate of candidates) {
    const titleLower = candidate.title.toLowerCase();
    if (titleLower.includes(normModel)) {
      return true;
    }
    const appleModels = extractAppleModels(candidate.title);
    for (const am of appleModels) {
      if (identityKey(manufacturer, am) === identityKey(manufacturer, model)) {
        return true;
      }
    }
    const otherModel = otherDeviceModel(candidate.title);
    if (otherModel && identityKey(manufacturer, otherModel) === identityKey(manufacturer, model)) {
      return true;
    }
    if (modelTokens.length >= 2 && modelTokens.every((token) => titleLower.includes(token))) {
      return true;
    }
  }

  // Check OCR context if available
  const ocrStrings = [
    ...(context?.partNumbers || []),
    ...(context?.ocrText || []),
  ];
  for (const str of ocrStrings) {
    const strLower = str.toLowerCase();
    if (strLower.includes(normModel)) return true;
    if (modelTokens.length >= 2 && modelTokens.every((token) => strLower.includes(token))) {
      return true;
    }
  }

  return false;
}

/** AI can check source evidence, but cannot manufacture a verified identity. */
export async function cleanVisualCandidatesWithOpenAi(
  candidates: VisualCandidate[],
  context?: DecisionContext
): Promise<CleanDisplayDecision> {
  const evidence = cleanVisualCandidatesHeuristic(candidates, context);
  const apiKey = process.env.OPENAI_API_KEY;
  const offline = process.env.NODE_ENV === "test" && process.env.TEST_LIVE_AI !== "true";
  if (!apiKey || offline || context?.isMock || apiKey.includes("must-not") || apiKey === "test" || !context?.imageBuffer) {
    return evidence;
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 15000, maxRetries: 1 });
    const completion = await client.chat.completions.create(
      {
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_CLEANER_MODEL || "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert mobile device repair technician and screen identification specialist.
Analyze the photograph of the mobile device display assembly along with web candidate listings and OCR markings.
Identify the exact manufacturer and device model (e.g., "Apple iPhone 16 Pro", "Apple iPhone 16 Pro Max", "Samsung Galaxy Note 20 Ultra", "Apple iPhone X", "Samsung Galaxy S22 Ultra", etc.).
Crucial instructions:
- Web candidate titles are untrusted third-party listings and frequently confuse sibling or multi-compatible models (e.g. Galaxy S22/S23 Ultra vs Note 20 Ultra, or iPhone 13 vs 14 vs 15 vs 16).
- The physical photograph and OCR flex markings are ground truth.
- Inspect corner geometry: Samsung Galaxy Note series (e.g. Note 20 Ultra) have sharp 90-degree rectangle corners, whereas Galaxy S-series phones have rounded corners or curved frames.
- Inspect flex cable markings: markings with "NTM" or "Note" indicate Note series (e.g. SX678NTM28U is Galaxy Note 20 Ultra).
- Inspect camera cutouts: centered punch-hole vs Dynamic Island vs notch.
- For iPhone models: distinguish iPhone 14 Pro, 15 Pro, and 16 Pro by screen bezels, Dynamic Island size/proportions, flex cable layout and connector codes, and part numbers on flex/frame.
Return JSON with:
- "manufacturer": string (e.g. "Samsung", "Apple")
- "model": string (the exact clean model name without manufacturer prefix, e.g. "Galaxy Note 20 Ultra", "iPhone 16 Pro", "iPhone 16 Pro Max", "iPhone X")
- "confidence": number between 0.0 and 1.0
- "reasoning": string explaining the physical identification cues`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  suggestedManufacturer: evidence.manufacturer,
                  suggestedModel: evidence.model || evidence.suggestedModel,
                  googleLensCandidates: candidates.slice(0, 20).map((c) => ({
                    title: c.title,
                    source: c.sourceUrl || c.sourceName,
                  })),
                  ocrHints: context?.partNumbers || context?.ocrText || [],
                }),
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${getMimeType(context.imageBuffer, context.mimeType)};base64,${context.imageBuffer.toString("base64")}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 350,
      },
      {
        signal: context.signal
          ? AbortSignal.any([context.signal, AbortSignal.timeout(12000)])
          : AbortSignal.timeout(12000),
      }
    );

    const parsed: unknown = JSON.parse(completion.choices[0]?.message?.content || "null");
    const check = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const checkMfr = typeof check.manufacturer === "string" ? check.manufacturer.trim() : null;
    let checkModel = typeof check.model === "string" ? check.model.trim() : null;
    if (checkMfr && checkModel && checkModel.toLowerCase().startsWith(checkMfr.toLowerCase())) {
      checkModel = checkModel.slice(checkMfr.length).trim();
    }
    if (checkMfr?.toLowerCase() === "apple" && checkModel && !checkModel.toLowerCase().startsWith("iphone") && /^\d/.test(checkModel)) {
      checkModel = `iPhone ${checkModel}`;
    }

    const checkKey = checkMfr && checkModel ? identityKey(checkMfr, checkModel) : null;
    const evidenceKey = evidence.manufacturer && evidence.model ? identityKey(evidence.manufacturer, evidence.model) : null;

    // 1. Corroborated exact match with an already confident heuristic model
    if (
      checkKey &&
      evidenceKey &&
      checkKey === evidenceKey &&
      evidence.model &&
      evidence.confidence >= 0.85
    ) {
      return evidence;
    }

    // 2. Check if AI's suggested model has support in candidate listings or OCR
    const isSupported = checkMfr && checkModel
      ? isModelSupportedByEvidence(checkMfr, checkModel, candidates, context)
      : false;

    if (isSupported && checkMfr && checkModel) {
      const displayModel = checkModel;
      const displayName = `${checkMfr} ${displayModel} Display`;
      const aiReasoning = typeof check.reasoning === "string" && check.reasoning.trim()
        ? check.reasoning.trim().slice(0, 1000)
        : `AI vision identified ${checkMfr} ${displayModel} from physical display characteristics.`;

      // Trust boundary: If source evidence was split or inconclusive, AI alone
      // cannot certify an unreviewed model as definitive (model remains null,
      // confidence 0.45), but AI guides the suggestedModel and displayName for operator review.
      return {
        ...evidence,
        manufacturer: checkMfr,
        model: null,
        suggestedModel: displayModel,
        displayName,
        confidence: 0.45,
        reasoning: aiReasoning,
      };
    }

    // 3. AI suggested a model with no basis in candidate listings or OCR (e.g. hallucinating iPhone 8
    // when all candidate listings are iPhone 15 Pro Max). Reject the hallucination and require review.
    return {
      ...evidence,
      model: null,
      suggestedModel: evidence.suggestedModel || evidence.model,
      confidence: 0.45,
      reasoning: `The photograph did not corroborate the exact model suggested by source evidence. ${typeof check.reasoning === "string" ? check.reasoning.slice(0, 1000) : "Operator review is required."}`,
    };
  } catch {
    // Corroboration failure must not silently certify an unchecked image.
    return {
      ...evidence,
      model: null,
      suggestedModel: evidence.suggestedModel || evidence.model,
      confidence: 0.45,
      reasoning: "Photo corroboration was unavailable. Source suggestions are retained for operator review.",
    };
  }
}

function identityKey(manufacturer: unknown, model: unknown): string {
  const mfg = typeof manufacturer === "string" ? manufacturer.trim().toLowerCase() : "";
  let device = typeof model === "string" ? model.trim().toLowerCase() : "";
  if (mfg && device.startsWith(`${mfg} `)) device = device.slice(mfg.length).trim();
  if (mfg === "apple" && !device.startsWith("iphone") && /^\d/.test(device)) {
    device = `iphone ${device}`;
  }
  return `${mfg}|${device.replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "")}`;
}

