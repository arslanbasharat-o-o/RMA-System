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
  isMock?: boolean;
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
  const appleEvidence = appleVisualEvidence(candidates);

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
  } else if (/\bipad\b/i.test(combinedText)) {
    manufacturer = "Apple";
    const ipadMatch = combinedText.match(/\bipad\s*(air\s*\d*|pro\s*\d*|mini\s*\d*|\d+)?\b/i);
    model = ipadMatch ? `iPad ${ipadMatch[1] || ""}`.trim() : "iPad";
  } else if (/\b(?:apple\s*watch|iwatch|watch\s*series)\b/i.test(combinedText)) {
    manufacturer = "Apple";
    const watchMatch = combinedText.match(/series\s*(\d+)/i);
    model = watchMatch ? `Apple Watch Series ${watchMatch[1]}` : "Apple Watch";
  } else if (/\bmacbook\b/i.test(combinedText)) {
    manufacturer = "Apple";
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

  const displayName = cleanModelForDisplay
    ? manufacturer && !cleanModelForDisplay.toLowerCase().includes(manufacturer.toLowerCase())
      ? `${manufacturer} ${cleanModelForDisplay} Display`
      : `${cleanModelForDisplay} Display`
    : cleanedTitles[0] || "Unidentified Display";

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

  // Named Apple variants are source evidence, not text for an LLM to rewrite.
  // Mixed Pro / Pro Max results remain a low-confidence suggestion for review.
  if (appleVisualEvidence(candidates)) {
    return cleanVisualCandidatesHeuristic(candidates, context);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const isTest = process.env.NODE_ENV === "test" && process.env.TEST_LIVE_AI !== "true";

  // If in offline test mode or no API key configured, use the fast heuristic engine
  if (!apiKey || isTest || context?.isMock) {
    return cleanVisualCandidatesHeuristic(candidates, context);
  }

  const modelName = process.env.OPENAI_CLEANER_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey, timeout: 4000 });

  const rawTitles = candidates.slice(0, 8).map((c, i) => `#${i + 1}: ${c.title}`);

  try {
    const completion = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: `You are an expert mobile display hardware triage engine.
You receive raw, noisy Google Lens visual search candidates for a returned mobile device screen assembly.
Google Lens matches often include messy e-commerce titles (eBay, AliExpress, Amazon), accessories, tools, typos, and seller fluff.

YOUR TASK:
Analyze the Google Lens candidate titles and make ONE definitive, clean, standardized final decision for what display this is.
Output JSON with EXACTLY this structure:
{
  "manufacturer": "Apple" | "Samsung" | "OnePlus" | "Google" | "Motorola" | "Xiaomi" | "Huawei" | "Oppo" | "Realme" | "Vivo" | "LG" | "Sony" | "Nokia" | string | null,
  "model": "iPhone 13 Pro" | "Galaxy S23" | "OnePlus 5T" | string | null,
  "displayName": "Apple iPhone 13 Pro Display",
  "confidence": 0.95,
  "cleanedCandidates": ["Apple iPhone 13 Pro", "Apple iPhone 13 Pro Max"],
  "reasoning": "Top Google Lens matches consistently point to 6.1-inch iPhone 13 Pro display assembly."
}

Rules:
1. "displayName" MUST be the clean, user-friendly display name (e.g. "Apple iPhone 13 Pro Display", "Samsung Galaxy S23 Display"). Never repeat the manufacturer name twice.
2. Strip all marketplace noise, spam, tools, and vendor names from cleanedCandidates.
3. Be fast, concise, and decisive. If candidates are ambiguous, set confidence below 0.5.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            candidates: rawTitles,
            ocrHints: context?.partNumbers || context?.ocrText || [],
            sourceFilename: context?.filename || null,
          }),
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 150,
      temperature: 0,
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
