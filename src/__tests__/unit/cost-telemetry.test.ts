import { describe, it, expect } from "vitest";
import {
  calculateTokenCost,
  extractUsageFromResponse,
  resolvePricingRate,
} from "@/lib/recognition/openai/cost";

describe("OpenAI Cost Estimator and Telemetry (Mutually Exclusive Token Accounting)", () => {
  it("resolves official verified pricing rates accurately and distinctly for each model", () => {
    // Flagship: gpt-6.1-sol
    const sol = resolvePricingRate("gpt-6.1-sol");
    expect(sol.rate.inputPerMillion).toBe(2.0);
    expect(sol.rate.cachedInputPerMillion).toBe(0.1);
    expect(sol.rate.outputPerMillion).toBe(10.0);
    expect(sol.rate.cacheWritePerMillion).toBe(2.5);
    expect(sol.rate.cacheWrite12hPerMillion).toBe(5.0);

    // Efficient Visual Reasoning: gpt-6.1-terra
    const terra61 = resolvePricingRate("gpt-6.1-terra");
    expect(terra61.rate.inputPerMillion).toBe(1.0);
    expect(terra61.rate.cachedInputPerMillion).toBe(0.05);
    expect(terra61.rate.outputPerMillion).toBe(5.0);
    expect(terra61.rate.cacheWritePerMillion).toBe(1.25);
    expect(terra61.rate.cacheWrite12hPerMillion).toBe(2.5);

    // Prior Visual Reasoning: gpt-5.6-terra (strictly distinct from Terra 6.1)
    const terra56 = resolvePricingRate("gpt-5.6-terra");
    expect(terra56.rate.inputPerMillion).toBe(2.0);
    expect(terra56.rate.cachedInputPerMillion).toBe(0.2);
    expect(terra56.rate.outputPerMillion).toBe(12.0);
    expect(terra56.rate.cacheWritePerMillion).toBe(2.5);
    expect(terra56.rate.cacheWrite12hPerMillion).toBe(5.0);

    expect(terra61.rate.inputPerMillion).not.toBe(terra56.rate.inputPerMillion);
    expect(terra61.rate.outputPerMillion).not.toBe(terra56.rate.outputPerMillion);
    expect(terra61.rate.cachedInputPerMillion).not.toBe(terra56.rate.cachedInputPerMillion);
  });

  it("regression: calculates exact cold request cost on GPT-6.1 Sol without double-counting cache writes", () => {
    // Cold request:
    // 48,000 total input tokens
    // 40,960 cache-write tokens
    // 0 cached-read tokens
    // 7,040 uncached tokens
    // 60 completion tokens
    const cost = calculateTokenCost("gpt-6.1-sol", {
      promptTokens: 48000,
      cacheWriteTokens: 40960,
      cachedPromptTokens: 0,
      completionTokens: 60,
    });

    expect(cost.isReconciled).toBe(true);
    expect(cost.cacheWriteCostUsd).toBe(0.1024); // 40,960 * $2.50 / 1M
    expect(cost.uncachedInputCostUsd).toBe(0.01408); // 7,040 * $2.00 / 1M
    expect(cost.cachedInputCostUsd).toBe(0);
    expect(cost.outputCostUsd).toBe(0.0006); // 60 * $10.00 / 1M
    expect(cost.totalCostUsd).toBe(0.11708);
  });

  it("regression: calculates exact warm request cost on GPT-6.1 Sol with prompt-cache discount", () => {
    // Warm request:
    // 48,000 total input tokens
    // 0 cache-write tokens
    // 40,960 cached-read tokens
    // 7,040 uncached tokens
    // 60 completion tokens
    const cost = calculateTokenCost("gpt-6.1-sol", {
      promptTokens: 48000,
      cacheWriteTokens: 0,
      cachedPromptTokens: 40960,
      completionTokens: 60,
    });

    expect(cost.isReconciled).toBe(true);
    expect(cost.cachedInputCostUsd).toBe(0.004096); // 40,960 * $0.10 / 1M
    expect(cost.uncachedInputCostUsd).toBe(0.01408); // 7,040 * $2.00 / 1M
    expect(cost.cacheWriteCostUsd).toBe(0);
    expect(cost.outputCostUsd).toBe(0.0006); // 60 * $10.00 / 1M
    expect(cost.totalCostUsd).toBe(0.018776);
  });

  it("regression: calculates exact legacy uncached request cost on GPT-6.1 Sol", () => {
    // Legacy uncached request:
    // 48,000 uncached input tokens
    // 60 completion tokens
    const cost = calculateTokenCost("gpt-6.1-sol", {
      promptTokens: 48000,
      cacheWriteTokens: 0,
      cachedPromptTokens: 0,
      completionTokens: 60,
    });

    expect(cost.isReconciled).toBe(true);
    expect(cost.uncachedInputCostUsd).toBe(0.096); // 48,000 * $2.00 / 1M
    expect(cost.outputCostUsd).toBe(0.0006); // 60 * $10.00 / 1M
    expect(cost.totalCostUsd).toBe(0.0966);
  });

  it("regression: two-request comparison proves immediate savings on second request", () => {
    const legacyOne = calculateTokenCost("gpt-6.1-sol", {
      promptTokens: 48000,
      completionTokens: 60,
    }).totalCostUsd;
    const legacyTwo = legacyOne * 2;
    expect(legacyTwo).toBe(0.1932);

    const coldCost = calculateTokenCost("gpt-6.1-sol", {
      promptTokens: 48000,
      cacheWriteTokens: 40960,
      completionTokens: 60,
    }).totalCostUsd;

    const warmCost = calculateTokenCost("gpt-6.1-sol", {
      promptTokens: 48000,
      cachedPromptTokens: 40960,
      completionTokens: 60,
    }).totalCostUsd;

    const twoRequestCachedTotal = Number((coldCost + warmCost).toFixed(6));
    expect(twoRequestCachedTotal).toBe(0.135856);
    expect(twoRequestCachedTotal).toBeLessThan(legacyTwo);
  });

  it("calculates cold and warm requests on GPT-6.1 Terra accurately", () => {
    // Terra 6.1: Input $1.00/1M, Cached $0.05/1M, Write $1.25/1M, Output $5.00/1M
    // Cold: 40,960 write ($0.05120) + 7,040 uncached ($0.00704) + 60 output ($0.00030) = $0.05854
    const cold = calculateTokenCost("gpt-6.1-terra", {
      promptTokens: 48000,
      cacheWriteTokens: 40960,
      completionTokens: 60,
    });
    expect(cold.cacheWriteCostUsd).toBe(0.0512);
    expect(cold.uncachedInputCostUsd).toBe(0.00704);
    expect(cold.outputCostUsd).toBe(0.0003);
    expect(cold.totalCostUsd).toBe(0.05854);

    // Warm: 40,960 read ($0.002048) + 7,040 uncached ($0.00704) + 60 output ($0.00030) = $0.009388
    const warm = calculateTokenCost("gpt-6.1-terra", {
      promptTokens: 48000,
      cachedPromptTokens: 40960,
      completionTokens: 60,
    });
    expect(warm.cachedInputCostUsd).toBe(0.002048);
    expect(warm.uncachedInputCostUsd).toBe(0.00704);
    expect(warm.totalCostUsd).toBe(0.009388);
  });

  it("calculates 12-hour extended cache retention writes correctly where specified", () => {
    // Extended (12h) rate on gpt-6.1-sol is $5.00 / 1M
    const extendedCost = calculateTokenCost(
      "gpt-6.1-sol",
      {
        promptTokens: 48000,
        cacheWriteTokens: 40960,
        completionTokens: 60,
      },
      { cacheRetentionTier: "12h" }
    );

    expect(extendedCost.cacheWriteCostUsd).toBe(0.2048); // 40,960 * $5.00 / 1M
    expect(extendedCost.uncachedInputCostUsd).toBe(0.01408);
    expect(extendedCost.totalCostUsd).toBe(0.21948);
  });

  it("flags inconsistent and negative usage as unreconciled without silent zero clamping", () => {
    // Case 1: cachedReads + cacheWrites exceeds promptTokens
    const overReported = calculateTokenCost("gpt-6.1-sol", {
      promptTokens: 10000,
      cachedPromptTokens: 8000,
      cacheWriteTokens: 5000, // 8,000 + 5,000 = 13,000 > 10,000
      completionTokens: 100,
    });
    expect(overReported.isReconciled).toBe(false);
    expect(overReported.isEstimated).toBe(true);
    expect(overReported.notes?.some((n) => n.includes("exceed total prompt tokens"))).toBe(true);

    // Case 2: negative token usage
    const negativeTokens = calculateTokenCost("gpt-6.1-sol", {
      promptTokens: -500,
      completionTokens: 100,
    });
    expect(negativeTokens.isReconciled).toBe(false);
    expect(negativeTokens.isEstimated).toBe(true);
    expect(negativeTokens.notes?.some((n) => n.includes("Negative token counts"))).toBe(true);
  });

  it("does NOT double-count reasoning tokens already in completion tokens", () => {
    // OpenAI bills reasoning tokens as part of completion_tokens
    // 2,000 completion tokens, of which 1,500 are reasoning tokens
    // Model: gpt-6.1-terra ($5 / 1M output)
    // Output cost: 2,000 * $5 / 1M = $0.0100 (NOT 2,000 + 1,500)
    const cost = calculateTokenCost("gpt-6.1-terra", {
      promptTokens: 5000,
      cachedPromptTokens: 0,
      completionTokens: 2000,
      reasoningTokens: 1500,
    });

    expect(cost.outputCostUsd).toBe(0.01);
    expect(cost.uncachedInputCostUsd).toBe(0.005);
    expect(cost.totalCostUsd).toBe(0.015);
  });

  it("strictly distinguishes missing usage from explicit zero token usage", () => {
    const missingUsage = extractUsageFromResponse(undefined);
    expect(missingUsage.isUsageMissing).toBe(true);

    const costMissing = calculateTokenCost("gpt-6.1-sol", missingUsage);
    expect(costMissing.totalCostUsd).toBe(0);
    expect(costMissing.isEstimated).toBe(true);
    expect(costMissing.isReconciled).toBe(false);

    const explicitZero = extractUsageFromResponse({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
    expect(explicitZero.isUsageMissing).toBe(false);

    const costZero = calculateTokenCost("gpt-6.1-sol", explicitZero);
    expect(costZero.totalCostUsd).toBe(0);
    expect(costZero.isEstimated).toBe(false);
    expect(costZero.isReconciled).toBe(true);
  });
});
