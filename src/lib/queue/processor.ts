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

  if (shouldRunVisual) {
    // Select the best image for visual identification (front / primary screen face)
    const primaryImage =
      images.find((img) => img.imageType === "primary" || img.imageType === "front") ||
      images[0];

    try {
      let configuredLensProvider: string | undefined = process.env.LENS_PROVIDER;
      let configuredFilterQuery: string | undefined = process.env.LENS_FILTER_QUERY;
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

        if (!configuredFilterQuery) {
          const [filterSetting] = await db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, "LENS_FILTER_QUERY"));
          if (filterSetting?.value && typeof filterSetting.value === "string") {
            configuredFilterQuery = filterSetting.value;
          }
        }
      } catch {
        // Fallback to env
      }

      const imageBuffer = await storage.getImageBuffer(primaryImage.storagePath);
      const lensProvider = getVisualRecognitionProvider(
        configuredLensProvider,
        undefined,
        configuredFilterQuery
      );
      const res = await lensProvider.identifyDisplay(imageBuffer, {
        filename: primaryImage.originalFilename,
        mimeType: primaryImage.mimeType,
        q: configuredFilterQuery,
      });

      visualResult = res;

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
            q: visualResult.usedQuery || configuredFilterQuery || null,
          },
          rawResponse: visualResult.rawResponse,
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
