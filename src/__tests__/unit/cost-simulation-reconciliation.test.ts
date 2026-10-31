import { describe, expect, it } from "vitest";
import { simulateLifecycleCost, type CacheScenarioParams } from "../../../scripts/benchmark-cost-tiers";

describe("Cost Simulator Scenario Subtotal Reconciliation", () => {
  const testScenarios: Array<{
    name: string;
    disc: string;
    fin: string;
    params: CacheScenarioParams;
  }> = [
    {
      name: "Legacy Sol + Sol",
      disc: "gpt-6.1-sol",
      fin: "gpt-6.1-sol",
      params: { cacheState: "legacy_uncached", promptCachingOrder: "legacy" },
    },
    {
      name: "Cold Cache Sol + Sol",
      disc: "gpt-6.1-sol",
      fin: "gpt-6.1-sol",
      params: { cacheState: "cold", promptCachingOrder: "prefix" },
    },
    {
      name: "Warm Cache Sol + Sol (Mixed Final)",
      disc: "gpt-6.1-sol",
      fin: "gpt-6.1-sol",
      params: { cacheState: "warm", promptCachingOrder: "prefix", finalStageWarm: false },
    },
    {
      name: "Warm Cache Sol + Sol (Homogeneous Final)",
      disc: "gpt-6.1-sol",
      fin: "gpt-6.1-sol",
      params: { cacheState: "warm", promptCachingOrder: "prefix", finalStageWarm: true },
    },
    {
      name: "Workload-Weighted Sol + Sol",
      disc: "gpt-6.1-sol",
      fin: "gpt-6.1-sol",
      params: { cacheState: "workload_weighted", promptCachingOrder: "prefix" },
    },
    {
      name: "Terra Discovery + Sol Final (Warm)",
      disc: "gpt-6.1-terra",
      fin: "gpt-6.1-sol",
      params: { cacheState: "warm", promptCachingOrder: "prefix" },
    },
    {
      name: "Terra Discovery + Terra Final (Warm)",
      disc: "gpt-6.1-terra",
      fin: "gpt-6.1-terra",
      params: { cacheState: "warm", promptCachingOrder: "prefix" },
    },
  ];

  for (const s of testScenarios) {
    it(`guarantees subtotal reconciliation for: ${s.name}`, () => {
      const result = simulateLifecycleCost(s.disc, s.fin, s.params);

      // Verify Seeded Comparison Subtotal equals Discovery + Final
      const expectedSeeded = Math.round((result.discoveryCostUsd + result.finalCostUsd) * 100000) / 100000;
      expect(result.seededComparisonOnlyUsd).toBe(expectedSeeded);

      // Verify Full Cycle Total equals sum of all 5 displayed components
      const expectedTotal = Math.round(
        (result.vendorOcrCostUsd +
          result.discoveryCostUsd +
          result.finalCostUsd +
          result.lensCleanerCostUsd +
          result.proxyCostUsd) *
          100000
      ) / 100000;
      expect(result.fullCycleTotalUsd).toBe(expectedTotal);

      // Verify confidence tier is tagged ESTIMATED, not MEASURED
      expect(result.confidenceTier).toBe("ESTIMATED");
    });
  }

  it("models Discovery and Final independently with different token volumes and reasoning", () => {
    const legacy = simulateLifecycleCost("gpt-6.1-sol", "gpt-6.1-sol", {
      cacheState: "legacy_uncached",
      promptCachingOrder: "legacy",
    });

    // Discovery processes 76 references (48k prompt tokens, low completion tokens)
    expect(legacy.tokenDetails.discovery.promptTokens).toBe(48000);
    expect(legacy.tokenDetails.discovery.completionTokens).toBe(60);

    // Final processes 2-3 candidates (12k prompt tokens, 450 completion tokens with 250 reasoning tokens)
    expect(legacy.tokenDetails.final.promptTokens).toBe(12000);
    expect(legacy.tokenDetails.final.completionTokens).toBe(450);
    expect(legacy.tokenDetails.final.reasoningTokens).toBe(250);

    // Costs must be distinct: Discovery is ~$0.09660, Final is ~$0.02850
    expect(legacy.discoveryCostUsd).toBe(0.0966);
    expect(legacy.finalCostUsd).toBe(0.0285);
    expect(legacy.discoveryCostUsd).not.toBe(legacy.finalCostUsd);
  });

  it("handles Final-stage candidate set variability conservatively", () => {
    // When finalStageWarm is false (mixed item batch), Final does not get prefix hit
    const mixedBatch = simulateLifecycleCost("gpt-6.1-sol", "gpt-6.1-sol", {
      cacheState: "warm",
      promptCachingOrder: "prefix",
      finalStageWarm: false,
    });

    // When finalStageWarm is true (identical item repeat), Final gets candidate prefix hit
    const repeatedBatch = simulateLifecycleCost("gpt-6.1-sol", "gpt-6.1-sol", {
      cacheState: "warm",
      promptCachingOrder: "prefix",
      finalStageWarm: true,
    });

    // Discovery warm cost is identical in both ($0.01878)
    expect(mixedBatch.discoveryCostUsd).toBe(0.01878);
    expect(repeatedBatch.discoveryCostUsd).toBe(0.01878);

    // Final cost in mixed batch is uncached ($0.02850) vs cached in repeated batch ($0.01026)
    expect(mixedBatch.finalCostUsd).toBe(0.0285);
    expect(repeatedBatch.finalCostUsd).toBe(0.01026);
  });
});
