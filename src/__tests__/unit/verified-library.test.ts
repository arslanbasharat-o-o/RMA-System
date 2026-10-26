import { describe, expect, it, vi } from "vitest";
import { compareVerifiedLibrary } from "@/lib/recognition/openai/verified-library";
import type { VerifiedDisplayReference } from "@/lib/recognition/openai/vision";

function references(count: number): VerifiedDisplayReference[] {
  return Array.from({ length: count }, (_, index) => ({ itemId: `item-${index}`,
    catalogDisplayId: `model-${index}`, label: `Verified model ${index}`,
    images: [{ imageBuffer: Buffer.from("photo"), imageType: "back" }] }));
}
const result = (selectedCatalogDisplayId: string | null, error?: string) => ({
  selectedCatalogDisplayId, confidence: selectedCatalogDisplayId ? 0.96 : 0,
  matchingCues: [], conflictingCues: [], unresolvedAlternatives: [], supportingReferenceItemIds: [], model: "test", durationMs: 1, ...(error ? { error } : {}),
});

describe("verified library discovery", () => {
  it("shortlists the whole small library in one discovery pass and rechecks finalists", async () => {
    const library = references(18);
    const compareToVerifiedExamples = vi.fn(async (_targets, batch: VerifiedDisplayReference[],
      _labels: string[], _options?: { mode?: string }) => {
      const ids = batch.map((reference) => reference.catalogDisplayId);
      return result(ids.includes("model-17") ? "model-17" : ids[0]);
    });
    const comparison = await compareVerifiedLibrary({ compareToVerifiedExamples }, [], library);
    expect(comparison.selectedCatalogDisplayId).toBe("model-17");
    expect(comparison.searchedCatalogIds).toHaveLength(18);
    expect(comparison.discoveryBatches).toHaveLength(1);
    expect(comparison.discoveryBatches[0].catalogIds).toHaveLength(18);
    expect(compareToVerifiedExamples).toHaveBeenCalledTimes(2);
    expect(compareToVerifiedExamples.mock.calls[0][3]).toEqual({ mode: "discovery" });
    expect(compareToVerifiedExamples.mock.calls[1][3]).toEqual({ mode: "final" });
    expect(compareToVerifiedExamples.mock.calls.at(-1)![1].map((reference) => reference.catalogDisplayId))
      .toEqual(["model-0", "model-1", "model-17"]);
  });

  it("falls back to batches for a large library and never asks discovery to confirm an unopposed singleton", async () => {
    const compareToVerifiedExamples = vi.fn(async (_targets, batch: VerifiedDisplayReference[],
      _labels: string[], _options?: { mode?: string }) => {
      expect(new Set(batch.map((reference) => reference.catalogDisplayId)).size).toBeGreaterThanOrEqual(2);
      return result(batch[0].catalogDisplayId);
    });
    await compareVerifiedLibrary({ compareToVerifiedExamples }, [], references(41));
    const discoveryCalls = compareToVerifiedExamples.mock.calls.slice(0, -1);
    expect(discoveryCalls).toHaveLength(6);
    expect(discoveryCalls.map((call) => call[1].length)).toEqual([8, 8, 8, 8, 7, 2]);
    for (const call of discoveryCalls) expect(call[3]).toEqual({ mode: "discovery" });
  });

  it("withholds the result if any library batch fails", async () => {
    const compareToVerifiedExamples = vi.fn(async (_targets, batch: VerifiedDisplayReference[]) =>
      batch.some((reference) => reference.catalogDisplayId === "model-8")
        ? result(null, "provider timeout") : result(batch[0].catalogDisplayId));
    const comparison = await compareVerifiedLibrary({ compareToVerifiedExamples }, [], references(10));
    expect(comparison.selectedCatalogDisplayId).toBeNull();
    expect(comparison.confidence).toBe(0);
    expect(comparison.error).toBe("provider timeout");
  });

  it("falls back to the three closest search candidates when discovery abstains", async () => {
    const library = references(18);
    const compareToVerifiedExamples = vi.fn(async (_targets, batch: VerifiedDisplayReference[]) => {
      const modelCount = new Set(batch.map((reference) => reference.catalogDisplayId)).size;
      return result(modelCount <= 3 ? batch[0].catalogDisplayId : null);
    });
    const comparison = await compareVerifiedLibrary({ compareToVerifiedExamples }, [], library);
    expect(comparison.selectedCatalogDisplayId).toBe("model-0");
    expect(comparison.discoveryBatches).toHaveLength(1);
    expect(compareToVerifiedExamples).toHaveBeenCalledTimes(2);
    expect(new Set(compareToVerifiedExamples.mock.calls.at(-1)![1].map((reference) => reference.catalogDisplayId)).size)
      .toBe(3);
  });

  it("rechecks a sole discovery winner with both examples against only its two closest alternatives", async () => {
    const library = references(10);
    library.push({ ...library[0], itemId: "second-independent-item" });
    const compareToVerifiedExamples = vi.fn(async (_targets, batch: VerifiedDisplayReference[]) =>
      result(batch.some((reference) => reference.catalogDisplayId === "model-0") ? "model-0" : null));
    const comparison = await compareVerifiedLibrary({ compareToVerifiedExamples }, [], library);
    expect(comparison.selectedCatalogDisplayId).toBe("model-0");
    const finalBatch = compareToVerifiedExamples.mock.calls.at(-1)![1];
    expect(new Set(finalBatch.map((reference) => reference.catalogDisplayId)).size).toBe(3);
    expect(new Set(finalBatch.map((reference) => reference.catalogDisplayId)))
      .toEqual(new Set(["model-0", "model-1", "model-2"]));
    expect(finalBatch.filter((reference) => reference.catalogDisplayId === "model-0")).toHaveLength(2);
  });
});
