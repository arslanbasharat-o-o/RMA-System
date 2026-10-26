import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

interface Case {
  sourceItemId: string;
  imageType: string;
  storagePath: string;
  checksumSha256: string;
  expectedManufacturer: string;
  expectedModel: string;
  expectAbsent?: boolean;
}

async function main() {
  const [mode, input, output] = process.argv.slice(2);
  if (!input || !path.isAbsolute(input) || (output && !path.isAbsolute(output))) {
    throw new Error("Use freeze /external/manifest.json, probe /external/photo, or run /external/manifest.json /external/report.json");
  }
  // Protect the production DB even if a future helper accidentally writes.
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.searchParams.set("options", "-c default_transaction_read_only=on");
  process.env.DATABASE_URL = databaseUrl.toString();
  const { db, pool } = await import("../src/db/index");
  const { rmaItems, itemImages, displayCatalog, appSettings } = await import("../src/db/schema");
  const { eq, and, asc, desc } = await import("drizzle-orm");
  const { storage } = await import("../src/lib/storage/index");
  const { loadVerifiedVisualReferences, visualCandidateCatalogIds, hasIndependentVisualCatalogSupport,
    unrepresentedVisualCandidateLabels } = await import("../src/lib/queue/processor");
  const { compareVerifiedLibrary } = await import("../src/lib/recognition/openai/verified-library");
  const { OpenAiVisionOcrService } = await import("../src/lib/recognition/openai/vision");
  const { shouldApplyVerifiedVisualComparison, shouldShowUnconfirmedVerifiedSuggestion } =
    await import("../src/lib/recognition/verified-feedback");
  const { sameDeviceIdentity, percentile } = await import("../src/lib/recognition/evaluation");
  try {
    if (mode === "freeze" || mode === "freeze-unknown") {
      const rows = await db.select({ sourceItemId: rmaItems.id, imageType: itemImages.imageType,
        storagePath: itemImages.storagePath, checksumSha256: itemImages.checksumSha256,
        expectedManufacturer: displayCatalog.manufacturer, expectedModel: displayCatalog.modelName,
      }).from(rmaItems).innerJoin(itemImages, eq(itemImages.rmaItemId, rmaItems.id))
        .innerJoin(displayCatalog, eq(displayCatalog.id, rmaItems.catalogDisplayId))
        .where(and(eq(rmaItems.status, "verified"), eq(displayCatalog.isActive, true)))
        .orderBy(asc(displayCatalog.manufacturer), asc(displayCatalog.modelName), desc(rmaItems.verifiedAt), asc(itemImages.sortOrder));
      const byModel = new Map<string, Case[]>();
      for (const row of rows) {
        const key = `${row.expectedManufacturer}\0${row.expectedModel}`;
        const examples = byModel.get(key) || [];
        if (!examples.some((example) => example.sourceItemId === row.sourceItemId || example.checksumSha256 === row.checksumSha256)) examples.push(row);
        byModel.set(key, examples);
      }
      let cases = [...byModel.values()].filter((examples) => examples.length >= 2).map((examples) => examples[0]);
      if (mode === "freeze-unknown") {
        const byManufacturer = new Map<string, Case>();
        for (const examples of byModel.values()) {
          if (examples.length === 1 && !byManufacturer.has(examples[0].expectedManufacturer)) {
            byManufacturer.set(examples[0].expectedManufacturer, { ...examples[0], expectAbsent: true });
          }
        }
        cases = [...byManufacturer.values()];
      }
      await fs.writeFile(input, JSON.stringify({ createdAt: new Date().toISOString(),
        protocol: mode === "freeze-unknown"
          ? "One single-example catalog label per manufacturer; remove its sole source item; expect abstention from reference search; no DB writes."
          : "One latest photo per catalog label with >=2 independent items; exclude source item and every target checksum from references; no DB writes.",
        singleExampleLabels: [...byModel.values()].filter((examples) => examples.length < 2).map((examples) => examples[0].expectedModel), cases }, null, 2), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ frozenCases: cases.length, manifestSha256: createHash("sha256").update(await fs.readFile(input)).digest("hex") }));
      return;
    }
    const catalog = await db.select().from(displayCatalog).where(eq(displayCatalog.isActive, true));
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, "OPENAI_VISION_MODEL"));
    const comparator = new OpenAiVisionOcrService(undefined, process.env.EVALUATION_VISION_MODEL ||
      process.env.OPENAI_REFERENCE_MODEL || (typeof setting?.value === "string" ? setting.value : undefined), 120000);
    const infer = async (imageBuffer: Buffer, imageType: string, itemId: string, checksum: string) => {
      const { SelfHostedLensProvider } = await import("../src/lib/recognition/lens/self-hosted");
      const visual = process.env.EVALUATION_WITH_SEARCH === "true"
        ? await new SelfHostedLensProvider().identifyDisplay(imageBuffer, { filename: "display.jpg", noCache: true })
        : null;
      const candidateIds = visual ? visualCandidateCatalogIds(visual, catalog, null, 30) : [];
      const references = await loadVerifiedVisualReferences(itemId, [checksum], candidateIds, catalog);
      const result = await compareVerifiedLibrary(comparator, [{ imageBuffer, imageType }], references,
        unrepresentedVisualCandidateLabels(candidateIds, references, catalog));
      const searchCorroborated = Boolean(visual && hasIndependentVisualCatalogSupport(visual, catalog, result.selectedCatalogDisplayId));
      const selected = catalog.find((model) => model.id === result.selectedCatalogDisplayId);
      // Count independent verified items for the selected device model, not
      // just the assembly SKU the comparison happened to cite.
      const supportingModelReferenceCount = selected
        ? references.filter((reference) => {
            const referenceCatalogItem = catalog.find((entry) => entry.id === reference.catalogDisplayId);
            return referenceCatalogItem &&
              referenceCatalogItem.manufacturer === selected.manufacturer &&
              referenceCatalogItem.modelName === selected.modelName;
          }).length
        : 0;
      return { result, searchCorroborated, searchError: visual?.error || null, supportingModelReferenceCount };
    };
    if (mode === "probe") {
      const imageBuffer = await fs.readFile(input);
      const { result, searchCorroborated, searchError, supportingModelReferenceCount } = await infer(imageBuffer, "back",
        "00000000-0000-0000-0000-000000000000", createHash("sha256").update(imageBuffer).digest("hex"));
      console.log(JSON.stringify({ ...result, searchCorroborated, searchError, supportingModelReferenceCount,
        accepted: shouldApplyVerifiedVisualComparison(result.selectedCatalogDisplayId, result.confidence,
          result.searchedCatalogIds, { unresolvedAlternatives: result.unresolvedAlternatives,
            supportingReferenceCount: supportingModelReferenceCount, searchCorroborated,
            matchingCueCount: result.matchingCues.length }),
        suggested: shouldShowUnconfirmedVerifiedSuggestion(result.selectedCatalogDisplayId, result.confidence,
          supportingModelReferenceCount, result.matchingCues.length, result.unresolvedAlternatives.length),
        selectedModel: catalog.find((model) => model.id === result.selectedCatalogDisplayId)?.modelName }, null, 2));
      return;
    }
    if (mode !== "run" || !output) throw new Error("Unknown evaluation mode or missing output path");
    const manifest = await fs.readFile(input);
    const { cases: frozenCases } = JSON.parse(manifest.toString()) as { cases: Case[] };
    if (!frozenCases?.length) throw new Error("Manifest has no cases");
    const shard = process.env.EVALUATION_SHARD;
    if (shard && !/^\d+\/[1-9]\d*$/.test(shard)) throw new Error("Invalid EVALUATION_SHARD");
    const [shardIndex, shardCount] = (shard || "0/1").split("/").map(Number);
    if (shardIndex >= shardCount) throw new Error("Shard index must be below shard count");
    const cases = frozenCases.filter((_, index) => index % shardCount === shardIndex);
    if (!cases.length) throw new Error("Evaluation shard has no cases");
    const results: Array<Record<string, unknown> & { correct: boolean; accepted: boolean; durationMs: number; error: string | null }> = [];
    for (const test of cases) {
      const started = Date.now();
      try {
        const imageBuffer = await storage.getImageBuffer(test.storagePath);
        if (createHash("sha256").update(imageBuffer).digest("hex") !== test.checksumSha256) throw new Error("Holdout checksum mismatch");
        const { result, searchCorroborated, searchError, supportingModelReferenceCount } =
          await infer(imageBuffer, test.imageType, test.sourceItemId, test.checksumSha256);
        const selected = catalog.find((model) => model.id === result.selectedCatalogDisplayId);
        const accepted = !result.error && shouldApplyVerifiedVisualComparison(result.selectedCatalogDisplayId,
          result.confidence, result.searchedCatalogIds, { unresolvedAlternatives: result.unresolvedAlternatives,
            supportingReferenceCount: supportingModelReferenceCount, searchCorroborated,
            matchingCueCount: result.matchingCues.length });
        const suggested = !result.error && shouldShowUnconfirmedVerifiedSuggestion(
          result.selectedCatalogDisplayId, result.confidence, supportingModelReferenceCount,
          result.matchingCues.length, result.unresolvedAlternatives.length);
        results.push({ sourceItemId: test.sourceItemId, expectedManufacturer: test.expectedManufacturer,
          expectedModel: test.expectedModel, predictedModel: selected?.modelName || null,
          expectAbsent: Boolean(test.expectAbsent),
          correct: test.expectAbsent ? !selected : sameDeviceIdentity(test.expectedManufacturer, test.expectedModel, selected?.manufacturer, selected?.modelName),
          accepted, suggested, supportingModelReferenceCount, searchCorroborated, searchError,
          durationMs: Date.now() - started, error: result.error || null, comparison: result });
      } catch (error) {
        results.push({ sourceItemId: test.sourceItemId, expectedModel: test.expectedModel, correct: false,
          accepted: false, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
      }
      const accepted = results.filter((result) => result.accepted);
      const suggested = results.filter((result) => result.suggested);
      const report = { manifestSha256: createHash("sha256").update(manifest).digest("hex"),
        frozenTotal: frozenCases.length, shard: shard || "0/1", total: cases.length, tested: results.length,
        exactModelAccuracy: results.filter((result) => result.correct).length / cases.length,
        acceptedCoverage: accepted.length / cases.length,
        acceptedPrecision: accepted.length ? accepted.filter((result) => result.correct).length / accepted.length : null,
        suggestedCoverage: suggested.length / cases.length,
        suggestedPrecision: suggested.length ? suggested.filter((result) => result.correct).length / suggested.length : null,
        falseConfidentMatches: accepted.filter((result) => !result.correct).length,
        errors: results.filter((result) => result.error).length,
        p50Ms: percentile(results.map((result) => result.durationMs), 0.5),
        p95Ms: percentile(results.map((result) => result.durationMs), 0.95), results };
      await fs.writeFile(output, JSON.stringify(report, null, 2), { mode: 0o600 });
      const last = results.at(-1)!;
      console.log(JSON.stringify({ completed: results.length, total: cases.length, expected: last.expectedModel,
        predicted: last.predictedModel, correct: last.correct, accepted: last.accepted,
        suggested: last.suggested, error: last.error }));
    }
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
