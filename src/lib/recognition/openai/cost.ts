import { CostEstimate, OpenAiTokenUsage } from "./telemetry";

/**
 * Verified Official OpenAI Model Pricing Rates (per 1,000,000 tokens)
 * Standard API pricing schedule verified against OpenAI official documentation.
 * https://developers.openai.com/api/docs/pricing
 */
export interface ModelPriceRate {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  cacheWritePerMillion: number; // 30-minute standard retention
  cacheWrite12hPerMillion: number; // 12-hour extended retention
  outputPerMillion: number;
}

export const PRICING_SCHEDULE_VERSION = "openai-2026-10-31";

export const MODEL_PRICE_RATES: Record<string, ModelPriceRate> = {
  // Flagship / Advanced Reasoning Tier (Sol)
  "gpt-6.1-sol": {
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.1,
    cacheWritePerMillion: 2.5,
    cacheWrite12hPerMillion: 5.0,
    outputPerMillion: 10.0,
  },
  // Efficient Visual Reasoning Tier (Terra 6.1)
  "gpt-6.1-terra": {
    inputPerMillion: 1.0,
    cachedInputPerMillion: 0.05,
    cacheWritePerMillion: 1.25,
    cacheWrite12hPerMillion: 2.5,
    outputPerMillion: 5.0,
  },
  // Prior Generation Visual Reasoning Tier (Terra 5.6) - Kept strictly distinct from Terra 6.1
  "gpt-5.6-terra": {
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.2,
    cacheWritePerMillion: 2.5,
    cacheWrite12hPerMillion: 5.0,
    outputPerMillion: 12.0,
  },
  // Lightweight High-Throughput Tiers (Luna)
  "gpt-6-luna": {
    inputPerMillion: 0.1,
    cachedInputPerMillion: 0.01,
    cacheWritePerMillion: 0.125,
    cacheWrite12hPerMillion: 0.25,
    outputPerMillion: 0.5,
  },
  "gpt-5.6-luna": {
    inputPerMillion: 0.1,
    cachedInputPerMillion: 0.01,
    cacheWritePerMillion: 0.125,
    cacheWrite12hPerMillion: 0.25,
    outputPerMillion: 0.5,
  },
  // Multimodal Vision Baseline (GPT-4o)
  "gpt-4o": {
    inputPerMillion: 2.5,
    cachedInputPerMillion: 1.25,
    cacheWritePerMillion: 3.125,
    cacheWrite12hPerMillion: 6.25,
    outputPerMillion: 10.0,
  },
  "gpt-4o-2024-08-06": {
    inputPerMillion: 2.5,
    cachedInputPerMillion: 1.25,
    cacheWritePerMillion: 3.125,
    cacheWrite12hPerMillion: 6.25,
    outputPerMillion: 10.0,
  },
  "gpt-4o-2024-05-13": {
    inputPerMillion: 5.0,
    cachedInputPerMillion: 2.5,
    cacheWritePerMillion: 6.25,
    cacheWrite12hPerMillion: 12.5,
    outputPerMillion: 15.0,
  },
  // Budget Vision (GPT-4o Mini)
  "gpt-4o-mini": {
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.075,
    cacheWritePerMillion: 0.1875,
    cacheWrite12hPerMillion: 0.375,
    outputPerMillion: 0.6,
  },
  "gpt-4o-mini-2024-07-18": {
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.075,
    cacheWritePerMillion: 0.1875,
    cacheWrite12hPerMillion: 0.375,
    outputPerMillion: 0.6,
  },
};

/**
 * Normalizes a model identifier to find its corresponding pricing tier.
 * Distinctly resolves gpt-6.1-terra from gpt-5.6-terra without merging.
 */
export function resolvePricingRate(modelId: string): { rate: ModelPriceRate; isEstimated: boolean } {
  const normalized = (modelId || "").trim().toLowerCase();

  // 1. Direct exact match
  if (MODEL_PRICE_RATES[normalized]) {
    return { rate: MODEL_PRICE_RATES[normalized], isEstimated: false };
  }

  // 2. Strict family resolution (order matters)
  if (normalized.includes("gpt-6.1-sol") || normalized === "sol") {
    return { rate: MODEL_PRICE_RATES["gpt-6.1-sol"], isEstimated: false };
  }
  if (normalized.includes("gpt-6.1-terra")) {
    return { rate: MODEL_PRICE_RATES["gpt-6.1-terra"], isEstimated: false };
  }
  if (normalized.includes("gpt-5.6-terra") || normalized === "terra") {
    return { rate: MODEL_PRICE_RATES["gpt-5.6-terra"], isEstimated: false };
  }
  if (normalized.includes("gpt-6-luna")) {
    return { rate: MODEL_PRICE_RATES["gpt-6-luna"], isEstimated: false };
  }
  if (normalized.includes("gpt-5.6-luna") || normalized === "luna") {
    return { rate: MODEL_PRICE_RATES["gpt-5.6-luna"], isEstimated: false };
  }
  if (normalized.includes("gpt-4o-mini")) {
    return { rate: MODEL_PRICE_RATES["gpt-4o-mini"], isEstimated: false };
  }
  if (normalized.includes("gpt-4o")) {
    return { rate: MODEL_PRICE_RATES["gpt-4o"], isEstimated: false };
  }

  // 3. Fallback for unlisted/mock models: estimate using gpt-4o baseline but flag as estimated
  return {
    rate: MODEL_PRICE_RATES["gpt-4o"],
    isEstimated: true,
  };
}

export interface CalculateCostOptions {
  cacheRetentionTier?: "30m" | "12h";
}

/**
 * Computes exact dollar cost for a set of token counts using mutually exclusive accounting.
 *
 * Mutually Exclusive Token Accounting:
 *   cachedReads = usage.cachedPromptTokens
 *   cacheWrites = usage.cacheWriteTokens
 *   uncachedInput = usage.promptTokens - cachedReads - cacheWrites
 *
 * Cost Formula:
 *   costUsd = (uncachedInput * inputRate / 1_000_000)
 *           + (cachedReads * cachedReadRate / 1_000_000)
 *           + (cacheWrites * cacheWriteRate / 1_000_000)
 *           + (completionTokens * outputRate / 1_000_000)
 *
 * Inconsistency Protection:
 * - If cachedReads + cacheWrites > promptTokens or any negative token count is detected,
 *   the usage is flagged as unreconciled (isReconciled: false, isEstimated: true).
 * - Reasoning tokens are already reported within completionTokens; they are NOT double-counted.
 * - Missing usage is strictly flagged (isUsageMissing: true) and never treated as measured zero.
 */
export function calculateTokenCost(
  modelId: string,
  usage?: Partial<OpenAiTokenUsage> | null,
  options?: CalculateCostOptions
): CostEstimate {
  const isUsageMissing = !usage || usage.isUsageMissing === true || usage.promptTokens === undefined;
  const promptTokens = usage?.promptTokens ?? 0;
  const cachedReads = usage?.cachedPromptTokens ?? 0;
  const cacheWrites = usage?.cacheWriteTokens ?? 0;
  const completionTokens = usage?.completionTokens ?? 0;

  const { rate, isEstimated: modelIsEstimated } = resolvePricingRate(modelId);
  const notes: string[] = [];

  let isReconciled = true;
  let uncachedInput = 0;

  if (isUsageMissing) {
    isReconciled = false;
    notes.push("Usage data was missing or omitted from provider response; recorded zero tokens as estimate.");
  } else {
    // Validate token counts for reconciliation
    if (promptTokens < 0 || cachedReads < 0 || cacheWrites < 0 || completionTokens < 0) {
      isReconciled = false;
      notes.push(
        `Negative token counts reported: promptTokens=${promptTokens}, cachedReads=${cachedReads}, cacheWrites=${cacheWrites}, completionTokens=${completionTokens}`
      );
    } else if (cachedReads + cacheWrites > promptTokens) {
      isReconciled = false;
      notes.push(
        `Inconsistent usage: cached reads (${cachedReads}) + cache writes (${cacheWrites}) exceed total prompt tokens (${promptTokens}).`
      );
    } else {
      uncachedInput = promptTokens - cachedReads - cacheWrites;
    }
  }

  const isEstimated = modelIsEstimated || isUsageMissing || !isReconciled;

  if (modelIsEstimated) {
    notes.push(`Unrecognized model '${modelId}'; applied default fallback rate schedule.`);
  }

  const retentionTier = options?.cacheRetentionTier || "30m";
  const cacheWriteRate = retentionTier === "12h" ? rate.cacheWrite12hPerMillion : rate.cacheWritePerMillion;

  const uncachedInputCostUsd = (uncachedInput * rate.inputPerMillion) / 1_000_000;
  const cachedInputCostUsd = (cachedReads * rate.cachedInputPerMillion) / 1_000_000;
  const cacheWriteCostUsd = (cacheWrites * cacheWriteRate) / 1_000_000;
  const outputCostUsd = (completionTokens * rate.outputPerMillion) / 1_000_000;

  const totalCostUsd = uncachedInputCostUsd + cachedInputCostUsd + cacheWriteCostUsd + outputCostUsd;

  return {
    totalCostUsd: Number(totalCostUsd.toFixed(8)),
    uncachedInputCostUsd: Number(uncachedInputCostUsd.toFixed(8)),
    cachedInputCostUsd: Number(cachedInputCostUsd.toFixed(8)),
    cacheWriteCostUsd: Number(cacheWriteCostUsd.toFixed(8)),
    outputCostUsd: Number(outputCostUsd.toFixed(8)),
    isEstimated,
    isReconciled,
    currency: "USD",
    pricingSchedule: PRICING_SCHEDULE_VERSION,
    cacheRetentionTier: retentionTier,
    ...(notes.length ? { notes } : {}),
  };
}

/**
 * Extracts and normalizes OpenAiTokenUsage from raw OpenAI completion responses.
 * Strictly distinguishes missing usage from explicit zero token usage.
 */
export function extractUsageFromResponse(rawUsage: unknown): OpenAiTokenUsage {
  if (!rawUsage || typeof rawUsage !== "object" || Object.keys(rawUsage).length === 0) {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedPromptTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      isUsageMissing: true,
    };
  }

  const u = rawUsage as Record<string, unknown>;

  // Check if token fields are actually defined numbers
  const hasPromptTokens = typeof u.prompt_tokens === "number";
  const hasCompletionTokens = typeof u.completion_tokens === "number";

  if (!hasPromptTokens && !hasCompletionTokens) {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedPromptTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      isUsageMissing: true,
    };
  }

  const promptTokens = hasPromptTokens ? (u.prompt_tokens as number) : 0;
  const completionTokens = hasCompletionTokens ? (u.completion_tokens as number) : 0;
  const totalTokens = typeof u.total_tokens === "number" ? u.total_tokens : promptTokens + completionTokens;

  // Prompt tokens details (cached reads)
  const promptDetails = u.prompt_tokens_details as Record<string, unknown> | undefined;
  const cachedPromptTokens = typeof promptDetails?.cached_tokens === "number"
    ? promptDetails.cached_tokens
    : 0;

  // Completion tokens details (reasoning tokens)
  const completionDetails = u.completion_tokens_details as Record<string, unknown> | undefined;
  const reasoningTokens = typeof completionDetails?.reasoning_tokens === "number"
    ? completionDetails.reasoning_tokens
    : 0;

  // Cache write tokens (if provider reports them)
  const cacheWriteTokens = typeof u.cache_creation_input_tokens === "number"
    ? u.cache_creation_input_tokens
    : 0;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedPromptTokens,
    cacheWriteTokens,
    reasoningTokens,
    isUsageMissing: false,
  };
}
