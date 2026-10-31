import type {
  OpenAiVisionOcrService,
  VerifiedDisplayComparisonResult,
} from "@/lib/recognition/openai/vision";
import type { OpenAiCallTelemetry, OpenAiTokenUsage } from "@/lib/recognition/openai/telemetry";

export interface SeededInventoryProduct {
  id: string;
  manufacturer: string;
  modelName: string;
  variantName: string;
  printedTitle: string;
  barcodeValue: string | null;
  barcodeFormat: string | null;
  barcodeSymbology: string | null;
  supplierSku: string | null;
}

export interface SeededInventoryReference {
  product: SeededInventoryProduct;
  displayId: string;
  imageBuffer: Buffer;
  imageType?: string;
}

export interface SeededInventoryTelemetry {
  discovery?: OpenAiCallTelemetry;
  final?: OpenAiCallTelemetry;
  totalCostUsd: number;
  usage: OpenAiTokenUsage;
}

export interface MatchSeededInventoryOptions {
  discoveryModel?: string;
  finalModel?: string;
  promptCachingOrder?: "prefix" | "legacy";
}

export type SeededInventoryMatch = {
  status: "accepted" | "ambiguous" | "miss" | "error" | "unavailable";
  product: SeededInventoryProduct | null;
  confidence: number;
  matchingCues: string[];
  conflictingCues: string[];
  unresolvedAlternatives: string[];
  supportingReferenceIds: string[];
  error?: string;
  telemetry?: SeededInventoryTelemetry;
};

type Comparator = Pick<OpenAiVisionOcrService, "compareToVerifiedExamples">;

function productLabel(product: SeededInventoryProduct) {
  return `${product.manufacturer} ${product.modelName} — ${product.variantName} (${product.printedTitle})`;
}

function uniqueProducts(references: SeededInventoryReference[]) {
  const byId = new Map<string, SeededInventoryProduct>();
  for (const reference of references) byId.set(reference.product.id, reference.product);
  return [...byId.values()];
}

function toComparisonReference(reference: SeededInventoryReference) {
  return {
    itemId: reference.displayId,
    catalogDisplayId: reference.product.id,
    label: productLabel(reference.product),
    images: [{ imageBuffer: reference.imageBuffer, imageType: reference.imageType || "back" }],
  };
}

function buildTelemetry(
  discovery?: VerifiedDisplayComparisonResult,
  finalComparison?: VerifiedDisplayComparisonResult
): SeededInventoryTelemetry | undefined {
  if (!discovery?.telemetry && !finalComparison?.telemetry) return undefined;

  const promptTokens = (discovery?.telemetry?.usage.promptTokens ?? 0) + (finalComparison?.telemetry?.usage.promptTokens ?? 0);
  const cachedPromptTokens = (discovery?.telemetry?.usage.cachedPromptTokens ?? 0) + (finalComparison?.telemetry?.usage.cachedPromptTokens ?? 0);
  const cacheWriteTokens = (discovery?.telemetry?.usage.cacheWriteTokens ?? 0) + (finalComparison?.telemetry?.usage.cacheWriteTokens ?? 0);
  const completionTokens = (discovery?.telemetry?.usage.completionTokens ?? 0) + (finalComparison?.telemetry?.usage.completionTokens ?? 0);
  const reasoningTokens = (discovery?.telemetry?.usage.reasoningTokens ?? 0) + (finalComparison?.telemetry?.usage.reasoningTokens ?? 0);
  const totalTokens = promptTokens + completionTokens;
  const totalCostUsd = Number(((discovery?.telemetry?.cost.totalCostUsd ?? 0) + (finalComparison?.telemetry?.cost.totalCostUsd ?? 0)).toFixed(8));

  return {
    discovery: discovery?.telemetry,
    final: finalComparison?.telemetry,
    totalCostUsd,
    usage: {
      promptTokens,
      cachedPromptTokens,
      cacheWriteTokens,
      completionTokens,
      reasoningTokens,
      totalTokens,
      isUsageMissing: false,
    },
  };
}

function result(
  status: SeededInventoryMatch["status"],
  comparison: Partial<VerifiedDisplayComparisonResult> = {},
  product: SeededInventoryProduct | null = null,
  telemetry?: SeededInventoryTelemetry
): SeededInventoryMatch {
  return {
    status,
    product,
    confidence: comparison.confidence || 0,
    matchingCues: comparison.matchingCues || [],
    conflictingCues: comparison.conflictingCues || [],
    unresolvedAlternatives: comparison.unresolvedAlternatives || [],
    supportingReferenceIds: comparison.supportingReferenceItemIds || [],
    ...(comparison.error ? { error: comparison.error } : {}),
    ...(telemetry ? { telemetry } : {}),
  };
}

/**
 * Match a new back photo to the exact seeded product variant. Discovery sees
 * one representative per product; the final comparison checks the selected
 * variant against its phone-model siblings before any UPC/SKU is attached.
 */
export async function matchSeededInventoryProduct(
  comparator: Comparator,
  targetImages: Array<{ imageBuffer: Buffer; imageType: string }>,
  references: SeededInventoryReference[],
  options?: MatchSeededInventoryOptions
): Promise<SeededInventoryMatch> {
  const products = uniqueProducts(references);
  if (!targetImages.length) {
    return result("unavailable", { error: "No target display images available for comparison" });
  }
  if (!references.length || !products.length) {
    return result("unavailable", {
      error: "No active inventory references available for comparison",
    });
  }

  // Safe policy for sparse reference coverage:
  // When catalog contains only a single product, evaluate the target image against it.
  // Because single-reference coverage lacks comparison against competing alternatives,
  // do not automatically accept it with full confidence; instead, preserve a provisional candidate
  // for human review rather than declaring a catalog miss.
  if (products.length === 1) {
    const singleProduct = products[0];
    const candidateReferences = references.filter((r) => r.product.id === singleProduct.id).slice(0, 3);
    const discovery = await comparator.compareToVerifiedExamples(
      targetImages,
      candidateReferences.map(toComparisonReference),
      [],
      {
        mode: "discovery",
        identityLevel: "product_variant",
        model: options?.discoveryModel,
        promptCachingOrder: options?.promptCachingOrder,
      }
    );
    const telemetry = buildTelemetry(discovery);
    if (discovery.error) return result("error", discovery, null, telemetry);

    if (discovery.selectedCatalogDisplayId === singleProduct.id) {
      return {
        ...result("ambiguous", discovery, singleProduct, telemetry),
        confidence: Math.min(discovery.confidence, 0.70),
        matchingCues: discovery.matchingCues,
        conflictingCues: discovery.conflictingCues,
        unresolvedAlternatives: [singleProduct.id],
      };
    }

    const ambiguous = discovery.conflictingCues.length > 0 || discovery.unresolvedAlternatives.length > 0;
    return result(ambiguous ? "ambiguous" : "miss", discovery, null, telemetry);
  }

  const representatives = products.map((product) =>
    references.find((reference) => reference.product.id === product.id)!
  );
  const discovery = await comparator.compareToVerifiedExamples(
    targetImages,
    representatives.map(toComparisonReference),
    [],
    {
      mode: "discovery",
      identityLevel: "product_variant",
      model: options?.discoveryModel,
      promptCachingOrder: options?.promptCachingOrder,
    }
  );
  if (discovery.error) return result("error", discovery, null, buildTelemetry(discovery));
  if (!discovery.selectedCatalogDisplayId) {
    return result(
      discovery.confidence >= 0.65 ? "ambiguous" : "miss",
      discovery,
      null,
      buildTelemetry(discovery)
    );
  }

  const firstSelection = products.find((product) => product.id === discovery.selectedCatalogDisplayId);
  if (!firstSelection) {
    return result(
      "error",
      { ...discovery, error: "The inventory matcher returned an unknown product ID." },
      null,
      buildTelemetry(discovery)
    );
  }

  const sameModelAlternatives = products.filter((product) =>
    product.id !== firstSelection.id &&
    product.manufacturer.toLowerCase() === firstSelection.manufacturer.toLowerCase() &&
    product.modelName.toLowerCase() === firstSelection.modelName.toLowerCase()
  ).slice(0, 7);
  const comparisonProducts = [firstSelection, ...sameModelAlternatives];
  if (comparisonProducts.length < 2) {
    comparisonProducts.push(...products.filter((product) => product.id !== firstSelection.id).slice(0, 2));
  }
  const comparisonIds = new Set(comparisonProducts.map((product) => product.id));
  const finalReferences = references.filter((reference) => comparisonIds.has(reference.product.id));
  const seenPerProduct = new Map<string, number>();
  const boundedReferences = finalReferences.filter((reference) => {
    const count = seenPerProduct.get(reference.product.id) || 0;
    const limit = reference.product.id === firstSelection.id ? 2 : 1;
    if (count >= limit) return false;
    seenPerProduct.set(reference.product.id, count + 1);
    return true;
  });
  const finalComparison = await comparator.compareToVerifiedExamples(
    targetImages,
    boundedReferences.map(toComparisonReference),
    [],
    {
      mode: "final",
      identityLevel: "product_variant",
      model: options?.finalModel,
      promptCachingOrder: options?.promptCachingOrder,
    }
  );
  const combinedTelemetry = buildTelemetry(discovery, finalComparison);
  if (finalComparison.error) return result("error", finalComparison, null, combinedTelemetry);

  const selectedProduct = products.find((product) => product.id === finalComparison.selectedCatalogDisplayId) || null;
  if (!selectedProduct) {
    const ambiguous = finalComparison.conflictingCues.length > 0 || finalComparison.unresolvedAlternatives.length > 0;
    return result(ambiguous ? "ambiguous" : "miss", finalComparison, null, combinedTelemetry);
  }

  // Filter out any conflicting cues that explicitly describe why other rejected
  // candidates did not match (e.g. "DSP-005 has a different flex layout..."), which
  // are observations ruling out alternatives rather than contradictions on the selected product.
  const selectedRefIds = new Set(
    references
      .filter((r) => r.product.id === selectedProduct.id)
      .map((r) => r.displayId.toLowerCase())
  );
  const otherRefIds = references
    .filter((r) => r.product.id !== selectedProduct.id)
    .map((r) => r.displayId.toLowerCase());

  const contradictoryCues = finalComparison.conflictingCues.filter((cue) => {
    const lower = cue.toLowerCase();
    const mentionsSelected = [...selectedRefIds].some((id) => lower.includes(id));
    if (mentionsSelected) return true;

    const matchingOtherIds = otherRefIds.filter((id) => lower.includes(id));
    if (matchingOtherIds.length > 0) {
      // Unambiguously check if the cue exclusively explains why the alternative reference was ruled out
      // (e.g. "DSP-005 has a large black backing patch... unlike the uploaded display")
      const otherPattern = new RegExp(`\\b(${matchingOtherIds.join("|")})\\b`, "i");
      const isExclusivelyAboutAlternative = otherPattern.test(lower) &&
        /\b(has|shows|features|exhibits|contains|differs|lacks|unlike|instead of)\b/i.test(lower) &&
        !/\b(target|uploaded|item)\s+(has|shows|contains|differs|lacks)\b/i.test(lower);

      if (isExclusivelyAboutAlternative) return false;
    }
    return true;
  });

  // This only attaches a suggestion. The existing RMS review step still needs
  // an operator to confirm it before the item becomes verified.
  const accepted = finalComparison.confidence >= 0.9 &&
    finalComparison.matchingCues.length >= 2 &&
    contradictoryCues.length === 0 &&
    finalComparison.unresolvedAlternatives.length === 0 &&
    finalComparison.supportingReferenceItemIds.length > 0;

  return result(accepted ? "accepted" : "ambiguous", finalComparison, accepted ? selectedProduct : null, combinedTelemetry);
}

export type InventoryMatchStatus =
  | "not_evaluated"
  | "processing"
  | "matched"
  | "no_verified_match"
  | "review_required"
  | "error";

export const VALID_INVENTORY_MATCH_STATUSES: ReadonlySet<string> = new Set([
  "not_evaluated",
  "processing",
  "matched",
  "no_verified_match",
  "review_required",
  "error",
]);

export function deriveInventoryMatchStatus(item: {
  status?: string | null;
  inventoryMatchStatus?: string | null;
  seededDisplayProductId?: string | null;
  inventoryMatchConfidence?: number | null;
  inventoryMatchEvidence?: {
    matchingCues?: string[];
    conflictingCues?: string[];
    unresolvedAlternatives?: string[];
  } | null;
  verifiedByUserId?: string | null;
}): InventoryMatchStatus {
  const persisted = item.inventoryMatchStatus;

  // 1. If an explicit status was persisted, validate and enforce domain constraints
  if (persisted && typeof persisted === "string") {
    if (!VALID_INVENTORY_MATCH_STATUSES.has(persisted)) {
      // Invalid persisted status must NOT be blindly returned through type assertion
      return "review_required";
    }

    if (persisted === "matched") {
      // A matched screen must have an attached product ID
      if (!item.seededDisplayProductId) {
        return "review_required";
      }
      // A matched screen must not have contradictory cues or unresolved alternatives
      if (
        (item.inventoryMatchEvidence?.conflictingCues && item.inventoryMatchEvidence.conflictingCues.length > 0) ||
        (item.inventoryMatchEvidence?.unresolvedAlternatives && item.inventoryMatchEvidence.unresolvedAlternatives.length > 0)
      ) {
        return "review_required";
      }
      return "matched";
    }

    if (persisted === "no_verified_match") {
      // Contradiction: if a seeded product ID is attached, it cannot be 'no_verified_match'
      if (item.seededDisplayProductId) {
        return "review_required";
      }
      return "no_verified_match";
    }

    if (persisted === "processing") return "processing";
    if (persisted === "review_required") return "review_required";
    if (persisted === "error") return "error";
    // If explicitly 'not_evaluated', fall through to lifecycle state checks below
  }

  // 2. Lifecycle state fallbacks (for un-backfilled legacy records or active job transitions)
  if (item.status === "processing" || item.status === "queued") {
    return "processing";
  }
  if (item.status === "failed") {
    return "error";
  }

  // If a seeded product ID exists on an un-backfilled legacy record:
  if (item.seededDisplayProductId) {
    // Only positive multi-cue physical proof justifies automatic 'matched' inference
    // on un-backfilled records. Generic RMA 'verified' status only confirms device model,
    // so records without physical proof remain 'review_required'.
    const hasPhysicalProof =
      typeof item.inventoryMatchConfidence === "number" &&
      item.inventoryMatchConfidence >= 0.90 &&
      Array.isArray(item.inventoryMatchEvidence?.matchingCues) &&
      item.inventoryMatchEvidence.matchingCues.length >= 2 &&
      (!item.inventoryMatchEvidence.conflictingCues || item.inventoryMatchEvidence.conflictingCues.length === 0) &&
      (!item.inventoryMatchEvidence.unresolvedAlternatives || item.inventoryMatchEvidence.unresolvedAlternatives.length === 0);

    if (hasPhysicalProof) {
      return "matched";
    }
    // Lacking positive physical proof: do NOT auto-infer 'matched' from generic RMA status!
    return "review_required";
  }

  // A generic RMA status (verified, suggested_match, review_required) does NOT imply an inventory comparison miss!
  // Without completed comparison evidence, unlinked items remain 'not_evaluated'.
  return "not_evaluated";
}

/**
 * Match a text query (e.g. predicted model, assembly title, or search candidate title)
 * against available seeded display products to resolve barcode (UPC) and product SKU.
 */
export function matchSeededProductByText<T extends {
  id: string;
  manufacturer: string;
  modelName: string;
  variantName?: string | null;
  printedTitle: string;
  barcodeValue: string | null;
  supplierSku: string | null;
}>(query: string | null | undefined, seeds: T[]): T | null {
  if (!query || !query.trim() || !seeds || seeds.length === 0) return null;
  const q = query.toLowerCase().trim();
  const cleanQ = q.replace(/^(?:apple|samsung|google|oneplus|motorola|lg)\s+/i, "").trim();

  // 1. Exact match on printedTitle, supplierSku, or barcodeValue
  const exactCode = seeds.find((s) =>
    (s.barcodeValue && s.barcodeValue.trim() === q) ||
    (s.supplierSku && s.supplierSku.toLowerCase().trim() === q) ||
    (s.printedTitle && s.printedTitle.toLowerCase().trim() === q)
  );
  if (exactCode) return exactCode;

  // 2. Exact match on manufacturer + modelName or modelName alone
  const exactModel = seeds.find((s) => {
    const full = `${s.manufacturer} ${s.modelName}`.toLowerCase().trim();
    const mdl = s.modelName.toLowerCase().trim();
    return full === q || mdl === q || mdl === cleanQ;
  });
  if (exactModel) return exactModel;

  // 3. Substring match: sorted by modelName length descending (prioritize "iPhone 16 Pro Max" over "iPhone 16 Pro")
  const sortedSeeds = [...seeds].sort(
    (a, b) => (b.modelName?.length || 0) - (a.modelName?.length || 0)
  );

  const partialMatch = sortedSeeds.find((s) => {
    const mdl = s.modelName.toLowerCase().trim();
    const pTitle = s.printedTitle?.toLowerCase().trim();
    const full = `${s.manufacturer} ${s.modelName}`.toLowerCase().trim();
    return (
      (mdl.length >= 4 && (q.includes(mdl) || cleanQ.includes(mdl))) ||
      (pTitle && pTitle.length >= 4 && q.includes(pTitle)) ||
      (full.length >= 6 && q.includes(full))
    );
  });
  if (partialMatch) return partialMatch;

  // 4. Reverse substring: if clean query is at least 4 chars and seed modelName includes it
  if (cleanQ.length >= 4) {
    const reverseMatch = sortedSeeds.find((s) => {
      const mdl = s.modelName.toLowerCase().trim();
      return mdl.includes(cleanQ);
    });
    if (reverseMatch) return reverseMatch;
  }

  return null;
}

