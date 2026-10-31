/**
 * AI Telemetry and Usage Accounting Types
 *
 * Captures granular per-call OpenAI API metrics:
 * - Prompt tokens (mutually exclusive: uncached input, cached reads, cache writes)
 * - Completion tokens (including internal reasoning tokens)
 * - Model, duration, pricing schedule, and cost estimation
 */

export interface OpenAiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  isUsageMissing?: boolean;
}

export interface CostEstimate {
  totalCostUsd: number;
  uncachedInputCostUsd: number;
  cachedInputCostUsd: number;
  cacheWriteCostUsd: number;
  outputCostUsd: number;
  isEstimated: boolean;
  isReconciled: boolean;
  currency: "USD";
  pricingSchedule: string;
  cacheRetentionTier?: "30m" | "12h";
  notes?: string[];
}

export type PipelineStage =
  | "seeded_discovery"
  | "seeded_final"
  | "vendor_ocr"
  | "lens_cleaner"
  | "catalog_comparison"
  | "unknown";

export interface OpenAiCallTelemetry {
  provider: "openai";
  requestedModel: string;
  actualModel: string;
  stage: PipelineStage;
  callId?: string;
  responseId?: string;
  usage: OpenAiTokenUsage;
  cost: CostEstimate;
  durationMs: number;
  attemptNumber: number;
  status: "success" | "error";
  errorMessage?: string;
  timestamp: string;
}

export interface AggregatedStageTelemetry {
  calls: OpenAiCallTelemetry[];
  totalPromptTokens: number;
  totalCachedPromptTokens: number;
  totalCacheWriteTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokens: number;
  totalCostUsd: number;
  primaryModel: string;
}
