import { db, pool } from "@/db";
import {
  rmaItems,
  itemImages,
  recognitionRuns,
  ocrExtractions,
  recognitionCandidates,
  displayCatalog,
  vendors,
  vendorVariants,
  vendorRecognitionRules,
  appSettings,
  reviewActions,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { getVisualRecognitionProvider, VisualIdentificationResult } from "@/lib/recognition/lens";
import { OpenAiVisionOcrService, type VerifiedDisplayReference } from "@/lib/recognition/openai";
import { selectDisplayImagesForOcr } from "@/lib/recognition/openai/preprocessor";
import { cleanRawCandidateTitle } from "@/lib/recognition/lens/cleaner-utils";
import { extractAppleModels, independentSource } from "@/lib/recognition/lens/model-evidence";
import {
  VISUAL_DECISION_POLICY,
  isCurrentVisualDecisionPolicy,
  readVisualDecisionSnapshot,
  snapshotVisualDecision,
  stableVisualDecision,
  visualResultFromSnapshot,
  type VisualDecisionSnapshot,
} from "@/lib/recognition/lens/stable-decision";
import { getManualModelOverride } from "@/lib/recognition/manual-model";
import {
  addVerifiedPartNumbersToCatalog,
  findVerifiedPartNumberConflicts,
  shouldApplyVerifiedVisualComparison,
  type VerifiedDisplayExample,
} from "@/lib/recognition/verified-feedback";
import { VendorRuleMatcher } from "@/lib/recognition/rules/matcher";
import {
  matchDisplayToCatalog,
  synthesizeRecognition,
} from "@/lib/recognition/synthesizer";

export interface ProcessItemOptions {
  pipeline?: "all" | "visual" | "vendor_ocr";
  force?: boolean;
  revision?: number;
}

async function updateItemForRevision(
  itemId: string,
  revision: number,
  values: Partial<typeof rmaItems.$inferInsert>
) {
  return db
    .update(rmaItems)
    .set(values)
    .where(and(eq(rmaItems.id, itemId), eq(rmaItems.recognitionRevision, revision)));
}

async function withImageRecognitionLock<T>(checksumSha256: string, operation: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let acquired = false;
  try {
    // Session-scoped locks coordinate all RMA app/worker processes, not just
    // jobs running in the same Node process. The lock is released automatically
    // if the worker exits or loses its database connection.
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [checksumSha256]);
    acquired = true;
    return await operation();
  } catch (error) {
    if (!acquired) client.release(true);
    throw error;
  } finally {
    if (acquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [checksumSha256]);
        client.release();
      } catch {
        // A connection with an uncertain lock state must not return to the pool.
        client.release(true);
      }
    }
  }
}

async function previousVisualDecisions(
  checksumSha256: string,
  excludeManualItemId?: string
): Promise<VisualDecisionSnapshot[]> {
  const matchingImages = await db.select({ rmaItemId: itemImages.rmaItemId })
    .from(itemImages).where(eq(itemImages.checksumSha256, checksumSha256));
  const itemIds = [...new Set(matchingImages.map((image) => image.rmaItemId))];
  if (!itemIds.length) return [];

  const [runs, allImages, reviews] = await Promise.all([
    db.select({ rmaItemId: recognitionRuns.rmaItemId,
      rawRequest: recognitionRuns.rawRequest, rawResponse: recognitionRuns.rawResponse,
      createdAt: recognitionRuns.createdAt })
      .from(recognitionRuns)
      .where(and(
        inArray(recognitionRuns.rmaItemId, itemIds),
        eq(recognitionRuns.pipelineType, "visual"),
        eq(recognitionRuns.status, "completed")
      ))
      .orderBy(desc(recognitionRuns.createdAt)).limit(100),
    db.select({ rmaItemId: itemImages.rmaItemId, imageType: itemImages.imageType,
      checksumSha256: itemImages.checksumSha256, sortOrder: itemImages.sortOrder,
      originalFilename: itemImages.originalFilename, createdAt: itemImages.createdAt })
      .from(itemImages).where(inArray(itemImages.rmaItemId, itemIds)).orderBy(itemImages.sortOrder),
    db.select().from(reviewActions).where(inArray(reviewActions.rmaItemId, itemIds))
      .orderBy(desc(reviewActions.createdAt)),
  ]);

  const snapshots: VisualDecisionSnapshot[] = [];
  const imagesByItem = new Map<string, typeof allImages>();
  for (const image of allImages) {
    const group = imagesByItem.get(image.rmaItemId) || [];
    group.push(image);
    imagesByItem.set(image.rmaItemId, group);
  }
  const reviewsByItem = new Map<string, typeof reviews>();
  for (const review of reviews) {
    const group = reviewsByItem.get(review.rmaItemId) || [];
    group.push(review);
    reviewsByItem.set(review.rmaItemId, group);
  }
  for (const itemId of itemIds) {
    if (itemId === excludeManualItemId) continue;
    const selectedImage = selectedRecognitionImage(imagesByItem.get(itemId) || []);
    if (selectedImage?.checksumSha256 !== checksumSha256) continue;
    const manual = getManualModelOverride(reviewsByItem.get(itemId) || []);
    if (!manual) continue;
    snapshots.push({
      manual: true,
      manufacturer: manual.predictedManufacturer,
      model: manual.predictedModel,
      displayAssembly: manual.predictedDisplayAssembly,
      candidates: [],
      cleanDecision: {
        manufacturer: manual.predictedManufacturer,
        model: manual.predictedModel,
        displayName: manual.predictedDisplayAssembly,
        confidence: 1,
        cleanedCandidates: [],
        reasoning: "An operator confirmed this exact image on an earlier RMA item.",
      },
    });
  }
  for (const run of runs) {
    const request = run.rawRequest as Record<string, unknown> | null;
    if (!request) continue;
    // Older policies repeatedly re-used contradictory or unresolved results.
    // Keep them in history, but only reuse evidence produced by the active policy.
    if (!isCurrentVisualDecisionPolicy(request)) continue;
    if (typeof request.checksumSha256 === "string" && request.checksumSha256 !== checksumSha256) continue;
    const selectedImage = selectedRecognitionImage(imagesByItem.get(run.rmaItemId) || []);
    if (selectedImage?.checksumSha256 !== checksumSha256) continue;
    // Older releases did not persist image checksums. Match their filename and
    // ensure the current primary image existed before the historical run.
    if (typeof request.checksumSha256 !== "string" && (
      (typeof request.filename === "string" && request.filename !== selectedImage.originalFilename) ||
      selectedImage.createdAt > run.createdAt
    )) continue;
    const snapshot = readVisualDecisionSnapshot(run.rawResponse);
    if (snapshot && !(excludeManualItemId && run.rmaItemId === excludeManualItemId)) snapshots.push(snapshot);
  }
  return snapshots;
}

function selectedRecognitionImage<T extends { imageType: string; sortOrder: number }>(images: T[]): T | undefined {
  return images.find((image) => image.imageType === "primary" || image.imageType === "front") || images[0];
}

async function loadVerifiedDisplayExamples(excludeItemId: string): Promise<VerifiedDisplayExample[]> {
  // Integration tests share a disposable database and execute concurrently;
  // synthetic verified fixtures must not become each other's feedback. Unit
  // tests cover the feedback rules, and a dedicated integration test can opt in.
  if (process.env.NODE_ENV === "test" && process.env.TEST_VERIFIED_FEEDBACK !== "true") {
    return [];
  }

  const rows = await db
    .select({
      itemId: rmaItems.id,
      catalogDisplayId: rmaItems.catalogDisplayId,
      partNumbers: ocrExtractions.partNumbers,
      runRevision: recognitionRuns.recognitionRevision,
    })
    .from(ocrExtractions)
    .innerJoin(rmaItems, eq(ocrExtractions.rmaItemId, rmaItems.id))
    .innerJoin(recognitionRuns, eq(ocrExtractions.recognitionRunId, recognitionRuns.id))
    .where(and(
      eq(rmaItems.status, "verified"),
      isNotNull(rmaItems.catalogDisplayId),
      ne(rmaItems.id, excludeItemId),
      eq(recognitionRuns.pipelineType, "vendor_ocr"),
      eq(recognitionRuns.status, "completed")
    ))
    .orderBy(desc(rmaItems.verifiedAt))
    .limit(10000);

  const latestRevisionByItem = new Map<string, number>();
  for (const row of rows) {
    latestRevisionByItem.set(row.itemId, Math.max(latestRevisionByItem.get(row.itemId) || -1, row.runRevision));
  }
  return rows
    .filter((row) => row.runRevision === latestRevisionByItem.get(row.itemId))
    .map((row) => ({
      itemId: row.itemId,
      catalogDisplayId: row.catalogDisplayId,
      partNumbers: row.partNumbers || [],
    }));
}

async function loadVerifiedVisualReferenceRows(
  excludeItemId: string,
  catalogIds: string[]
) {
  if (catalogIds.length < 2) return [];
  return db
    .select({
      itemId: rmaItems.id,
      catalogDisplayId: rmaItems.catalogDisplayId,
      verifiedAt: rmaItems.verifiedAt,
      imageType: itemImages.imageType,
      storagePath: itemImages.storagePath,
      checksumSha256: itemImages.checksumSha256,
      sortOrder: itemImages.sortOrder,
    })
    .from(rmaItems)
    .innerJoin(itemImages, eq(itemImages.rmaItemId, rmaItems.id))
    .where(and(
      eq(rmaItems.status, "verified"),
      isNotNull(rmaItems.catalogDisplayId),
      inArray(rmaItems.catalogDisplayId, catalogIds),
      ne(rmaItems.id, excludeItemId)
    ))
    .orderBy(desc(rmaItems.verifiedAt), asc(itemImages.sortOrder))
    .limit(200);
}

export function visualCandidateCatalogIds(
  visualResult: VisualIdentificationResult,
  catalog: Parameters<typeof matchDisplayToCatalog>[1],
  preferredCatalogId?: string | null
): string[] {
  const decision = visualResult.cleanDecision;
  const rankedCandidates = [...visualResult.candidates]
    .filter((candidate) => Number.isFinite(candidate.rank) && candidate.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 30);
  const mentionsAppleModel = rankedCandidates.some((candidate) => extractAppleModels(candidate.title).length > 0);

  if (decision?.manufacturer?.toLowerCase() === "apple" || mentionsAppleModel) {
    const displayListing = /\b(?:screen|display|lcd|oled|amoled|digitizer|touch\s*screen|panel|assembly|replacement)\b/i;
    const accessoryListing = /\b(?:case|cover|screen\s*protector|tempered\s*glass|camera\s*lens|charger|cable|battery|adhesive|glue|repair\s*kit|tools?)\b/i;
    const otherDevice = /\b(?:galaxy|samsung|pixel|google|oneplus|one\s*plus|xiaomi|redmi|poco|oppo|realme|vivo|huawei|honor|motorola|nokia|sony|xperia|lg|zte|tcl)\b/i;
    const votes = new Map<string, { score: number; sources: Set<string> }>();
    const seenVotes = new Set<string>();

    for (const candidate of rankedCandidates) {
      const models = extractAppleModels(candidate.title);
      if (
        models.length !== 1 ||
        otherDevice.test(candidate.title) ||
        accessoryListing.test(candidate.title) ||
        !displayListing.test(candidate.title)
      ) continue;

      const source = independentSource(candidate.sourceUrl, candidate.sourceName);
      if (!source) continue;
      const voteKey = `${models[0]}\u0000${source}`;
      if (seenVotes.has(voteKey)) continue;
      seenVotes.add(voteKey);

      const evidence = votes.get(models[0]) || { score: 0, sources: new Set<string>() };
      evidence.score += 1 / Math.log2(candidate.rank + 1);
      evidence.sources.add(source);
      votes.set(models[0], evidence);
    }

    const rankedVotes = [...votes].sort((a, b) => b[1].score - a[1].score);
    const [winner, runner] = rankedVotes;
    const voteMargin = runner && winner ? winner[1].score / runner[1].score : Number.POSITIVE_INFINITY;
    const sourceMargin = runner && winner
      ? winner[1].sources.size / runner[1].sources.size
      : Number.POSITIVE_INFINITY;
    const decisiveVote = Boolean(
      winner &&
      winner[1].sources.size >= 3 &&
      voteMargin >= 1.8 &&
      sourceMargin >= 1.8
    );

    if (decisiveVote && winner) {
      const decisionModels = decision?.model ? extractAppleModels(decision.model) : [];
      if (
        decision &&
        decision.confidence >= 0.9 &&
        (decision.manufacturer?.toLowerCase() !== "apple" ||
          (decisionModels.length === 1 && decisionModels[0] !== winner[0]))
      ) return [];

      const winnerMatch = matchDisplayToCatalog({
        ...visualResult,
        candidates: [],
        cleanDecision: undefined,
        normalizedManufacturer: "Apple",
        normalizedModel: winner[0],
        detectedDisplayAssembly: `Apple ${winner[0]} Display`,
      }, catalog, []);
      if (!winnerMatch || (preferredCatalogId && preferredCatalogId !== winnerMatch.catalogId)) return [];
      return [winnerMatch.catalogId];
    }

    // If Apple listings were attributable but the vote was not decisive, do
    // not let a single cleaned title break the tie. Keep only the bounded
    // alternatives below for verified-reference comparison.
    if (votes.size > 0) {
      // Continue into the conservative comparison shortlist below.
    } else if (decision?.manufacturer && decision.model && decision.confidence >= 0.9) {
      const winnerMatch = matchDisplayToCatalog({
        ...visualResult,
        candidates: [],
        normalizedManufacturer: decision.manufacturer,
        normalizedModel: decision.model,
        detectedDisplayAssembly: decision.displayName,
      }, catalog, []);
      if (!winnerMatch || (preferredCatalogId && preferredCatalogId !== winnerMatch.catalogId)) return [];
      return [winnerMatch.catalogId];
    }
  } else if (decision?.manufacturer && decision.model && decision.confidence >= 0.9) {
    const winner = matchDisplayToCatalog({
      ...visualResult,
      candidates: [],
      normalizedManufacturer: decision.manufacturer,
      normalizedModel: decision.model,
      detectedDisplayAssembly: decision.displayName,
    }, catalog, []);
    if (!winner || (preferredCatalogId && preferredCatalogId !== winner.catalogId)) return [];
    return [winner.catalogId];
  }

  // Inconclusive votes retain a small alternative set only for the verified
  // reference comparator; it cannot become a final identity by itself.
  const ids = new Set<string>();
  if (preferredCatalogId) ids.add(preferredCatalogId);

  if (visualResult.cleanDecision) {
    const match = matchDisplayToCatalog({ ...visualResult, candidates: [] }, catalog, []);
    if (match) ids.add(match.catalogId);
  }

  for (const candidate of visualResult.candidates.slice(0, 8)) {
    const match = matchDisplayToCatalog({
      ...visualResult,
      candidates: [candidate],
      cleanDecision: undefined,
      normalizedManufacturer: undefined,
      normalizedModel: undefined,
      detectedDisplayAssembly: undefined,
    }, catalog, []);
    if (match) ids.add(match.catalogId);
  }
  const alternatives = [...ids].slice(0, 3);
  return alternatives.length >= 2 ? alternatives : [];
}

async function loadVerifiedVisualReferences(
  excludeItemId: string,
  excludedChecksums: string[],
  catalogIds: string[],
  catalog: Array<{ id: string; manufacturer: string; modelName: string }>
): Promise<VerifiedDisplayReference[]> {
  const rows = await loadVerifiedVisualReferenceRows(excludeItemId, catalogIds);
  const rowsByCatalog = new Map<string, Map<string, typeof rows>>();
  for (const row of rows) {
    if (!row.catalogDisplayId) continue;
    const items = rowsByCatalog.get(row.catalogDisplayId) || new Map<string, typeof rows>();
    const itemImages = items.get(row.itemId) || [];
    itemImages.push(row);
    items.set(row.itemId, itemImages);
    rowsByCatalog.set(row.catalogDisplayId, items);
  }

  const selected: Array<{
    itemId: string;
    catalogDisplayId: string;
    label: string;
    images: Array<{ storagePath: string; imageType: string; checksumSha256: string }>;
  }> = [];
  // Never compare an upload against a copy of any of its own target photos,
  // even if that same photo was previously attached to another verified item.
  const usedChecksums = new Set<string>(excludedChecksums);
  for (const catalogId of catalogIds) {
    const examples = rowsByCatalog.get(catalogId);
    if (!examples) continue;
    const catalogItem = catalog.find((entry) => entry.id === catalogId);
    if (!catalogItem) continue;
    for (const [exampleItemId, images] of examples) {
      const front = selectedRecognitionImage(images);
      const detail = images.find((image) => image.imageType === "flex_cable") ||
        images.find((image) => image.imageType === "back");
      const availableImages = [front, detail]
        .filter((image): image is NonNullable<typeof image> => image !== undefined);
      const chosenImages = availableImages
        .filter((image, index, list) => list.findIndex((other) => other.checksumSha256 === image.checksumSha256) === index)
        .filter((image) => !usedChecksums.has(image.checksumSha256));
      if (!chosenImages.length) continue;
      for (const image of chosenImages) usedChecksums.add(image.checksumSha256);
      selected.push({
        itemId: exampleItemId,
        catalogDisplayId: catalogId,
        label: `${catalogItem.manufacturer} ${catalogItem.modelName}`,
        images: chosenImages.map((image) => ({
          storagePath: image.storagePath,
          imageType: image.imageType,
          checksumSha256: image.checksumSha256,
        })),
      });
      break;
    }
  }

  return Promise.all(selected.map(async (example) => ({
    itemId: example.itemId,
    catalogDisplayId: example.catalogDisplayId,
    label: example.label,
    images: await Promise.all(example.images.map(async (image) => ({
      imageType: image.imageType,
      imageBuffer: await storage.getImageBuffer(image.storagePath),
    }))),
  })));
}

export async function processRmaItem(
  itemId: string,
  options?: ProcessItemOptions
): Promise<void> {
  const pipeline = options?.pipeline || "all";
  console.log(`[Processor] Processing RMA item ${itemId} (pipeline: ${pipeline})...`);

  // 1. Fetch item and images
  const [item] = await db
    .select()
    .from(rmaItems)
    .where(eq(rmaItems.id, itemId));

  if (!item) {
    console.error(`[Processor] Item ${itemId} not found.`);
    return;
  }
  const revision = item.recognitionRevision;
  if (options?.revision !== undefined && options.revision !== revision) {
    console.log(`[Processor] Skipping stale job for item ${itemId} (revision ${options.revision}; current ${revision}).`);
    return;
  }

  // Section 10: Human confirmation must take precedence over automated suggestions unless explicitly re-evaluated
  if (item.status === "verified" && !options?.force) {
    console.log(`[Processor] Item ${itemId} is already verified. Preserving manual confirmation.`);
    return;
  }

  const images = await db
    .select()
    .from(itemImages)
    .where(eq(itemImages.rmaItemId, itemId))
    .orderBy(itemImages.sortOrder);

  if (images.length === 0) {
    await updateItemForRevision(itemId, revision, {
        status: "failed",
        visualError: "No images attached to display item",
        updatedAt: new Date(),
      });
    return;
  }

  const primaryImage = images.find((img) => img.imageType === "primary" || img.imageType === "front") || images[0];

  const shouldRunVisual = pipeline === "all" || pipeline === "visual";
  const shouldRunOcr = pipeline === "all" || pipeline === "vendor_ocr";

  // Update status to processing
  await updateItemForRevision(itemId, revision, {
      status: "processing",
      visualStatus: shouldRunVisual ? "pending" : item.visualStatus,
      vendorOcrStatus: shouldRunOcr ? "pending" : item.vendorOcrStatus,
      updatedAt: new Date(),
    });

  // -------------------------------------------------------------------------
  // Task A: Visual Recognition (Google Lens Adapter)
  // -------------------------------------------------------------------------
  let visualResult: VisualIdentificationResult = {
    provider: "lens",
    candidates: [],
    normalizedManufacturer: item.predictedManufacturer || undefined,
    normalizedModel: item.predictedModel || undefined,
    detectedDisplayAssembly: item.predictedDisplayAssembly || undefined,
    durationMs: 0,
    rawResponse: {},
    error: undefined,
  };

  const visualTask = (async () => {
    if (shouldRunVisual) {
      try {
        let configuredLensProvider: string | undefined = process.env.LENS_PROVIDER;
        try {
          if (!configuredLensProvider && process.env.NODE_ENV !== "test") {
            const [lensSetting] = await db
              .select()
              .from(appSettings)
              .where(eq(appSettings.key, "LENS_PROVIDER"));
            if (lensSetting?.value && typeof lensSetting.value === "string") {
              configuredLensProvider = lensSetting.value;
            }
          }

        } catch {
          // Fallback to env
        }

        await withImageRecognitionLock(primaryImage.checksumSha256, async () => {
          const previous = await previousVisualDecisions(
            primaryImage.checksumSha256,
            options?.force ? itemId : undefined
          );
          const established = stableVisualDecision(previous);
          if (established && !options?.force) {
            visualResult = visualResultFromSnapshot(established, "same-image-evidence");
          } else {
            const imageBuffer = await storage.getImageBuffer(primaryImage.storagePath);
            const lensProvider = getVisualRecognitionProvider(configuredLensProvider);
            const fresh = await lensProvider.identifyDisplay(imageBuffer, {
              filename: primaryImage.originalFilename,
              mimeType: primaryImage.mimeType,
              noCache: options?.force,
            });
            const reconciled = stableVisualDecision(previous, fresh.error ? undefined : snapshotVisualDecision(fresh));
            visualResult = reconciled?.manual
              ? visualResultFromSnapshot(reconciled, "same-image-evidence", fresh.error)
              : options?.force && !fresh.error && fresh.cleanDecision?.model
              ? fresh
              : reconciled && (reconciled.manual || reconciled.conflict ||
                (established && !fresh.error))
              ? visualResultFromSnapshot(reconciled, "same-image-evidence", fresh.error)
                : fresh.error && established
                ? visualResultFromSnapshot(established, "same-image-evidence", fresh.error)
                  : fresh;
          }

          const [run] = await db
            .insert(recognitionRuns)
            .values({
              rmaItemId: itemId,
              recognitionRevision: revision,
              pipelineType: "visual",
              providerName: visualResult.provider,
              status: visualResult.error ? "failed" : "completed",
              rawRequest: {
                filename: primaryImage.originalFilename,
                checksumSha256: primaryImage.checksumSha256,
                decisionPolicy: VISUAL_DECISION_POLICY,
              },
              rawResponse: visualResult.error ? visualResult.rawResponse : {
                ...visualResult.rawResponse,
                stableDecision: snapshotVisualDecision(visualResult),
              },
              durationMs: visualResult.durationMs,
              errorMessage: visualResult.error || null,
            })
            .returning({ id: recognitionRuns.id });

          // Save visual candidates with cleaned titles
          for (let idx = 0; idx < visualResult.candidates.length; idx++) {
            const cand = visualResult.candidates[idx];
            // Keep every title attached to its original source and rank. The LLM's
            // summarized candidate array is not guaranteed to preserve either.
            const cleanTitle = cleanRawCandidateTitle(cand.title) || cand.title;
            await db.insert(recognitionCandidates).values({
              recognitionRunId: run.id,
              rmaItemId: itemId,
              candidateType: "display_model",
              candidateTitle: cleanTitle,
              score: Math.max(1.0 - cand.rank * 0.1, 0.1),
              sourceEvidence: cand.sourceUrl || "Visual Match",
              rank: cand.rank,
            });
          }

          await updateItemForRevision(itemId, revision, {
              visualStatus: visualResult.error ? "failed" : "success",
              visualError: visualResult.error || null,
              updatedAt: new Date(),
            });
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Processor] Task A failed:`, msg);
        visualResult.error = msg;
        await updateItemForRevision(itemId, revision, {
            visualStatus: "failed",
            visualError: msg,
            updatedAt: new Date(),
          });
      }
    } else {
      // Load existing candidates from previous visual runs
      const [latestVisualRun] = await db
        .select({ id: recognitionRuns.id })
        .from(recognitionRuns)
        .where(and(eq(recognitionRuns.rmaItemId, itemId), eq(recognitionRuns.pipelineType, "visual")))
        .orderBy(desc(recognitionRuns.recognitionRevision))
        .limit(1);
      const existingCandidates = latestVisualRun
        ? await db
            .select()
            .from(recognitionCandidates)
            .where(and(
              eq(recognitionCandidates.rmaItemId, itemId),
              eq(recognitionCandidates.recognitionRunId, latestVisualRun.id)
            ))
            .orderBy(recognitionCandidates.rank)
        : [];

      visualResult.candidates = existingCandidates.map((c) => ({
        title: c.candidateTitle,
        sourceUrl: c.sourceEvidence || undefined,
        rank: c.rank || 1,
      }));
    }

  })();

  // -------------------------------------------------------------------------
  // Task B: Multi-Image Vendor OCR & Markings (OpenAI Vision)
  // Scenario C: Recognition uses all relevant images (back, stamp close-up, sticker)
  // -------------------------------------------------------------------------
  let ocrStructured = {
    raw_text: [] as string[],
    detected_codes: [] as string[],
    part_numbers: [] as string[],
    vendor_markings: [] as string[],
    technology_markings: [] as string[],
    possible_vendor_aliases: [] as string[],
    unreadable_regions: [] as string[],
    extraction_notes: [] as string[],
  };

  let ocrHadSuccess = false;
  let lastError: string | null = null;
  let configuredOpenAiVisionModel: string | undefined;

  const ocrTask = (async () => {
    if (shouldRunOcr) {
      try {
        const [setting] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, "OPENAI_VISION_MODEL"));
        if (setting?.value && typeof setting.value === "string") {
          configuredOpenAiVisionModel = setting.value;
        }
      } catch {
        // Fallback to env default
      }

      const ocrService = new OpenAiVisionOcrService(undefined, configuredOpenAiVisionModel);

      const targetImages = selectDisplayImagesForOcr(images);

      for (const img of targetImages) {
        try {
          const imgBuffer = await storage.getImageBuffer(img.storagePath);
          const res = await ocrService.extractMarkings(imgBuffer, {
            filename: img.originalFilename,
            imageType: img.imageType,
          });

          if (res.error) {
            lastError = res.error;
          } else {
            ocrHadSuccess = true;
            // Aggregate unique extracted tokens across all inspected angles
            ocrStructured.raw_text.push(...res.structured.raw_text);
            ocrStructured.detected_codes.push(...res.structured.detected_codes);
            ocrStructured.part_numbers.push(...res.structured.part_numbers);
            ocrStructured.vendor_markings.push(...res.structured.vendor_markings);
            ocrStructured.technology_markings.push(...res.structured.technology_markings);
            ocrStructured.possible_vendor_aliases.push(...res.structured.possible_vendor_aliases);
            ocrStructured.unreadable_regions.push(...res.structured.unreadable_regions);
            ocrStructured.extraction_notes.push(...res.structured.extraction_notes);
          }

          const [run] = await db
            .insert(recognitionRuns)
            .values({
              rmaItemId: itemId,
              recognitionRevision: revision,
              pipelineType: "vendor_ocr",
              providerName: res.model,
              status: res.error ? "failed" : "completed",
              rawRequest: { filename: img.originalFilename, imageType: img.imageType },
              rawResponse: res.rawResponse || {},
              durationMs: res.durationMs,
              errorMessage: res.error || null,
            })
            .returning({ id: recognitionRuns.id });

          await db.insert(ocrExtractions).values({
            recognitionRunId: run.id,
            rmaItemId: itemId,
            rawText: res.structured.raw_text,
            detectedCodes: res.structured.detected_codes,
            partNumbers: res.structured.part_numbers,
            vendorMarkings: res.structured.vendor_markings,
            technologyMarkings: res.structured.technology_markings,
            possibleVendorAliases: res.structured.possible_vendor_aliases,
            unreadableRegions: res.structured.unreadable_regions,
            extractionNotes: res.structured.extraction_notes,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Processor] Task B angle failed:`, msg);
          lastError = msg;
        }
      }

      // Deduplicate aggregated collections
      ocrStructured.raw_text = Array.from(new Set(ocrStructured.raw_text));
      ocrStructured.detected_codes = Array.from(new Set(ocrStructured.detected_codes));
      ocrStructured.part_numbers = Array.from(new Set(ocrStructured.part_numbers));
      ocrStructured.vendor_markings = Array.from(new Set(ocrStructured.vendor_markings));
      ocrStructured.technology_markings = Array.from(new Set(ocrStructured.technology_markings));
      ocrStructured.possible_vendor_aliases = Array.from(new Set(ocrStructured.possible_vendor_aliases));

      await updateItemForRevision(itemId, revision, {
          vendorOcrStatus: ocrHadSuccess ? "success" : "failed",
          vendorOcrError: ocrHadSuccess ? null : lastError,
          updatedAt: new Date(),
        });
    } else {
      // Load existing OCR extractions from previous runs
      const [latestOcrRun] = await db
        .select({ recognitionRevision: recognitionRuns.recognitionRevision })
        .from(recognitionRuns)
        .where(and(eq(recognitionRuns.rmaItemId, itemId), eq(recognitionRuns.pipelineType, "vendor_ocr")))
        .orderBy(desc(recognitionRuns.recognitionRevision))
        .limit(1);
      const latestOcrRuns = latestOcrRun
        ? await db
            .select({ id: recognitionRuns.id })
            .from(recognitionRuns)
            .where(and(
              eq(recognitionRuns.rmaItemId, itemId),
              eq(recognitionRuns.pipelineType, "vendor_ocr"),
              eq(recognitionRuns.recognitionRevision, latestOcrRun.recognitionRevision)
            ))
        : [];
      const existingExtractions = latestOcrRuns.length
        ? await db
            .select()
            .from(ocrExtractions)
            .where(and(
              eq(ocrExtractions.rmaItemId, itemId),
              inArray(ocrExtractions.recognitionRunId, latestOcrRuns.map((run) => run.id))
            ))
        : [];

      for (const ext of existingExtractions) {
        if (ext.rawText) ocrStructured.raw_text.push(...(ext.rawText as string[]));
        if (ext.detectedCodes) ocrStructured.detected_codes.push(...(ext.detectedCodes as string[]));
        if (ext.partNumbers) ocrStructured.part_numbers.push(...(ext.partNumbers as string[]));
        if (ext.vendorMarkings) ocrStructured.vendor_markings.push(...(ext.vendorMarkings as string[]));
        if (ext.technologyMarkings) ocrStructured.technology_markings.push(...(ext.technologyMarkings as string[]));
        if (ext.possibleVendorAliases) ocrStructured.possible_vendor_aliases.push(...(ext.possibleVendorAliases as string[]));
      }

      ocrStructured.raw_text = Array.from(new Set(ocrStructured.raw_text));
      ocrStructured.detected_codes = Array.from(new Set(ocrStructured.detected_codes));
      ocrStructured.part_numbers = Array.from(new Set(ocrStructured.part_numbers));
      ocrStructured.vendor_markings = Array.from(new Set(ocrStructured.vendor_markings));
      ocrStructured.technology_markings = Array.from(new Set(ocrStructured.technology_markings));
      ocrStructured.possible_vendor_aliases = Array.from(new Set(ocrStructured.possible_vendor_aliases));
    }

  })();

  // The independent stages must not block each other during a provider slowdown.
  // Wait for both to settle before synthesis or propagating a persistence failure.
  const pipelineResults = await Promise.allSettled([visualTask, ocrTask]);
  for (const result of pipelineResults) {
    if (result.status === "rejected") throw result.reason;
  }

  // -------------------------------------------------------------------------
  // Synthesis: Vendor Matching & Catalog Resolution
  // -------------------------------------------------------------------------
  const allRules = await db.select().from(vendorRecognitionRules).where(eq(vendorRecognitionRules.isActive, true));
  const allVendors = await db.select().from(vendors).where(eq(vendors.isActive, true));
  const allVariants = await db.select().from(vendorVariants).where(eq(vendorVariants.isActive, true));
  const allCatalog = await db.select().from(displayCatalog).where(eq(displayCatalog.isActive, true));

  // Human-verified examples become a reusable part-number index. We require
  // two separate verified items for a learned mapping and preserve conflicts.
  const verifiedExamples = ocrStructured.part_numbers.length
    ? await loadVerifiedDisplayExamples(itemId)
    : [];
  const catalogWithVerifiedPartNumbers = addVerifiedPartNumbersToCatalog(allCatalog, verifiedExamples);
  const verifiedPartNumberConflicts = findVerifiedPartNumberConflicts(
    ocrStructured.part_numbers,
    verifiedExamples
  );

  const vendorMatcher = new VendorRuleMatcher(allRules, allVendors, allVariants);

  // Collect all extracted tokens
  const ocrTokens = [
    ...ocrStructured.vendor_markings,
    ...ocrStructured.detected_codes,
    ...ocrStructured.raw_text,
    ...ocrStructured.possible_vendor_aliases,
  ];

  const vendorMatch = vendorMatcher.matchTokens(ocrTokens);
  const proposedDisplayMatch = matchDisplayToCatalog(
    visualResult,
    catalogWithVerifiedPartNumbers,
    ocrStructured.part_numbers
  );

  // Contradictory operator-confirmed labels are a hard abstention signal.
  // Do not let a fresh Lens guess silently choose one side of the conflict.
  let displayMatch = verifiedPartNumberConflicts.length ? null : proposedDisplayMatch;
  let synthesisVisualResult: VisualIdentificationResult = verifiedPartNumberConflicts.length
    ? {
        ...visualResult,
        normalizedManufacturer: undefined,
        normalizedModel: undefined,
        detectedDisplayAssembly: undefined,
        cleanDecision: undefined,
      }
    : visualResult;

  let verifiedComparisonDisagrees = false;
  let verifiedComparison: Awaited<ReturnType<OpenAiVisionOcrService["compareToVerifiedExamples"]>> | null = null;
  const needsVisualHelp = !proposedDisplayMatch ||
    proposedDisplayMatch.confidenceScore < 0.85 ||
    Boolean(proposedDisplayMatch.contradictionDetected) ||
    (visualResult.cleanDecision?.confidence ?? 0) < 0.75;

  // On uncertain results, compare the front image with one human-verified
  // reference for each of up to three plausible catalog models. This is a
  // bounded inference-time example lookup, never a background weight update.
  if (
    shouldRunVisual &&
    !verifiedPartNumberConflicts.length &&
    needsVisualHelp &&
    proposedDisplayMatch?.matchType !== "part_number"
  ) {
    const candidateIds = visualCandidateCatalogIds(visualResult, allCatalog, proposedDisplayMatch?.catalogId);
    if (candidateIds.length >= 2) {
      try {
        if (!configuredOpenAiVisionModel) {
          const [setting] = await db.select().from(appSettings)
            .where(eq(appSettings.key, "OPENAI_VISION_MODEL"));
          if (typeof setting?.value === "string") configuredOpenAiVisionModel = setting.value;
        }
        const targetComparisonImages = [
          primaryImage,
          ...images.filter((image) => image.imageType === "flex_cable" || image.imageType === "back"),
        ].filter((image, index, list) =>
          list.findIndex((other) => other.checksumSha256 === image.checksumSha256) === index
        ).slice(0, 3);
        const references = await loadVerifiedVisualReferences(
          itemId,
          targetComparisonImages.map((image) => image.checksumSha256),
          candidateIds,
          allCatalog
        );
        if (references.length >= 2) {
          const comparator = new OpenAiVisionOcrService(undefined, configuredOpenAiVisionModel);
          const targetImages = await Promise.all(targetComparisonImages.map(async (image) => ({
            imageType: image.imageType,
            imageBuffer: await storage.getImageBuffer(image.storagePath),
          })));
          verifiedComparison = await comparator.compareToVerifiedExamples(targetImages, references);

          await db.insert(recognitionRuns).values({
            rmaItemId: itemId,
            recognitionRevision: revision,
            pipelineType: "unified",
            providerName: `openai-verified-examples:${verifiedComparison.model}`,
            status: verifiedComparison.error ? "failed" : "completed",
            rawRequest: {
              targetChecksumSha256s: targetComparisonImages.map((image) => image.checksumSha256),
              candidateCatalogIds: references.map((reference) => reference.catalogDisplayId),
              referenceItemIds: references.map((reference) => reference.itemId),
            },
            rawResponse: {
              selectedCatalogDisplayId: verifiedComparison.selectedCatalogDisplayId,
              confidence: verifiedComparison.confidence,
              matchingCues: verifiedComparison.matchingCues,
              conflictingCues: verifiedComparison.conflictingCues,
            },
            durationMs: verifiedComparison.durationMs,
            errorMessage: verifiedComparison.error || null,
          });

          const selectedCatalogItem = verifiedComparison.selectedCatalogDisplayId
            ? allCatalog.find((entry) => entry.id === verifiedComparison?.selectedCatalogDisplayId)
            : undefined;
          if (selectedCatalogItem && shouldApplyVerifiedVisualComparison(
            verifiedComparison.selectedCatalogDisplayId,
            verifiedComparison.confidence,
            candidateIds
          )) {
            const selectedComparison = {
              ...visualResult,
              normalizedManufacturer: selectedCatalogItem.manufacturer,
              normalizedModel: selectedCatalogItem.modelName,
              detectedDisplayAssembly: `${selectedCatalogItem.manufacturer} ${selectedCatalogItem.modelName} Display`,
              cleanDecision: {
                manufacturer: selectedCatalogItem.manufacturer,
                model: selectedCatalogItem.modelName,
                displayName: `${selectedCatalogItem.manufacturer} ${selectedCatalogItem.modelName} Display`,
                confidence: verifiedComparison.confidence,
                cleanedCandidates: visualResult.candidates.map((candidate) => candidate.title).slice(0, 5),
                reasoning: `Compared the upload with ${references.length} operator-verified reference displays. ${verifiedComparison.matchingCues.join("; ")}`,
              },
            } satisfies VisualIdentificationResult;
            const comparedMatch = matchDisplayToCatalog(
              selectedComparison,
              catalogWithVerifiedPartNumbers,
              ocrStructured.part_numbers
            );
            if (comparedMatch?.catalogId === selectedCatalogItem.id) {
              const previousBestCatalogId = proposedDisplayMatch?.catalogId || candidateIds[0];
              verifiedComparisonDisagrees = previousBestCatalogId !== selectedCatalogItem.id;
              synthesisVisualResult = selectedComparison;
              displayMatch = comparedMatch;
            }
          }
        }
      } catch (error) {
        console.warn("[Processor] Verified-example comparison could not run:", error);
      }
    }
  }

  const unified = synthesizeRecognition(
    displayMatch,
    vendorMatch,
    ocrStructured,
    synthesisVisualResult
  );

  if (displayMatch?.verifiedExampleCount && displayMatch.matchedPartNumber) {
    unified.evidenceNotes.push(
      `Verified feedback matched part number ${displayMatch.matchedPartNumber} across ${displayMatch.verifiedExampleCount} independently verified displays.`
    );
  }
  if (verifiedComparison?.selectedCatalogDisplayId && displayMatch?.catalogId === verifiedComparison.selectedCatalogDisplayId) {
    unified.evidenceNotes.push(
      `Compared available front and flex/back photos with operator-verified examples using ${verifiedComparison.model} (confidence ${verifiedComparison.confidence.toFixed(2)}). Matching cues: ${verifiedComparison.matchingCues.join("; ") || "none reported"}.`
    );
    if (verifiedComparison.conflictingCues.length) {
      unified.evidenceNotes.push(`Conflicting visual cues: ${verifiedComparison.conflictingCues.join("; ")}.`);
    }
  } else if (verifiedComparison?.selectedCatalogDisplayId) {
    unified.evidenceNotes.push("Verified-example comparison did not reach the confidence threshold; the candidate remains unconfirmed.");
  } else if (verifiedComparison?.error) {
    unified.evidenceNotes.push(`Verified-example comparison unavailable: ${verifiedComparison.error}`);
  } else if (verifiedComparison && verifiedComparison.selectedCatalogDisplayId === null) {
    unified.evidenceNotes.push("Verified-example comparison abstained because the reference images did not clearly match one candidate.");
  }
  for (const conflict of verifiedPartNumberConflicts) {
    unified.evidenceNotes.push(
      `Verified feedback conflict: part number ${conflict.partNumber} appears on ${conflict.exampleCount} verified displays labeled as ${conflict.modelCount} different models. Model identification was withheld.`
    );
  }

  // Determine final item status considering provider health
  const currentVisualStatus = visualResult.error
    ? "failed"
    : shouldRunVisual
    ? "success"
    : item.visualStatus;

  const currentOcrStatus = shouldRunOcr
    ? ocrHadSuccess
      ? "success"
      : "failed"
    : item.vendorOcrStatus;

  let finalItemStatus = unified.itemStatus;
  if (
    verifiedPartNumberConflicts.length ||
    verifiedComparisonDisagrees ||
    Boolean(verifiedComparison?.conflictingCues.length)
  ) {
    finalItemStatus = "review_required";
    unified.overallMatchStatus = "ambiguous";
    if (verifiedComparisonDisagrees) {
      unified.evidenceNotes.push("Verified-example comparison selected a different model than the initial recognition result. Human confirmation is required.");
    }
    if (verifiedComparison?.conflictingCues.length) {
      unified.evidenceNotes.push("Verified-example comparison found conflicting physical cues. Human confirmation is required.");
    }
  }
  if (currentVisualStatus === "failed" && currentOcrStatus === "failed") {
    finalItemStatus = "failed";
  } else if (currentVisualStatus !== "success" || currentOcrStatus !== "success") {
    // If either independent pipeline failed or has not completed successfully, escalate to human review
    finalItemStatus = "review_required";
  }

  // Update RMA Item with synthesized recognition result
  const modelReviews = await db.select().from(reviewActions)
    .where(eq(reviewActions.rmaItemId, itemId)).orderBy(desc(reviewActions.createdAt));
  const manualModel = getManualModelOverride(modelReviews);
  if (manualModel) {
    unified.evidenceNotes.push(`Model retained from operator correction: ${manualModel.predictedManufacturer} ${manualModel.predictedModel}. Automated suggestion: ${unified.predictedModel || "unresolved"}.`);
    const normalize = (value: string | null) => (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const modelConflict = normalize(manualModel.predictedModel) !== normalize(unified.predictedModel) ||
      normalize(manualModel.predictedManufacturer) !== normalize(unified.predictedManufacturer) ||
      (manualModel.catalogDisplayId && manualModel.catalogDisplayId !== unified.catalogDisplayId);
    if (modelConflict) {
      finalItemStatus = "review_required";
      unified.overallMatchStatus = "ambiguous";
      unified.evidenceNotes.push("Automated recognition conflicts with the retained operator correction. Review the new evidence before accepting it.");
    } else if (!manualModel.catalogDisplayId) {
      finalItemStatus = "review_required";
    }
  }
  await updateItemForRevision(itemId, revision, {
      predictedManufacturer: unified.predictedManufacturer,
      predictedModel: unified.predictedModel,
      predictedDisplayAssembly: unified.predictedDisplayAssembly,
      catalogDisplayId: unified.catalogDisplayId,
      modelConfidenceScore: unified.modelConfidenceScore,
      identifiedVendorId: unified.identifiedVendorId,
      identifiedVendorVariantId: unified.identifiedVendorVariantId,
      vendorConfidenceScore: unified.vendorConfidenceScore,
      matchStatus: unified.overallMatchStatus,
      status: finalItemStatus,
      extractedTextSummary: unified.extractedTextSummary,
      matchedCodesSummary: unified.matchedCodesSummary,
      reviewNotes: unified.evidenceNotes.join(" | "),
      updatedAt: new Date(),
      ...manualModel,
    });

  console.log(
    `[Processor] Completed item ${itemId}: Model=${manualModel?.predictedModel || unified.predictedModel || "Unresolved"}, Vendor=${unified.identifiedVendorName || "Unresolved"} (Status=${unified.overallMatchStatus})`
  );
}
