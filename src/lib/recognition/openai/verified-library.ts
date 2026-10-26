import type { OpenAiVisionOcrService, VerifiedDisplayComparisonResult, VerifiedDisplayReference } from "./vision";

type TargetImages = Parameters<OpenAiVisionOcrService["compareToVerifiedExamples"]>[0];
type Comparator = Pick<OpenAiVisionOcrService, "compareToVerifiedExamples">;

export interface VerifiedLibraryComparison extends VerifiedDisplayComparisonResult {
  searchedCatalogIds: string[];
  discoveryBatches: Array<{
    catalogIds: string[];
    selectedCatalogDisplayId: string | null;
    confidence: number;
    error?: string;
  }>;
  timings: {
    discoveryMs: number;
    finalMs: number;
    totalMs: number;
  };
}

/** Bounded parallelism: every discovery batch runs in the same round. */
async function mapWithConcurrency<T, R>(items: T[], limit: number,
  run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await run(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Search verified models independently of web results, then recheck finalists. */
export async function compareVerifiedLibrary(
  comparator: Comparator,
  targets: TargetImages,
  references: VerifiedDisplayReference[],
  catalogModelLabels: string[] = []
): Promise<VerifiedLibraryComparison> {
  const started = Date.now();
  const searchedCatalogIds = [...new Set(references.map((reference) => reference.catalogDisplayId))];
  const discoveryBatches: VerifiedLibraryComparison["discoveryBatches"] = [];
  const timings = { discoveryMs: 0, finalMs: 0 };
  const finish = (result: VerifiedDisplayComparisonResult): VerifiedLibraryComparison => ({
    ...result, durationMs: Date.now() - started, searchedCatalogIds, discoveryBatches,
    timings: { ...timings, totalMs: Date.now() - started },
  });
  if (searchedCatalogIds.length <= 8) {
    const finalStarted = Date.now();
    const result = await comparator.compareToVerifiedExamples(targets, references, catalogModelLabels,
      { mode: "final" });
    timings.finalMs += Date.now() - finalStarted;
    return finish(result);
  }

  // A compact discovery call over the whole verified library is cheaper than
  // several sequential batch rounds while the library is small. Larger
  // libraries fall back to bounded batch discovery below.
  const maxDiscoveryModels = Math.max(9,
    Math.floor(Number(process.env.VERIFIED_DISCOVERY_MAX_MODELS) || 32));
  let remaining = searchedCatalogIds;
  if (searchedCatalogIds.length <= maxDiscoveryModels) {
    const discoveryStarted = Date.now();
    const discovery = await comparator.compareToVerifiedExamples(targets, references,
      catalogModelLabels, { mode: "discovery" });
    timings.discoveryMs += Date.now() - discoveryStarted;
    discoveryBatches.push({ catalogIds: searchedCatalogIds,
      selectedCatalogDisplayId: discovery.selectedCatalogDisplayId,
      confidence: discovery.confidence, ...(discovery.error ? { error: discovery.error } : {}) });
    if (discovery.error) {
      return finish({ ...discovery, selectedCatalogDisplayId: null, confidence: 0 });
    }
    if (discovery.selectedCatalogDisplayId) {
      // Recheck a sole finalist against its closest search-ranked alternatives,
      // never against itself.
      remaining = [discovery.selectedCatalogDisplayId,
        ...searchedCatalogIds.filter((id) => id !== discovery.selectedCatalogDisplayId).slice(0, 2)];
    } else {
      // Discovery can abstain even when the top search-ranked model has two
      // strong references. Recheck the three closest search candidates before
      // giving up; the normal acceptance policy still applies to the result.
      remaining = searchedCatalogIds.slice(0, 3);
      if (remaining.length < 2) {
        return finish({ ...discovery, selectedCatalogDisplayId: null, confidence: 0 });
      }
    }
  }

  // shortcut: full-library batches suit a small verified catalog; use embedding
  // retrieval when the number of models makes discovery latency unacceptable.
  while (remaining.length > 8) {
    const batches: string[][] = [];
    for (let offset = 0; offset < remaining.length; offset += 8) batches.push(remaining.slice(offset, offset + 8));
    // Avoid an unopposed final batch of one model.
    if (batches.at(-1)?.length === 1) batches.at(-1)!.unshift(batches.at(-2)!.pop()!);
    // Every batch is independent. Running them in one bounded round turns
    // discovery from two sequential model calls into one.
    const discoveryStarted = Date.now();
    const results = await mapWithConcurrency(batches,
      Math.max(1, Math.floor(Number(process.env.OPENAI_CONCURRENCY) || 2)),
      async (catalogIds) => {
        const firstExamples = catalogIds.flatMap((id) => {
          const reference = references.find((entry) => entry.catalogDisplayId === id);
          return reference ? [reference] : [];
        });
        return comparator.compareToVerifiedExamples(targets, firstExamples, catalogModelLabels,
          { mode: "discovery" });
      });
    timings.discoveryMs += Date.now() - discoveryStarted;
    const winners: string[] = [];
    let lastResult: VerifiedDisplayComparisonResult | undefined;
    for (let index = 0; index < results.length; index++) {
      const catalogIds = batches[index];
      const result = results[index];
      discoveryBatches.push({ catalogIds, selectedCatalogDisplayId: result.selectedCatalogDisplayId,
        confidence: result.confidence, ...(result.error ? { error: result.error } : {}) });
      if (result.error) return finish({ ...result, selectedCatalogDisplayId: null, confidence: 0 });
      lastResult = result;
      if (result.selectedCatalogDisplayId) {
        winners.push(result.selectedCatalogDisplayId);
      }
    }
    if (!winners.length) {
      // Discovery can abstain even when the top search-ranked model has two
      // strong references. Recheck the three closest search candidates before
      // giving up; the normal acceptance policy still applies to the result.
      const fallbackCatalogIds = [...new Set(references.map((reference) => reference.catalogDisplayId))].slice(0, 3);
      if (fallbackCatalogIds.length < 2) {
        return finish({ ...lastResult!, selectedCatalogDisplayId: null, confidence: 0 });
      }
      const finalStarted = Date.now();
      const fallback = await comparator.compareToVerifiedExamples(targets,
        references.filter((reference) => fallbackCatalogIds.includes(reference.catalogDisplayId)),
        catalogModelLabels, { mode: "final" });
      timings.finalMs += Date.now() - finalStarted;
      return finish(fallback);
    }
    // Recheck a sole finalist against its closest search-ranked alternatives,
    // never against itself. Sending every model from the batch overloads the
    // comparison with near-identical reference photos and makes the result
    // unstable, so keep the winner plus at most two alternatives.
    const orderedCatalogIds = [...new Set(references.map((reference) => reference.catalogDisplayId))];
    remaining = winners.length === 1
      ? [winners[0], ...orderedCatalogIds.filter((id) => id !== winners[0]).slice(0, 2)]
      : winners;
  }
  const finalStarted = Date.now();
  const finalResult = await comparator.compareToVerifiedExamples(targets,
    references.filter((reference) => remaining.includes(reference.catalogDisplayId)),
    catalogModelLabels, { mode: "final" });
  timings.finalMs += Date.now() - finalStarted;
  return finish(finalResult);
}
