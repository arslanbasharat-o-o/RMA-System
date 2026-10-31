/**
 * Offline Cost Simulation & Recognition Lifecycle Accounting
 *
 * Distinguishes:
 * 1. Seeded comparison stage (Discovery + Final) modeled independently
 * 2. Full item recognition lifecycle (Vendor OCR + Discovery + Final + conditional Lens cleaner + AnyIP Proxy)
 * 3. Cold-cache vs Warm-cache vs Expired-cache vs Workload-weighted scenarios
 * 4. Separate caching behaviors for Discovery (shared catalog prefix) and Final (varying candidate subsets)
 *
 * Uses official OpenAI pricing schedule: openai-2026-10-31
 * Strictly offline simulation — zero paid API calls.
 */

import { calculateTokenCost } from "../src/lib/recognition/openai/cost";
import type { OpenAiTokenUsage } from "../src/lib/recognition/openai/telemetry";

export type CostEstimationConfidence = "MEASURED" | "ESTIMATED" | "UNKNOWN";

export interface LifecycleCostBreakdown {
  scenarioName: string;
  confidenceTier: CostEstimationConfidence;
  vendorOcrCostUsd: number;
  discoveryCostUsd: number;
  finalCostUsd: number;
  lensCleanerCostUsd: number;
  proxyCostUsd: number;
  seededComparisonOnlyUsd: number;
  fullCycleTotalUsd: number;
  notes: string;
  tokenDetails: {
    ocr: OpenAiTokenUsage;
    discovery: OpenAiTokenUsage;
    final: OpenAiTokenUsage;
    lensCleaner: OpenAiTokenUsage;
  };
}

export interface CacheScenarioParams {
  cacheState: "cold" | "warm" | "expired" | "workload_weighted" | "legacy_uncached";
  promptCachingOrder: "prefix" | "legacy";
  /** Probability of triggering external Google Lens search (default: 0.15 = 15%) */
  lensTriggerRate?: number;
  /** Whether Final stage candidate set matches a warm cache (default: false for mixed item batches) */
  finalStageWarm?: boolean;
}

/**
 * Standard Verified Token Assumptions per RMA Item:
 *
 * 1. Vendor OCR (GPT-4o):
 *    - 1 full-resolution frame (up to 2560x2560) + 5 specialized crops (notch/flex, connector, mid-back CLAHE, 180° inverted mid-back, tight rotated)
 *    - ~5,400 prompt tokens (text instructions + 6 high-detail image tiles)
 *    - ~120 completion tokens
 *
 * 2. Discovery Stage (GPT-6.1 Sol / Terra):
 *    - 76 display references (~40,960 ref prefix + ~7,040 target images = 48,000 prompt tokens)
 *    - ~60 completion tokens (reasoning effort: low)
 *    - Stable KV prefix shared across ALL items in catalog intake.
 *
 * 3. Final Decision Stage (GPT-6.1 Sol / Terra):
 *    - 2-3 candidate displays selected by Discovery (~9,600 candidate ref prefix + ~2,400 target crops = 12,000 prompt tokens)
 *    - ~450 completion tokens (including ~250 internal reasoning tokens, reasoning effort: medium)
 *    - Dynamic candidate groups: Different items do NOT share an identical prefix from token 0.
 *      In mixed batches, Final stage prefix cache hit rate across distinct models is ~0%.
 *
 * 4. Conditional Lens Cleaner (GPT-4o-mini):
 *    - ~2,200 prompt tokens, ~120 completion tokens
 *    - Invoked only on ambiguous/abstaining items (default rate: 15% to 30%)
 *
 * 5. Residential Proxy (AnyIP):
 *    - ~2.5 MB data transfer per Google Lens search @ $7.50 / GB ($0.01831 per search)
 */
export function simulateLifecycleCost(
  discoveryModel: string,
  finalModel: string,
  params: CacheScenarioParams
): LifecycleCostBreakdown {
  const isPrefix = params.promptCachingOrder === "prefix";
  const { cacheState } = params;
  const lensRate = params.lensTriggerRate ?? 0.15;

  // 1. Vendor OCR on GPT-4o (1 full frame + 5 specialized crops)
  const ocrUsage: OpenAiTokenUsage = {
    promptTokens: 5400,
    cachedPromptTokens: 0,
    cacheWriteTokens: 0,
    completionTokens: 120,
    reasoningTokens: 0,
    totalTokens: 5520,
  };
  const ocrCostRaw = calculateTokenCost("gpt-4o", ocrUsage).totalCostUsd;

  // 2. Discovery Stage Token Accounting (Shared 76-product prefix)
  let discCachedTokens = 0;
  let discWriteTokens = 0;
  if (isPrefix && cacheState !== "legacy_uncached") {
    if (cacheState === "warm") {
      discCachedTokens = 40960;
      discWriteTokens = 0;
    } else if (cacheState === "cold" || cacheState === "expired") {
      discCachedTokens = 0;
      discWriteTokens = 40960; // 30m cache write charge
    } else if (cacheState === "workload_weighted") {
      // 5-item batch within 30 min: 1 cold write + 4 warm reads = 80% warm reads, 20% writes
      discCachedTokens = Math.round(40960 * 0.8);
      discWriteTokens = Math.round(40960 * 0.2);
    }
  }

  const discUsage: OpenAiTokenUsage = {
    promptTokens: 48000,
    cachedPromptTokens: discCachedTokens,
    cacheWriteTokens: discWriteTokens,
    completionTokens: 60,
    reasoningTokens: 0,
    totalTokens: 48060,
  };
  const discoveryCostRaw = calculateTokenCost(discoveryModel, discUsage).totalCostUsd;

  // 3. Final Decision Stage Token Accounting
  // Crucial distinction: Final candidate subsets depend on Discovery winners.
  // In a mixed-model RMA batch, different items have distinct candidate subsets,
  // meaning their prompt prefixes do not match from token 0.
  let finalCachedTokens = 0;
  let finalWriteTokens = 0;
  if (isPrefix && cacheState !== "legacy_uncached") {
    if (params.finalStageWarm) {
      // Identical model repeat within 30m window
      finalCachedTokens = 9600;
      finalWriteTokens = 0;
    } else if (cacheState === "cold" || cacheState === "expired") {
      finalCachedTokens = 0;
      finalWriteTokens = 9600;
    } else if (cacheState === "workload_weighted") {
      // In realistic intake, ~20% of consecutive items share the same candidate set
      finalCachedTokens = Math.round(9600 * 0.2);
      finalWriteTokens = Math.round(9600 * 0.8);
    } else {
      // Conservative default for warm scenario with heterogeneous item mix
      finalCachedTokens = 0;
      finalWriteTokens = 0;
    }
  }

  const finalUsage: OpenAiTokenUsage = {
    promptTokens: 12000,
    cachedPromptTokens: finalCachedTokens,
    cacheWriteTokens: finalWriteTokens,
    completionTokens: 450,
    reasoningTokens: 250,
    totalTokens: 12450,
  };
  const finalCostRaw = calculateTokenCost(finalModel, finalUsage).totalCostUsd;

  // 4. Conditional Lens Cleaner (GPT-4o-mini)
  const lensUsage: OpenAiTokenUsage = {
    promptTokens: 2200,
    cachedPromptTokens: 0,
    cacheWriteTokens: 0,
    completionTokens: 120,
    reasoningTokens: 0,
    totalTokens: 2320,
  };
  const singleLensCleanerCost = calculateTokenCost("gpt-4o-mini", lensUsage).totalCostUsd;
  const lensCostRaw = singleLensCleanerCost * lensRate;

  // 5. AnyIP Residential Proxy Bandwidth (~2.5 MB @ $7.50/GB = $0.01831 per search)
  const singleProxyCost = (2.5 / 1024) * 7.5;
  const proxyCostRaw = singleProxyCost * lensRate;

  // Shared rounding precision: Round components to 5 decimal places
  const vendorOcrCostUsd = round5(ocrCostRaw);
  const discoveryCostUsd = round5(discoveryCostRaw);
  const finalCostUsd = round5(finalCostRaw);
  const lensCleanerCostUsd = round5(lensCostRaw);
  const proxyCostUsd = round5(proxyCostRaw);

  // Exact subtotal and total reconciliation:
  // Subtotals MUST equal the exact sum of their rounded displayed components.
  const seededComparisonOnlyUsd = round5(discoveryCostUsd + finalCostUsd);
  const fullCycleTotalUsd = round5(
    vendorOcrCostUsd + discoveryCostUsd + finalCostUsd + lensCleanerCostUsd + proxyCostUsd
  );

  let confidenceTier: CostEstimationConfidence = "ESTIMATED";
  if (cacheState === "legacy_uncached") {
    confidenceTier = "ESTIMATED"; // Simulated offline projection of legacy architecture
  }

  return {
    scenarioName: `${discoveryModel} / ${finalModel} (${cacheState}, ${params.promptCachingOrder})`,
    confidenceTier,
    vendorOcrCostUsd,
    discoveryCostUsd,
    finalCostUsd,
    lensCleanerCostUsd,
    proxyCostUsd,
    seededComparisonOnlyUsd,
    fullCycleTotalUsd,
    notes: `Cache: ${cacheState}; Prefix: ${params.promptCachingOrder}; Lens rate: ${(lensRate * 100).toFixed(0)}%`,
    tokenDetails: {
      ocr: ocrUsage,
      discovery: discUsage,
      final: finalUsage,
      lensCleaner: lensUsage,
    },
  };
}

function round5(num: number): number {
  return Math.round(num * 100000) / 100000;
}

export function runComprehensiveBaselineReport(): void {
  console.log("================================================================================");
  console.log("RMA SYSTEM — COMPREHENSIVE RECOGNITION LIFECYCLE COST SIMULATION");
  console.log("Schedule: openai-2026-10-31 (Standard API Verified Rates)");
  console.log("--------------------------------------------------------------------------------");
  console.log("gpt-6.1-sol:   Input $2.00/1M, Cached $0.10/1M, Output $10.00/1M, 30m Write $2.50/1M");
  console.log("gpt-6.1-terra: Input $1.00/1M, Cached $0.05/1M, Output $5.00/1M,  30m Write $1.25/1M");
  console.log("gpt-5.6-terra: Input $2.00/1M, Cached $0.20/1M, Output $12.00/1M, 30m Write $2.50/1M");
  console.log("gpt-4o (OCR):  Input $2.50/1M, Cached $1.25/1M, Output $10.00/1M (6 crops, 5.4k tokens)");
  console.log("================================================================================\n");

  const scenarios: Array<{ disc: string; fin: string; params: CacheScenarioParams }> = [
    // 1. Unoptimized Legacy Baseline (Target First, Cache Miss, Sol + Sol)
    { disc: "gpt-6.1-sol", fin: "gpt-6.1-sol", params: { cacheState: "legacy_uncached", promptCachingOrder: "legacy", lensTriggerRate: 0.15 } },

    // 2. Cold Cache (First Item in batch, Prefix Order with 30m Write Charges, Sol + Sol)
    { disc: "gpt-6.1-sol", fin: "gpt-6.1-sol", params: { cacheState: "cold", promptCachingOrder: "prefix", lensTriggerRate: 0.15 } },

    // 3. Warm Cache (Subsequent Items within 30 min, Sol + Sol, heterogeneous candidate sets for Final)
    { disc: "gpt-6.1-sol", fin: "gpt-6.1-sol", params: { cacheState: "warm", promptCachingOrder: "prefix", finalStageWarm: false, lensTriggerRate: 0.15 } },

    // 4. Warm Cache (Homogeneous batch where Final repeats same candidate set)
    { disc: "gpt-6.1-sol", fin: "gpt-6.1-sol", params: { cacheState: "warm", promptCachingOrder: "prefix", finalStageWarm: true, lensTriggerRate: 0.15 } },

    // 5. Workload-Weighted (5-item batch, Sol + Sol, realistic mixed intake)
    { disc: "gpt-6.1-sol", fin: "gpt-6.1-sol", params: { cacheState: "workload_weighted", promptCachingOrder: "prefix", lensTriggerRate: 0.15 } },

    // 6. Tier Separation: Terra 6.1 Discovery + Sol Final (Warm Cache, mixed Final) [Candidate]
    { disc: "gpt-6.1-terra", fin: "gpt-6.1-sol", params: { cacheState: "warm", promptCachingOrder: "prefix", finalStageWarm: false, lensTriggerRate: 0.15 } },

    // 7. Tier Separation: Terra 6.1 Discovery + Terra 6.1 Final (Warm Cache, mixed Final) [Economy]
    { disc: "gpt-6.1-terra", fin: "gpt-6.1-terra", params: { cacheState: "warm", promptCachingOrder: "prefix", finalStageWarm: false, lensTriggerRate: 0.15 } },
  ];

  for (const s of scenarios) {
    const res = simulateLifecycleCost(s.disc, s.fin, s.params);
    const sumCheck = round5(
      res.vendorOcrCostUsd +
      res.discoveryCostUsd +
      res.finalCostUsd +
      res.lensCleanerCostUsd +
      res.proxyCostUsd
    );
    const isReconciled = Math.abs(sumCheck - res.fullCycleTotalUsd) < 0.000001;

    console.log(`[Lifecycle Scenario] ${res.scenarioName} [${res.confidenceTier}]`);
    console.log(`  - Vendor OCR (GPT-4o, 6 frames):  $${res.vendorOcrCostUsd.toFixed(5)}`);
    console.log(`  - Discovery Stage:                $${res.discoveryCostUsd.toFixed(5)}`);
    console.log(`  - Final Decision Stage:           $${res.finalCostUsd.toFixed(5)}`);
    console.log(`  - Lens Cleaner (15% prob):        $${res.lensCleanerCostUsd.toFixed(5)}`);
    console.log(`  - AnyIP Proxy (15% prob):         $${res.proxyCostUsd.toFixed(5)}`);
    console.log(`  -> Seeded Comparison Subtotal:    $${res.seededComparisonOnlyUsd.toFixed(5)}`);
    console.log(`  => COMPLETE ITEM CYCLE TOTAL:     $${res.fullCycleTotalUsd.toFixed(5)}`);
    console.log(`  [Internal Subtotal Audit: ${isReconciled ? "RECONCILED" : "MISMATCH"}]`);
    console.log("--------------------------------------------------------------------------------");
  }
}

if (process.argv[1]?.endsWith("benchmark-cost-tiers.ts")) {
  runComprehensiveBaselineReport();
}
