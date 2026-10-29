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
  seededDisplayProducts,
  seededDisplayReferences,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { storage } from "@/lib/storage";
import {
  DEFAULT_DISPLAY_INSPECTION_PROMPT,
  getVisualRecognitionProvider,
  VisualIdentificationResult,
} from "@/lib/recognition/lens";
import { OpenAiVisionOcrService, type VerifiedDisplayReference } from "@/lib/recognition/openai";
import { compareVerifiedLibrary, type VerifiedLibraryComparison } from "@/lib/recognition/openai/verified-library";
import {
  matchSeededInventoryProduct,
  type SeededInventoryMatch,
  type SeededInventoryReference,
} from "@/lib/recognition/seeded-inventory";
import { selectDisplayImagesForOcr } from "@/lib/recognition/openai/preprocessor";
import { cleanRawCandidateTitle } from "@/lib/recognition/lens/cleaner-utils";
import { independentSource } from "@/lib/recognition/lens/model-evidence";
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
  shouldWithholdUnconfirmedVisualSuggestion,
  shouldApplyVerifiedVisualComparison,
  shouldShowUnconfirmedVerifiedSuggestion,
  verifiedComparisonConflictsWithModel,
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

async function matchSeededInventory(
  itemId: string,
  revision: number,
  images: Array<typeof itemImages.$inferSelect>
): Promise<SeededInventoryMatch | null> {
  const primaryBack = images.find((image) => image.imageType === "back") ||
    images.find((image) => image.imageType === "primary") ||
    images.find((image) => image.imageType === "front") ||
    images[0];
  if (!primaryBack) return null;

  const targetImageRows = [
    primaryBack,
    ...images.filter((image) => ["back", "primary", "front", "general", "flex_cable", "stamp_closeup", "sticker_closeup"].includes(image.imageType)),
  ].filter((image, index, list) =>
    list.findIndex((other) => other.checksumSha256 === image.checksumSha256) === index
  ).slice(0, 3);

  const rows = await db
    .select({
      productId: seededDisplayProducts.id,
      manufacturer: seededDisplayProducts.manufacturer,
      modelName: seededDisplayProducts.modelName,
      variantName: seededDisplayProducts.variantName,
      printedTitle: seededDisplayProducts.printedTitle,
      barcodeValue: seededDisplayProducts.barcodeValue,
      barcodeFormat: seededDisplayProducts.barcodeFormat,
      barcodeSymbology: seededDisplayProducts.barcodeSymbology,
      supplierSku: seededDisplayProducts.supplierSku,
      sourceDisplayId: seededDisplayReferences.sourceDisplayId,
      sourceImageId: seededDisplayReferences.sourceImageId,
      storagePath: seededDisplayReferences.storagePath,
    })
    .from(seededDisplayReferences)
    .innerJoin(seededDisplayProducts, eq(seededDisplayReferences.productId, seededDisplayProducts.id))
    .where(and(eq(seededDisplayProducts.isActive, true), eq(seededDisplayReferences.isMatchable, true)))
    .orderBy(asc(seededDisplayProducts.modelName), asc(seededDisplayProducts.variantName), asc(seededDisplayReferences.sourceDisplayId));

  if (rows.length < 2) return { status: "miss", product: null, confidence: 0, matchingCues: [], conflictingCues: [], unresolvedAlternatives: [], supportingReferenceIds: [] };

  let configuredModel = process.env.OPENAI_REFERENCE_MODEL || process.env.OPENAI_VISION_MODEL;
  if (!configuredModel) {
    try {
      const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, "OPENAI_VISION_MODEL"));
      if (typeof setting?.value === "string") configuredModel = setting.value;
    } catch {
      // Use the provider default when the optional setting is absent.
    }
  }

  const references: SeededInventoryReference[] = await Promise.all(rows.map(async (row) => ({
    product: {
      id: row.productId,
      manufacturer: row.manufacturer,
      modelName: row.modelName,
      variantName: row.variantName,
      printedTitle: row.printedTitle,
      barcodeValue: row.barcodeValue,
      barcodeFormat: row.barcodeFormat,
      barcodeSymbology: row.barcodeSymbology,
      supplierSku: row.supplierSku,
    },
    displayId: row.sourceDisplayId,
    imageBuffer: await storage.getImageBuffer(row.storagePath),
    imageType: "back",
  })));
  const targetImages = await Promise.all(targetImageRows.map(async (image) => ({
    // Legacy photographs labeled "primary" represent the primary back view in this workflow
    imageType: (image.imageType === "primary" ? "back" : image.imageType),
    imageBuffer: await storage.getImageBuffer(image.storagePath),
  })));

  const startedAt = Date.now();
  const comparison = await matchSeededInventoryProduct(
    new OpenAiVisionOcrService(undefined, configuredModel, 120000),
    targetImages,
    references
  );
  await db.insert(recognitionRuns).values({
    rmaItemId: itemId,
    recognitionRevision: revision,
    pipelineType: "inventory_catalog",
    providerName: "openai-seeded-inventory-comparison",
    status: comparison.status === "error" ? "failed" : "completed",
    rawRequest: {
      targetChecksumSha256s: targetImageRows.map((image) => image.checksumSha256),
      sourceDisplayIds: rows.map((row) => row.sourceDisplayId),
      productIds: [...new Set(rows.map((row) => row.productId))],
      decisionPolicy: "exact-product-variant-v1",
    },
    rawResponse: {
      status: comparison.status,
      selectedProductId: comparison.product?.id || null,
      confidence: comparison.confidence,
      matchingCues: comparison.matchingCues,
      conflictingCues: comparison.conflictingCues,
      unresolvedAlternatives: comparison.unresolvedAlternatives,
      supportingReferenceIds: comparison.supportingReferenceIds,
    },
    durationMs: Date.now() - startedAt,
    errorMessage: comparison.error || null,
  });
  return comparison;
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

export async function findVerifiedModelByPartNumbers(
  partNumbers: string[],
  excludeItemId: string
): Promise<{ manufacturer: string; model: string; matchedPartNumber: string; verifiedCount: number } | null> {
  if (!partNumbers || !partNumbers.length) return null;
  const normalizedTargets = partNumbers.map((p) => p.trim().toUpperCase()).filter((p) => p.length >= 3);
  if (!normalizedTargets.length) return null;

  try {
    const rows = await db
      .select({
        itemId: rmaItems.id,
        manufacturer: rmaItems.predictedManufacturer,
        model: rmaItems.predictedModel,
        partNumbers: ocrExtractions.partNumbers,
      })
      .from(ocrExtractions)
      .innerJoin(rmaItems, eq(ocrExtractions.rmaItemId, rmaItems.id))
      .where(and(
        eq(rmaItems.status, "verified"),
        isNotNull(rmaItems.predictedModel),
        ne(rmaItems.id, excludeItemId)
      ))
      .orderBy(desc(rmaItems.verifiedAt))
      .limit(2000);

    const matchesByModel = new Map<string, { manufacturer: string; model: string; matchedPartNumber: string; itemIds: Set<string> }>();

    for (const row of rows) {
      if (!row.manufacturer || !row.model || !row.partNumbers) continue;
      for (const pn of row.partNumbers) {
        const normPn = pn.trim().toUpperCase();
        if (normalizedTargets.includes(normPn)) {
          const key = `${row.manufacturer}|${row.model}`;
          const existing = matchesByModel.get(key) || {
            manufacturer: row.manufacturer,
            model: row.model,
            matchedPartNumber: normPn,
            itemIds: new Set<string>(),
          };
          existing.itemIds.add(row.itemId);
          matchesByModel.set(key, existing);
        }
      }
    }

    if (!matchesByModel.size) return null;

    let best: { manufacturer: string; model: string; matchedPartNumber: string; verifiedCount: number } | null = null;
    for (const entry of matchesByModel.values()) {
      if (!best || entry.itemIds.size > best.verifiedCount) {
        best = {
          manufacturer: entry.manufacturer,
          model: entry.model,
          matchedPartNumber: entry.matchedPartNumber,
          verifiedCount: entry.itemIds.size,
        };
      }
    }

    return best;
  } catch (error) {
    console.warn("[Processor] Error querying verified part numbers:", error);
    return null;
  }
}

async function loadVerifiedVisualReferenceRows(
  excludeItemId: string,
  catalogIds: string[]
) {
  if (!catalogIds.length) return [];
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
    .orderBy(desc(rmaItems.verifiedAt), asc(itemImages.sortOrder));
}

type DisplayCatalogItem = Parameters<typeof matchDisplayToCatalog>[1][number];

interface VisualCatalogModelVote {
  key: string;
  catalogId: string;
  manufacturer: string;
  modelName: string;
  score: number;
  sources: Set<string>;
}

interface VisualCatalogEvidence {
  rankedVotes: VisualCatalogModelVote[];
  candidateIds: string[];
  decisiveWinner: VisualCatalogModelVote | null;
}

function normalizeCatalogPhrase(value: string): string {
  return value.toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function catalogDeviceModelName(item: Pick<DisplayCatalogItem, "manufacturer" | "modelName">): string {
  const manufacturer = normalizeCatalogPhrase(item.manufacturer);
  const normalizedModel = normalizeCatalogPhrase(item.modelName);
  return normalizedModel.startsWith(`${manufacturer} `)
    ? normalizedModel.slice(manufacturer.length + 1)
    : normalizedModel;
}

function catalogModelKey(item: Pick<DisplayCatalogItem, "manufacturer" | "modelName">): string {
  return `${normalizeCatalogPhrase(item.manufacturer)}\u0000${catalogDeviceModelName(item)}`;
}

function hasAffirmativeOledTechnology(hints: string[]): boolean {
  return hints.some((hint) => /\b(?:HARD|OLED|AMOLED|AL1[2-6])\b/i.test(hint));
}

function isLegacyLcdCatalogItem(item: Pick<DisplayCatalogItem, "manufacturer" | "modelName">): boolean {
  return item.manufacturer.trim().toLowerCase() === "apple" &&
    /^iPhone\s*(?:[5678](?:s)?|SE)\b/i.test(catalogDeviceModelName(item));
}

function visualCatalogEvidence(
  visualResult: VisualIdentificationResult,
  catalog: DisplayCatalogItem[],
  preferredCatalogId?: string | null,
  ocrHints: string[] = []
): VisualCatalogEvidence {
  const rankedCandidates = [...visualResult.candidates]
    .filter((candidate) => Number.isFinite(candidate.rank) && candidate.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 30);
  const displayListing = /\b(?:screen|display|lcd|oled|amoled|digitizer|touch\s*screen|panel|assembly|replacement)\b/i;
  const accessoryListing = /\b(?:case|cover|screen\s*protector|tempered\s*glass|camera\s*lens|charger|cable|battery|adhesive|glue|repair\s*kit|tools?)\b/i;
  const hasOledTechnology = hasAffirmativeOledTechnology(ocrHints);
  const phraseOffsets = (title: string, phrase: string) => {
    const normalizedTitle = normalizeCatalogPhrase(title);
    const normalizedPhrase = normalizeCatalogPhrase(phrase);
    if (!normalizedPhrase) return [];
    const paddedTitle = ` ${normalizedTitle} `;
    const paddedPhrase = ` ${normalizedPhrase} `;
    const offsets: Array<{ start: number; end: number }> = [];
    let searchFrom = 0;
    let offset = paddedTitle.indexOf(paddedPhrase, searchFrom);
    while (offset >= 0) {
      offsets.push({ start: offset + 1, end: offset + 1 + normalizedPhrase.length });
      searchFrom = offset + paddedPhrase.length;
      offset = paddedTitle.indexOf(paddedPhrase, searchFrom);
    }
    return offsets;
  };
  const modelForCandidate = (title: string): DisplayCatalogItem | undefined => {
    const matches = catalog.flatMap((item) => {
      const phrases = [item.modelName, ...(item.aliases || [])];
      const matchedPhrase = phrases
        .filter((phrase) => phraseOffsets(title, phrase).length > 0)
        .sort((a, b) => normalizeCatalogPhrase(b).length - normalizeCatalogPhrase(a).length)[0];
      return matchedPhrase
        ? [{ item, matchedPhrase, specificity: normalizeCatalogPhrase(matchedPhrase).length }]
        : [];
    });
    const strongestSpecificity = Math.max(0, ...matches.map((match) => match.specificity));
    const strongest = matches.filter((match) => match.specificity === strongestSpecificity);
    const modelKeys = new Set(strongest.map(({ item }) => catalogModelKey(item)));
    if (!strongestSpecificity || modelKeys.size !== 1) return undefined;

    const selectedKey = [...modelKeys][0];
    const selectedItem = strongest.find(({ item }) => item.id === preferredCatalogId)?.item || strongest[0].item;
    const selectedPhrase = strongest[0].matchedPhrase;
    const selectedOccurrences = phraseOffsets(title, selectedPhrase);
    const hasUnrelatedModelMention = matches.some(({ item: other, matchedPhrase }) => {
      if (catalogModelKey(other) === selectedKey) return false;
      const otherOccurrences = phraseOffsets(title, matchedPhrase);
      // A shorter model from another manufacturer can be a substring of the
      // more specific model in the same listing (for example, "13 Pro" in
      // "iPhone 13 Pro Max"). Treat it as unrelated only if its mention is
      // separate from the strongest matched model phrase.
      return !otherOccurrences.every((otherOccurrence) => selectedOccurrences.some((selectedOccurrence) =>
        otherOccurrence.start >= selectedOccurrence.start && otherOccurrence.end <= selectedOccurrence.end
      ));
    });
    if (hasUnrelatedModelMention) return undefined;

    return catalog.find((item) => item.id === preferredCatalogId && catalogModelKey(item) === selectedKey) || selectedItem;
  };

  const candidateIdByModel = new Map<string, string>();
  const votes = new Map<string, VisualCatalogModelVote>();
  const seenVotes = new Set<string>();
  for (const candidate of rankedCandidates) {
    if (accessoryListing.test(candidate.title) || !displayListing.test(candidate.title)) continue;
    const item = modelForCandidate(candidate.title);
    if (!item) continue;
    if (hasOledTechnology && isLegacyLcdCatalogItem(item)) continue;

    const key = catalogModelKey(item);
    const representative = catalog.find((entry) => entry.id === preferredCatalogId && catalogModelKey(entry) === key) ||
      catalog.find((entry) => catalogModelKey(entry) === key) || item;
    if (!candidateIdByModel.has(key)) candidateIdByModel.set(key, representative.id);

    const source = independentSource(candidate.sourceUrl, candidate.sourceName);
    if (!source) continue;
    const voteKey = `${key}\u0000${source}`;
    if (seenVotes.has(voteKey)) continue;
    seenVotes.add(voteKey);

    const evidence = votes.get(key) || {
      key,
      catalogId: representative.id,
      manufacturer: representative.manufacturer,
      modelName: representative.modelName,
      score: 0,
      sources: new Set<string>(),
    };
    evidence.score += 1 / Math.log2(candidate.rank + 1);
    evidence.sources.add(source);
    votes.set(key, evidence);
  }

  const rankedVotes = [...votes.values()].sort((a, b) =>
    b.sources.size - a.sources.size || b.score - a.score
  );
  const [winner, runner] = rankedVotes;
  const voteMargin = runner && winner ? winner.score / runner.score : Number.POSITIVE_INFINITY;
  const sourceMargin = runner && winner
    ? winner.sources.size / runner.sources.size
    : Number.POSITIVE_INFINITY;
  const decisiveWinner = winner && winner.sources.size >= 3 && voteMargin >= 1.8 && sourceMargin >= 1.8
    ? winner
    : null;

  return { rankedVotes, candidateIds: [...candidateIdByModel.values()], decisiveWinner };
}

export function hasIndependentVisualCatalogSupport(
  visualResult: VisualIdentificationResult,
  catalog: DisplayCatalogItem[],
  catalogId: string | null,
  ocrHints: string[] = []
): boolean {
  const selected = catalog.find((item) => item.id === catalogId);
  const winner = visualCatalogEvidence({ ...visualResult,
    candidates: candidatesForVerifiedComparison(visualResult) }, catalog, undefined, ocrHints).decisiveWinner;
  return Boolean(selected && winner && catalogModelKey(selected) === winner.key);
}

export function unrepresentedVisualCandidateLabels(
  candidateIds: string[], references: VerifiedDisplayReference[], catalog: DisplayCatalogItem[]
): string[] {
  const referenceModels = new Set(references.flatMap((reference) => {
    const model = catalog.find((entry) => entry.id === reference.catalogDisplayId);
    return model ? [catalogModelKey(model)] : [];
  }));
  return candidateIds.flatMap((id) => {
    const model = catalog.find((entry) => entry.id === id);
    return model && !referenceModels.has(catalogModelKey(model)) ? [`${model.manufacturer} ${model.modelName}`] : [];
  });
}

function decisionMatchesCatalogModel(
  decision: VisualIdentificationResult["cleanDecision"],
  modelKey: string,
  catalog: DisplayCatalogItem[]
): boolean {
  if (!decision?.manufacturer || !decision.model) return false;
  const manufacturer = decision.manufacturer;
  const normalizeDeviceName = (manufacturer: string, value: string) => {
    const normalized = normalizeCatalogPhrase(value);
    const normalizedManufacturer = normalizeCatalogPhrase(manufacturer);
    return normalized.startsWith(`${normalizedManufacturer} `)
      ? normalized.slice(normalizedManufacturer.length + 1)
      : normalized;
  };
  const decisionModel = normalizeDeviceName(manufacturer, decision.model);
  return catalog.some((item) => catalogModelKey(item) === modelKey &&
    normalizeCatalogPhrase(item.manufacturer) === normalizeCatalogPhrase(manufacturer) &&
    [item.modelName, ...(item.aliases || [])].some((name) =>
      normalizeDeviceName(item.manufacturer, name) === decisionModel
    ));
}

export function applyVisualCatalogConsensus(
  visualResult: VisualIdentificationResult,
  catalog: DisplayCatalogItem[],
  ocrHints: string[] = []
): VisualIdentificationResult {
  const evidence = visualCatalogEvidence(visualResult, catalog, undefined, ocrHints);
  const winner = evidence.decisiveWinner;
  if (!winner) return visualResult;

  const decision = visualResult.cleanDecision;
  if (/photograph did not corroborate|photo corroboration was unavailable/i.test(decision?.reasoning || "")) {
    return visualResult;
  }
  if (decision && decision.confidence >= 0.85) {
    if (decisionMatchesCatalogModel(decision, winner.key, catalog)) return visualResult;
    const conflictingModel = decision.model || decision.suggestedModel || "the image-based result";
    return {
      ...visualResult,
      normalizedManufacturer: undefined,
      normalizedModel: undefined,
      detectedDisplayAssembly: undefined,
      cleanDecision: {
        ...decision,
        manufacturer: winner.manufacturer,
        model: null,
        suggestedModel: winner.modelName,
        displayName: `Unidentified ${winner.manufacturer} Display`,
        confidence: 0.45,
        reasoning: `Independent listing votes favor ${winner.manufacturer} ${winner.modelName}, but image-based recognition suggested ${conflictingModel}. The signals conflict, so the system has abstained for human review.`,
      },
    };
  }

  const modelLabel = normalizeCatalogPhrase(winner.modelName).startsWith(`${normalizeCatalogPhrase(winner.manufacturer)} `)
    ? winner.modelName
    : `${winner.manufacturer} ${winner.modelName}`;
  const displayName = `${modelLabel} Display`;
  return {
    ...visualResult,
    normalizedManufacturer: winner.manufacturer,
    normalizedModel: winner.modelName,
    detectedDisplayAssembly: displayName,
    cleanDecision: {
      manufacturer: winner.manufacturer,
      model: winner.modelName,
      suggestedModel: null,
      displayName,
      confidence: 0.84,
      cleanedCandidates: decision?.cleanedCandidates || visualResult.candidates.map((candidate) => candidate.title).slice(0, 5),
      reasoning: `${winner.sources.size} independent catalog-matched display listings favor ${modelLabel}. This is search-source consensus only and remains below automatic verification confidence.`,
    },
  };
}

function candidatesForVerifiedComparison(
  visualResult: VisualIdentificationResult
): VisualIdentificationResult["candidates"] {
  const rawResponse = visualResult.rawResponse as Record<string, unknown>;
  const rawResult = rawResponse.result && typeof rawResponse.result === "object" && !Array.isArray(rawResponse.result)
    ? rawResponse.result as Record<string, unknown>
    : rawResponse;
  const rawMatches = rawResult.visual_matches;
  if (!Array.isArray(rawMatches)) return visualResult.candidates;

  const byRank = new Map<number, VisualIdentificationResult["candidates"][number]>();
  for (const candidate of visualResult.candidates) {
    if (Number.isFinite(candidate.rank) && candidate.rank > 0) byRank.set(candidate.rank, candidate);
  }
  rawMatches.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const match = value as Record<string, unknown>;
    if (typeof match.title !== "string" || !match.title.trim()) return;
    const rank = typeof match.position === "number" && Number.isFinite(match.position) && match.position > 0
      ? match.position
      : index + 1;
    const existing = byRank.get(rank);
    byRank.set(rank, {
      title: match.title,
      sourceUrl: typeof match.link === "string" ? match.link : existing?.sourceUrl,
      sourceName: typeof match.source === "string" ? match.source : existing?.sourceName,
      rank,
    });
  });

  return [...byRank.values()].sort((left, right) => left.rank - right.rank).slice(0, 30);
}

export function visualCandidateCatalogIds(
  visualResult: VisualIdentificationResult,
  catalog: DisplayCatalogItem[],
  preferredCatalogId?: string | null,
  maximumCandidates = 8
): string[] {
  const decision = visualResult.cleanDecision;
  const evidence = visualCatalogEvidence({
    ...visualResult,
    candidates: candidatesForVerifiedComparison(visualResult),
  }, catalog, preferredCatalogId);
  const winner = evidence.decisiveWinner;
  const preferredItem = catalog.find((item) => item.id === preferredCatalogId);

  const ids: string[] = [];
  const seenModels = new Set<string>();
  const addModel = (catalogId: string) => {
    const item = catalog.find((entry) => entry.id === catalogId);
    const key = item ? catalogModelKey(item) : catalogId;
    if (seenModels.has(key)) return;
    seenModels.add(key);
    ids.push(catalogId);
  };

  const decisionMatch = decision?.manufacturer && decision.model
    ? matchDisplayToCatalog({
      ...visualResult,
      candidates: [],
      cleanDecision: undefined,
      normalizedManufacturer: decision.manufacturer,
      normalizedModel: decision.model,
      detectedDisplayAssembly: decision.displayName,
    }, catalog, [])
    : null;

  if (winner) {
    // Keep alternatives even when listing votes or a single-image model check
    // produce a confident label. Search results are candidate evidence, so
    // compare competing catalog models with operator-verified photos first.
    if (preferredItem) addModel(preferredItem.id);
    if (decisionMatch) addModel(decisionMatch.catalogId);
    const suggestedDecision = decision?.manufacturer && decision.suggestedModel
      ? { ...decision, model: decision.suggestedModel }
      : null;
    const suggestedCatalogItem = suggestedDecision
      ? catalog.find((item) => decisionMatchesCatalogModel(
        suggestedDecision,
        catalogModelKey(item),
        catalog
      ))
      : undefined;
    if (suggestedCatalogItem) addModel(suggestedCatalogItem.id);
    for (const vote of evidence.rankedVotes.slice(0, maximumCandidates)) addModel(vote.catalogId);
    for (const catalogId of evidence.candidateIds.slice(0, maximumCandidates)) addModel(catalogId);
    const comparisonCandidates = ids.slice(0, maximumCandidates);
    if (comparisonCandidates.length >= 2) return comparisonCandidates;
    return [preferredItem && catalogModelKey(preferredItem) === winner.key ? preferredItem.id : winner.catalogId];
  }

  if (!evidence.rankedVotes.length && decision?.manufacturer && decision.model && decision.confidence >= 0.9) {
    if (!decisionMatch || (preferredItem && catalogModelKey(preferredItem) !== catalogModelKey(
      catalog.find((item) => item.id === decisionMatch.catalogId) || preferredItem
    ))) return [];
    return [decisionMatch.catalogId];
  }

  // Only one representative ID per device model may enter the verified-reference shortlist.
  if (preferredCatalogId) addModel(preferredCatalogId);
  for (const vote of evidence.rankedVotes) addModel(vote.catalogId);
  if (decisionMatch) addModel(decisionMatch.catalogId);
  for (const catalogId of evidence.candidateIds.slice(0, maximumCandidates)) addModel(catalogId);
  const alternatives = ids.slice(0, maximumCandidates);
  return alternatives.length >= 2 ? alternatives : [];
}

/**
 * Keep candidate order while choosing a catalog assembly that actually has a
 * verified reference photo for that device model. Catalog assembly variants
 * share one model key, so a reference on a sibling variant still qualifies.
 */
export function shortlistVerifiedVisualCatalogIds(
  candidateCatalogIds: string[],
  catalog: DisplayCatalogItem[],
  verifiedCatalogIds: string[],
  maximumCandidates = 8
): string[] {
  const verifiedIdByModel = new Map<string, string>();
  const verifiedIdSet = new Set<string>();
  for (const catalogId of verifiedCatalogIds) {
    const item = catalog.find((entry) => entry.id === catalogId);
    if (!item) continue;
    verifiedIdSet.add(catalogId);
    const key = catalogModelKey(item);
    if (!verifiedIdByModel.has(key)) verifiedIdByModel.set(key, catalogId);
  }

  const selected: string[] = [];
  const seenModels = new Set<string>();
  for (const catalogId of candidateCatalogIds) {
    const item = catalog.find((entry) => entry.id === catalogId);
    if (!item) continue;
    const key = catalogModelKey(item);
    if (seenModels.has(key)) continue;
    // Prefer the exact assembly the search proposed when it has its own
    // verified reference. Otherwise fall back to a verified sibling assembly
    // of the same device model.
    const verifiedCatalogId = verifiedIdSet.has(catalogId)
      ? catalogId
      : verifiedIdByModel.get(key);
    if (!verifiedCatalogId) continue;
    seenModels.add(key);
    selected.push(verifiedCatalogId);
    if (selected.length >= maximumCandidates) break;
  }
  return selected;
}

/**
 * Preserve up to two distinct verified examples per device model, not per
 * catalog SKU. A model can have several assemblies (for example iPhone XR AM
 * and iPhone XR COF); they corroborate the same device identity even when only
 * one assembly matches the upload's construction.
 */
export function selectVerifiedVisualReferenceItems<T extends {
  itemId: string;
  catalogDisplayId: string | null;
}>(
  catalogIds: string[],
  rows: T[],
  maximumExamplesPerModel = 2,
  catalog?: DisplayCatalogItem[]
): Array<{ itemId: string; catalogDisplayId: string; sourceCatalogDisplayId?: string }> {
  const selected: Array<{ itemId: string; catalogDisplayId: string; sourceCatalogDisplayId?: string }> = [];
  if (catalog) {
    const modelKeyByCatalogId = new Map(catalog.map((item) => [item.id, catalogModelKey(item)]));
    const representativeByModel = new Map<string, string>();
    for (const catalogId of catalogIds) {
      const key = modelKeyByCatalogId.get(catalogId);
      if (key && !representativeByModel.has(key)) representativeByModel.set(key, catalogId);
    }
    for (const [modelKey, representativeCatalogId] of representativeByModel) {
      const seenItemIds = new Set<string>();
      let selectedForModel = 0;
      for (const row of rows) {
        if (!row.catalogDisplayId) continue;
        if (modelKeyByCatalogId.get(row.catalogDisplayId) !== modelKey) continue;
        if (seenItemIds.has(row.itemId)) continue;
        seenItemIds.add(row.itemId);
        selected.push({
          itemId: row.itemId,
          catalogDisplayId: representativeCatalogId,
          sourceCatalogDisplayId: row.catalogDisplayId,
        });
        selectedForModel += 1;
        if (selectedForModel >= maximumExamplesPerModel) break;
      }
    }
    return selected;
  }

  for (const catalogDisplayId of catalogIds) {
    const seenItemIds = new Set<string>();
    let selectedForModel = 0;
    for (const row of rows) {
      if (row.catalogDisplayId !== catalogDisplayId || seenItemIds.has(row.itemId)) continue;
      seenItemIds.add(row.itemId);
      selected.push({ itemId: row.itemId, catalogDisplayId });
      selectedForModel += 1;
      if (selectedForModel >= maximumExamplesPerModel) break;
    }
  }
  return selected;
}

export async function loadVerifiedVisualReferences(
  excludeItemId: string,
  excludedChecksums: string[],
  catalogIds: string[],
  catalog: DisplayCatalogItem[],
  scope: "library" | "candidates" = "library"
): Promise<VerifiedDisplayReference[]> {
  const candidateModelKeys = new Set(catalogIds.flatMap((catalogId) => {
    const item = catalog.find((entry) => entry.id === catalogId);
    return item ? [catalogModelKey(item)] : [];
  }));
  const modelVariantIds = catalog
    .filter((item) => candidateModelKeys.has(catalogModelKey(item)))
    .map((item) => item.id);
  const loadedRows = await loadVerifiedVisualReferenceRows(excludeItemId,
    scope === "library" ? catalog.map((item) => item.id) : modelVariantIds);
  const excludedItems = new Set(loadedRows
    .filter((row) => excludedChecksums.includes(row.checksumSha256)).map((row) => row.itemId));
  const rows = loadedRows.filter((row) => !excludedItems.has(row.itemId));
  const verifiedCatalogIds = [...new Set(rows.map((row) => row.catalogDisplayId).filter(
    (catalogId): catalogId is string => Boolean(catalogId)
  ))];
  const selectedCatalogIds = shortlistVerifiedVisualCatalogIds(
    scope === "library" ? [...catalogIds, ...verifiedCatalogIds] : catalogIds,
    catalog,
    verifiedCatalogIds,
    scope === "library" ? catalog.length : 8
  );
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
  const selectedExamples = selectVerifiedVisualReferenceItems(selectedCatalogIds, rows, 2, catalog);
  for (const { catalogDisplayId, sourceCatalogDisplayId, itemId } of selectedExamples) {
    const examples = rowsByCatalog.get(sourceCatalogDisplayId || catalogDisplayId);
    const images = examples?.get(itemId);
    if (!images) continue;
    const catalogItem = catalog.find((entry) => entry.id === catalogDisplayId);
    if (!catalogItem) continue;
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
      itemId,
      catalogDisplayId,
      label: `${catalogItem.manufacturer} ${catalogItem.modelName}`,
      images: chosenImages.map((image) => ({
        storagePath: image.storagePath,
        imageType: image.imageType,
        checksumSha256: image.checksumSha256,
      })),
    });
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
      seededDisplayProductId: shouldRunVisual ? null : item.seededDisplayProductId,
      inventoryMatchConfidence: shouldRunVisual ? null : item.inventoryMatchConfidence,
      inventoryMatchEvidence: shouldRunVisual ? null : item.inventoryMatchEvidence,
      updatedAt: new Date(),
    });

  const inventoryMatchPromise: Promise<SeededInventoryMatch | null> = shouldRunVisual
    ? matchSeededInventory(itemId, revision, images).catch((error: unknown) => ({
        status: "error" as const,
        product: null,
        confidence: 0,
        matchingCues: [],
        conflictingCues: [],
        unresolvedAlternatives: [],
        supportingReferenceIds: [],
        error: error instanceof Error ? error.message : String(error),
      }))
    : Promise.resolve(null);
  const inventoryMatchState: { current: SeededInventoryMatch | null } = { current: null };

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
        const inventoryMatch = await inventoryMatchPromise;
        inventoryMatchState.current = inventoryMatch;
        if (inventoryMatch?.status === "accepted" && inventoryMatch.product) {
          const product = inventoryMatch.product;
          const inventoryVisualResult: VisualIdentificationResult = {
            provider: "seeded-inventory-catalog",
            candidates: [],
            normalizedManufacturer: product.manufacturer,
            normalizedModel: product.modelName,
            detectedDisplayAssembly: `${product.modelName} ${product.variantName} Display`,
            cleanDecision: {
              manufacturer: product.manufacturer,
              model: product.modelName,
              displayName: `${product.modelName} ${product.variantName} Display`,
              confidence: inventoryMatch.confidence,
              cleanedCandidates: [],
              reasoning: `Compared the uploaded back with seeded reference displays. ${inventoryMatch.matchingCues.join("; ")}`,
            },
            rawResponse: {
              source: "seeded-inventory-catalog",
              productId: product.id,
              confidence: inventoryMatch.confidence,
              matchingCues: inventoryMatch.matchingCues,
              supportingReferenceIds: inventoryMatch.supportingReferenceIds,
            },
            durationMs: 0,
          };
          try {
            await db.insert(recognitionRuns).values({
              rmaItemId: itemId,
              recognitionRevision: revision,
              pipelineType: "visual",
              providerName: inventoryVisualResult.provider,
              status: "completed",
              rawRequest: {
                source: "seeded-inventory-catalog",
                targetChecksumSha256: primaryImage.checksumSha256,
              },
              rawResponse: inventoryVisualResult.rawResponse,
              durationMs: inventoryVisualResult.durationMs,
            });
            visualResult = inventoryVisualResult;
            await updateItemForRevision(itemId, revision, {
              visualStatus: "success",
              visualError: null,
              updatedAt: new Date(),
            });
            return;
          } catch (error: unknown) {
            console.warn("[Processor] Could not save the seeded catalog visual run; continuing with Lens:", error instanceof Error ? error.message : String(error));
            inventoryMatchState.current = {
              ...inventoryMatch,
              status: "error",
              product: null,
              error: "Could not persist the seeded inventory comparison.",
            };
          }
        }

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
              prompt: process.env.LENS_SEARCH_PROMPT || DEFAULT_DISPLAY_INSPECTION_PROMPT,
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
  const inventoryMatch = inventoryMatchState.current;

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
  const seededCatalogAccepted = inventoryMatch?.status === "accepted" && Boolean(inventoryMatch.product);
  let proposedDisplayMatch = matchDisplayToCatalog(
    visualResult,
    catalogWithVerifiedPartNumbers,
    ocrStructured.part_numbers
  );
  if (
    proposedDisplayMatch &&
    proposedDisplayMatch.matchType !== "part_number" &&
    hasAffirmativeOledTechnology(ocrStructured.technology_markings) &&
    isLegacyLcdCatalogItem({
      manufacturer: proposedDisplayMatch.manufacturer,
      modelName: proposedDisplayMatch.modelName,
    })
  ) {
    proposedDisplayMatch = null;
  }

  // Check our accumulating verified ground-truth knowledge base (operator-verified displays)
  if (!proposedDisplayMatch && ocrStructured.part_numbers.length) {
    const verifiedPartMatch = await findVerifiedModelByPartNumbers(ocrStructured.part_numbers, itemId);
    if (verifiedPartMatch) {
      proposedDisplayMatch = {
        catalogId: null as any,
        manufacturer: verifiedPartMatch.manufacturer,
        modelName: verifiedPartMatch.model,
        normalizedIdentifier: `${verifiedPartMatch.manufacturer} ${verifiedPartMatch.model}`.toLowerCase(),
        displayTechnology: null,
        confidenceScore: 0.99,
        matchType: "part_number",
        matchedPartNumber: verifiedPartMatch.matchedPartNumber,
        verifiedExampleCount: verifiedPartMatch.verifiedCount,
      };
    }
  }

  // Apply catalog-wide voting only when it cannot overrule exact part-number
  // evidence or a prior verified-part-number conflict.
  if (!seededCatalogAccepted && !verifiedPartNumberConflicts.length && proposedDisplayMatch?.matchType !== "part_number") {
    const catalogConsensus = applyVisualCatalogConsensus(
      visualResult,
      catalogWithVerifiedPartNumbers,
      ocrStructured.technology_markings
    );
    if (catalogConsensus !== visualResult) {
      visualResult = catalogConsensus;
      proposedDisplayMatch = matchDisplayToCatalog(
        visualResult,
        catalogWithVerifiedPartNumbers,
        ocrStructured.part_numbers
      );
    }
  }

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
  let verifiedComparisonApplied = false;
  let verifiedSuggestionShown = seededCatalogAccepted;
  let visualSuggestionWithheld = false;
  let verifiedComparison: VerifiedLibraryComparison | null = null;
  const comparisonCandidateIds = shouldRunVisual &&
    allCatalog.length > 0 &&
    !verifiedPartNumberConflicts.length &&
    proposedDisplayMatch?.matchType !== "part_number"
    ? visualCandidateCatalogIds(visualResult, allCatalog, proposedDisplayMatch?.catalogId, 30)
    : [];
  const needsVisualHelp = !proposedDisplayMatch ||
    proposedDisplayMatch.confidenceScore < 0.85 ||
    Boolean(proposedDisplayMatch.contradictionDetected) ||
    (visualResult.cleanDecision?.confidence ?? 0) < 0.75 ||
    comparisonCandidateIds.length >= 2;

  // Verified models must be discoverable even when Lens omits them. Every
  // newly verified item is eligible on the next upload, without a rebuild.
  if (
    shouldRunVisual &&
    !seededCatalogAccepted &&
    allCatalog.length > 0 &&
    !verifiedPartNumberConflicts.length &&
    proposedDisplayMatch?.matchType !== "part_number"
  ) {
    const candidateIds = comparisonCandidateIds;
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
        const comparator = new OpenAiVisionOcrService(undefined,
          process.env.OPENAI_REFERENCE_MODEL || configuredOpenAiVisionModel, 120000);
        const targetImages = await Promise.all(targetComparisonImages.map(async (image) => ({
          imageType: image.imageType,
          imageBuffer: await storage.getImageBuffer(image.storagePath),
        })));
        const unrepresentedSearchLabels = unrepresentedVisualCandidateLabels(candidateIds, references, allCatalog);
        verifiedComparison = await compareVerifiedLibrary(comparator, targetImages, references, unrepresentedSearchLabels);

        const selectedCatalogItem = verifiedComparison.selectedCatalogDisplayId
          ? allCatalog.find((entry) => entry.id === verifiedComparison?.selectedCatalogDisplayId)
          : undefined;
        const initialCatalogItem = proposedDisplayMatch?.catalogId
          ? allCatalog.find((entry) => entry.id === proposedDisplayMatch?.catalogId)
          : undefined;
        const selectedModelKey = selectedCatalogItem ? catalogModelKey(selectedCatalogItem) : null;
        // Corroboration is a device-model property. Two verified XR assemblies
        // (for example AM and COF) are independent evidence for "iPhone XR"
        // even when the comparison only cites the assembly that matches the
        // upload's construction.
        const supportingModelReferenceCount = selectedModelKey
          ? new Set(references.flatMap((reference) => {
              const referenceItem = allCatalog.find((entry) => entry.id === reference.catalogDisplayId);
              return referenceItem && catalogModelKey(referenceItem) === selectedModelKey
                ? [reference.itemId]
                : [];
            })).size
          : 0;

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
            unresolvedAlternatives: verifiedComparison.unresolvedAlternatives,
            supportingReferenceItemIds: verifiedComparison.supportingReferenceItemIds,
            supportingModelReferenceCount,
            searchedCatalogIds: verifiedComparison.searchedCatalogIds,
            discoveryBatches: verifiedComparison.discoveryBatches,
            timings: verifiedComparison.timings,
          },
          durationMs: verifiedComparison.durationMs,
          errorMessage: verifiedComparison.error || null,
        });

        verifiedComparisonDisagrees = verifiedComparisonConflictsWithModel(
          initialCatalogItem ? catalogModelKey(initialCatalogItem) : null,
          selectedCatalogItem ? catalogModelKey(selectedCatalogItem) : null
        );
        const selectedComparison = selectedCatalogItem ? {
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
        } satisfies VisualIdentificationResult : null;
        const comparedMatch = selectedComparison && selectedCatalogItem
          ? matchDisplayToCatalog(
              { ...selectedComparison, candidates: [] },
              // The visual reviewer already selected this reference-backed ID.
              // Re-ranking all assemblies with old Lens titles can undo that choice.
              catalogWithVerifiedPartNumbers.filter((entry) => entry.id === selectedCatalogItem.id),
              []
            )
          : null;
        const comparedSelectionMatches = Boolean(
          selectedCatalogItem && comparedMatch && comparedMatch.catalogId === selectedCatalogItem.id
        );
        if (comparedSelectionMatches && selectedCatalogItem && selectedComparison && comparedMatch &&
          shouldApplyVerifiedVisualComparison(
            verifiedComparison.selectedCatalogDisplayId,
            verifiedComparison.confidence,
            references.map((reference) => reference.catalogDisplayId),
            { unresolvedAlternatives: verifiedComparison.unresolvedAlternatives,
              supportingReferenceCount: supportingModelReferenceCount,
              searchCorroborated: hasIndependentVisualCatalogSupport(
                visualResult,
                allCatalog,
                verifiedComparison.selectedCatalogDisplayId,
                ocrStructured.technology_markings
              ),
              matchingCueCount: verifiedComparison.matchingCues.length }
          )) {
          verifiedComparisonApplied = true;
          synthesisVisualResult = selectedComparison;
          displayMatch = comparedMatch;
        } else if (comparedSelectionMatches && selectedComparison && comparedMatch &&
          shouldShowUnconfirmedVerifiedSuggestion(
            verifiedComparison.selectedCatalogDisplayId,
            verifiedComparison.confidence,
            supportingModelReferenceCount,
            verifiedComparison.matchingCues.length,
            verifiedComparison.unresolvedAlternatives.length
          )) {
          // Keep the best reference-backed model visible in review instead of
          // returning an empty "unidentified" result. This is not a verified
          // decision; the item remains review_required.
          verifiedSuggestionShown = true;
          synthesisVisualResult = selectedComparison;
          displayMatch = comparedMatch;
        }
      }
    } catch (error) {
      console.warn("[Processor] Verified-example comparison could not run:", error);
    }
  }

  const initialVisualConfidence = proposedDisplayMatch?.confidenceScore ?? visualResult.cleanDecision?.confidence ?? 0;
  const unresolvedVisualAlternatives = Boolean(verifiedComparison?.unresolvedAlternatives.length);
  const uncorroboratedVisualSuggestion = Boolean(verifiedComparison && !verifiedComparisonApplied &&
    !hasIndependentVisualCatalogSupport(
      visualResult,
      allCatalog,
      proposedDisplayMatch?.catalogId || null,
      ocrStructured.technology_markings
    ));
  if (!verifiedSuggestionShown && (needsVisualHelp || verifiedComparisonDisagrees || unresolvedVisualAlternatives || uncorroboratedVisualSuggestion) && shouldWithholdUnconfirmedVisualSuggestion(
    initialVisualConfidence,
    verifiedComparisonApplied,
    verifiedComparisonDisagrees || unresolvedVisualAlternatives || uncorroboratedVisualSuggestion
  )) {
    visualSuggestionWithheld = true;
    displayMatch = null;
    synthesisVisualResult = visualResult;
  }

  const unified = synthesizeRecognition(
    displayMatch,
    vendorMatch,
    ocrStructured,
    synthesisVisualResult
  );

  const normalizeIdentifier = (val: string | null | undefined) =>
    (val || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const exactOcrPartNumberMatch = proposedDisplayMatch?.matchType === "part_number" ? proposedDisplayMatch : null;
  const ocrContradictsSeededProduct = Boolean(
    exactOcrPartNumberMatch &&
    inventoryMatch?.product &&
    (normalizeIdentifier(exactOcrPartNumberMatch.manufacturer) !== normalizeIdentifier(inventoryMatch.product.manufacturer) ||
     normalizeIdentifier(exactOcrPartNumberMatch.modelName) !== normalizeIdentifier(inventoryMatch.product.modelName))
  );

  if (seededCatalogAccepted && inventoryMatch?.product && !verifiedPartNumberConflicts.length && !ocrContradictsSeededProduct) {
    const product = inventoryMatch.product;
    const modelCatalogItem = allCatalog.find((entry) =>
      entry.manufacturer.toLowerCase() === product.manufacturer.toLowerCase() &&
      entry.modelName.toLowerCase().replace(/[^a-z0-9]/g, "") === product.modelName.toLowerCase().replace(/[^a-z0-9]/g, "")
    );
    unified.predictedManufacturer = product.manufacturer;
    unified.predictedModel = product.modelName;
    unified.predictedDisplayAssembly = `${product.modelName} ${product.variantName} Display`;
    unified.catalogDisplayId = modelCatalogItem?.id || null;
    unified.modelConfidenceScore = inventoryMatch.confidence;
    unified.overallMatchStatus = vendorMatch.matchStatus === "ambiguous" ? "ambiguous" : "strong_candidate";
    unified.itemStatus = "review_required";
    unified.evidenceNotes.push(
      `Seeded inventory comparison matched ${product.printedTitle} using visible display cues: ${inventoryMatch.matchingCues.join("; ")}. The UPC/EAN and supplier SKU below come from the seeded box record; they were not read from this uploaded photo. Operator confirmation is required.`
    );
  } else if (seededCatalogAccepted && inventoryMatch?.product && ocrContradictsSeededProduct) {
    unified.overallMatchStatus = "ambiguous";
    unified.itemStatus = "review_required";
    unified.evidenceNotes.push(
      `Seeded inventory comparison matched ${inventoryMatch.product.printedTitle}, but extracted part number ${exactOcrPartNumberMatch?.matchedPartNumber} indicates ${exactOcrPartNumberMatch?.manufacturer} ${exactOcrPartNumberMatch?.modelName}. Seeded catalog UPC/EAN and SKU were withheld due to contradictory OCR model evidence.`
    );
  } else if (inventoryMatch && inventoryMatch.status !== "accepted") {
    const reason = inventoryMatch.status === "error"
      ? "The seeded catalog comparison was unavailable"
      : inventoryMatch.status === "ambiguous"
        ? "The seeded catalog could not distinguish the exact product variant"
        : "No seeded catalog product matched the uploaded back photo";
    unified.evidenceNotes.push(`${reason}; the existing model-identification flow was used and no seeded UPC/EAN or SKU was attached.`);
  }

  if (displayMatch?.verifiedExampleCount && displayMatch.matchedPartNumber) {
    unified.evidenceNotes.push(
      `Verified feedback matched part number ${displayMatch.matchedPartNumber} across ${displayMatch.verifiedExampleCount} independently verified displays.`
    );
  }
  if (visualSuggestionWithheld) {
    unified.evidenceNotes.push(
      "Visual model suggestion is unconfirmed by internal catalog references. Retained for human operator review."
    );
  }
  if (verifiedComparison?.selectedCatalogDisplayId && displayMatch?.catalogId === verifiedComparison.selectedCatalogDisplayId) {
    unified.evidenceNotes.push(
      `Compared available front and flex/back photos with operator-verified examples using ${verifiedComparison.model} (confidence ${verifiedComparison.confidence.toFixed(2)}). Matching cues: ${verifiedComparison.matchingCues.join("; ") || "none reported"}.`
    );
    if (verifiedComparison.conflictingCues.length) {
      unified.evidenceNotes.push(`Conflicting visual cues: ${verifiedComparison.conflictingCues.join("; ")}.`);
    }
    if (verifiedSuggestionShown) {
      unified.evidenceNotes.push(
        "This is the best-supported model suggestion, but the comparison is not strong enough to confirm automatically. Human confirmation is required."
      );
    }
  } else if (verifiedComparison?.selectedCatalogDisplayId) {
    unified.evidenceNotes.push("Verified-example comparison did not reach the confidence threshold; the candidate remains unconfirmed.");
  } else if (verifiedComparison?.error) {
    unified.evidenceNotes.push(`Verified-example comparison unavailable: ${verifiedComparison.error}`);
  } else if (verifiedComparison && verifiedComparison.selectedCatalogDisplayId === null) {
    unified.evidenceNotes.push("Verified-example comparison abstained because the reference images did not clearly match one candidate.");
  }
  if (verifiedComparison?.unresolvedAlternatives.length) {
    unified.evidenceNotes.push(`Visible features do not distinguish these catalog alternatives: ${verifiedComparison.unresolvedAlternatives.join(", ")}. Additional physical evidence is required.`);
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
  if (verifiedSuggestionShown) {
    // Keep the synthesized possible/strong-candidate status so the operator
    // can approve the reference-backed suggestion in one action. The item is
    // still forced into review; this is not an automatic verification.
    finalItemStatus = "review_required";
  }
  const ambiguousVerifiedEvidence =
    verifiedPartNumberConflicts.length > 0 ||
    Boolean(verifiedComparison?.conflictingCues.length) ||
    (verifiedComparisonDisagrees && !verifiedSuggestionShown) ||
    (Boolean(verifiedComparison?.unresolvedAlternatives.length) && !verifiedSuggestionShown);
  if (ambiguousVerifiedEvidence) {
    finalItemStatus = "review_required";
    unified.overallMatchStatus = "ambiguous";
  }
  if (verifiedComparisonDisagrees) {
    unified.evidenceNotes.push("Verified-example comparison selected a different model than the initial recognition result. Human confirmation is required.");
  }
  if (verifiedComparison?.conflictingCues.length) {
    unified.evidenceNotes.push("Verified-example comparison found conflicting physical cues. Human confirmation is required.");
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

  let seededDisplayProductId = shouldRunVisual ? null : item.seededDisplayProductId;
  let inventoryMatchConfidence: number | null = shouldRunVisual ? null : item.inventoryMatchConfidence;
  let inventoryMatchEvidence = shouldRunVisual ? null : item.inventoryMatchEvidence;

  if (shouldRunVisual && seededCatalogAccepted && inventoryMatch?.product && !verifiedPartNumberConflicts.length && !ocrContradictsSeededProduct) {
    seededDisplayProductId = inventoryMatch.product.id;
    inventoryMatchConfidence = inventoryMatch.confidence;
    inventoryMatchEvidence = {
      matchingCues: inventoryMatch.matchingCues,
      conflictingCues: inventoryMatch.conflictingCues,
      unresolvedAlternatives: inventoryMatch.unresolvedAlternatives,
    };
  }

  // Look up the active seeded product record if we have an attached or retained ID
  let activeSeededProduct: { id: string; manufacturer: string; modelName: string; printedTitle: string } | null = null;
  if (inventoryMatch?.product && seededDisplayProductId === inventoryMatch.product.id) {
    activeSeededProduct = inventoryMatch.product;
  } else if (seededDisplayProductId) {
    const [row] = await db.select({
      id: seededDisplayProducts.id,
      manufacturer: seededDisplayProducts.manufacturer,
      modelName: seededDisplayProducts.modelName,
      printedTitle: seededDisplayProducts.printedTitle,
    }).from(seededDisplayProducts).where(eq(seededDisplayProducts.id, seededDisplayProductId));
    if (row) activeSeededProduct = row;
  }

  // Validate retained/attached seeded product on every pipeline (including vendor_ocr retries)
  if (seededDisplayProductId && activeSeededProduct) {
    let clearReason: string | null = null;

    if (verifiedPartNumberConflicts.length > 0) {
      clearReason = "verified part-number conflict";
    } else if (
      exactOcrPartNumberMatch &&
      (normalizeIdentifier(exactOcrPartNumberMatch.manufacturer) !== normalizeIdentifier(activeSeededProduct.manufacturer) ||
       normalizeIdentifier(exactOcrPartNumberMatch.modelName) !== normalizeIdentifier(activeSeededProduct.modelName))
    ) {
      clearReason = `extracted part number ${exactOcrPartNumberMatch.matchedPartNumber} indicates ${exactOcrPartNumberMatch.manufacturer} ${exactOcrPartNumberMatch.modelName}`;
    } else if (
      manualModel &&
      (normalizeIdentifier(manualModel.predictedManufacturer) !== normalizeIdentifier(activeSeededProduct.manufacturer) ||
       normalizeIdentifier(manualModel.predictedModel) !== normalizeIdentifier(activeSeededProduct.modelName))
    ) {
      clearReason = "retained operator model correction";
    } else if (
      unified.predictedModel &&
      (normalizeIdentifier(unified.predictedManufacturer) !== normalizeIdentifier(activeSeededProduct.manufacturer) ||
       normalizeIdentifier(unified.predictedModel) !== normalizeIdentifier(activeSeededProduct.modelName))
    ) {
      clearReason = `model changed to ${unified.predictedManufacturer} ${unified.predictedModel}`;
    }

    if (clearReason) {
      seededDisplayProductId = null;
      inventoryMatchConfidence = null;
      inventoryMatchEvidence = null;
      unified.evidenceNotes.push(`The seeded product link and catalog UPC/SKU were cleared because of a contradiction: ${clearReason}.`);
    }
  } else if (seededDisplayProductId && !activeSeededProduct) {
    seededDisplayProductId = null;
    inventoryMatchConfidence = null;
    inventoryMatchEvidence = null;
  }

  if (manualModel) {
    // Validate catalogDisplayId against allCatalog so we never attempt to insert an orphaned foreign key
    if (manualModel.catalogDisplayId && !allCatalog.some((c) => c.id === manualModel.catalogDisplayId)) {
      manualModel.catalogDisplayId = null;
    }

    const modelDiffers = normalizeIdentifier(manualModel.predictedModel) !== normalizeIdentifier(unified.predictedModel);
    const manufacturerDiffers = normalizeIdentifier(manualModel.predictedManufacturer) !== normalizeIdentifier(unified.predictedManufacturer);
    const catalogDiffers = Boolean(manualModel.catalogDisplayId && manualModel.catalogDisplayId !== unified.catalogDisplayId);
    if (modelDiffers || manufacturerDiffers || catalogDiffers) {
      finalItemStatus = "review_required";
      unified.overallMatchStatus = "ambiguous";
      if (modelDiffers || manufacturerDiffers) {
        const automatedLabel = manufacturerDiffers
          ? [unified.predictedManufacturer, unified.predictedModel].filter(Boolean).join(" ") || "unresolved"
          : unified.predictedModel || "unresolved";
        unified.evidenceNotes.push(`Model retained from operator correction: ${manualModel.predictedManufacturer} ${manualModel.predictedModel} (Automated suggestion: ${automatedLabel}).`);
      } else {
        unified.evidenceNotes.push(`Operator-confirmed model retained, but its display assembly differs from the automated catalog link.`);
      }
    } else {
      unified.evidenceNotes.push(`Model retained from operator correction: ${manualModel.predictedManufacturer} ${manualModel.predictedModel}.`);
      if (allCatalog.length > 0 && !manualModel.catalogDisplayId) {
        finalItemStatus = "review_required";
      }
    }
  }

  // Filter internal debug telemetry, normalize, and deduplicate review notes
  const seenNotes = new Set<string>();
  const cleanReviewNotesList = unified.evidenceNotes
    .map((n) => n.trim())
    .filter((n) => {
      if (!n || seenNotes.has(n)) return false;
      if (/Evaluated \d+ tokens against \d+ active rules/i.test(n)) return false;
      if (/Display model could not be verified in internal catalog/i.test(n)) return false;
      if (/No OCR text tokens provided for matching/i.test(n)) return false;
      if (/Top matched rule pointed to missing vendor/i.test(n)) return false;
      seenNotes.add(n);
      return true;
    });

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
      reviewNotes: cleanReviewNotesList.join(" | "),
      seededDisplayProductId,
      inventoryMatchConfidence,
      inventoryMatchEvidence,
      updatedAt: new Date(),
      ...manualModel,
    });

  console.log(
    `[Processor] Completed item ${itemId}: Model=${manualModel?.predictedModel || unified.predictedModel || "Unresolved"}, Vendor=${unified.identifiedVendorName || "Unresolved"} (Status=${unified.overallMatchStatus})`
  );
}
