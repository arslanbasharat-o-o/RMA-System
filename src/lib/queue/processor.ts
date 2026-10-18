import { db } from "@/db";
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
import { and, desc, eq, inArray } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { getVisualRecognitionProvider, VisualIdentificationResult } from "@/lib/recognition/lens";
import { OpenAiVisionOcrService } from "@/lib/recognition/openai";
import { cleanRawCandidateTitle } from "@/lib/recognition/lens/cleaner-utils";
import {
  VISUAL_DECISION_POLICY,
  readVisualDecisionSnapshot,
  snapshotVisualDecision,
  stableVisualDecision,
  visualResultFromSnapshot,
  type VisualDecisionSnapshot,
} from "@/lib/recognition/lens/stable-decision";
import { getManualModelOverride } from "@/lib/recognition/manual-model";
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
    if (snapshot && !(snapshot.manual && run.rmaItemId === excludeManualItemId)) snapshots.push(snapshot);
  }
  return snapshots;
}

function selectedRecognitionImage<T extends { imageType: string; sortOrder: number }>(images: T[]): T | undefined {
  return images.find((image) => image.imageType === "primary" || image.imageType === "front") || images[0];
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
          });
          const reconciled = stableVisualDecision(previous, fresh.error ? undefined : snapshotVisualDecision(fresh));
          visualResult = reconciled && (reconciled.manual || reconciled.conflict ||
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
              stableDecision: readVisualDecisionSnapshot(visualResult.rawResponse)
                || snapshotVisualDecision(visualResult),
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

  const ocrTask = (async () => {
    if (shouldRunOcr) {
      let configuredModel: string | undefined;
      try {
        const [setting] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, "OPENAI_VISION_MODEL"));
        if (setting?.value && typeof setting.value === "string") {
          configuredModel = setting.value;
        }
      } catch {
        // Fallback to env default
      }

      const ocrService = new OpenAiVisionOcrService(undefined, configuredModel);

      // Select OCR-relevant images (back, stamp_closeup, sticker_closeup, flex_cable)
      const ocrImages = images.filter((img) =>
        ["back", "stamp_closeup", "sticker_closeup", "flex_cable"].includes(img.imageType)
      );

      // If no specialized angles, analyze all available images (up to 3 to bound resources)
      const targetImages = (ocrImages.length > 0 ? ocrImages : images).slice(0, 3);

      for (const img of targetImages) {
        try {
          const imgBuffer = await storage.getImageBuffer(img.storagePath);
          const res = await ocrService.extractMarkings(imgBuffer, {
            filename: img.originalFilename,
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

  const vendorMatcher = new VendorRuleMatcher(allRules, allVendors, allVariants);

  // Collect all extracted tokens
  const ocrTokens = [
    ...ocrStructured.vendor_markings,
    ...ocrStructured.detected_codes,
    ...ocrStructured.raw_text,
    ...ocrStructured.possible_vendor_aliases,
  ];

  const vendorMatch = vendorMatcher.matchTokens(ocrTokens);
  const displayMatch = matchDisplayToCatalog(
    visualResult,
    allCatalog,
    ocrStructured.part_numbers
  );

  const unified = synthesizeRecognition(
    displayMatch,
    vendorMatch,
    ocrStructured,
    visualResult
  );

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
