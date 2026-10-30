import type {
  OpenAiVisionOcrService,
  VerifiedDisplayComparisonResult,
} from "@/lib/recognition/openai/vision";

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

export type SeededInventoryMatch = {
  status: "accepted" | "ambiguous" | "miss" | "error";
  product: SeededInventoryProduct | null;
  confidence: number;
  matchingCues: string[];
  conflictingCues: string[];
  unresolvedAlternatives: string[];
  supportingReferenceIds: string[];
  error?: string;
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

function result(
  status: SeededInventoryMatch["status"],
  comparison: Partial<VerifiedDisplayComparisonResult> = {},
  product: SeededInventoryProduct | null = null
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
  references: SeededInventoryReference[]
): Promise<SeededInventoryMatch> {
  const products = uniqueProducts(references);
  if (!targetImages.length || references.length < 2 || products.length < 2) {
    return result("miss");
  }

  const representatives = products.map((product) =>
    references.find((reference) => reference.product.id === product.id)!
  );
  const discovery = await comparator.compareToVerifiedExamples(
    targetImages,
    representatives.map(toComparisonReference),
    [],
    { mode: "discovery", identityLevel: "product_variant" }
  );
  if (discovery.error) return result("error", discovery);
  if (!discovery.selectedCatalogDisplayId) {
    return result(discovery.confidence >= 0.65 ? "ambiguous" : "miss", discovery);
  }

  const firstSelection = products.find((product) => product.id === discovery.selectedCatalogDisplayId);
  if (!firstSelection) return result("error", { ...discovery, error: "The inventory matcher returned an unknown product ID." });

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
    { mode: "final", identityLevel: "product_variant" }
  );
  if (finalComparison.error) return result("error", finalComparison);

  const selectedProduct = products.find((product) => product.id === finalComparison.selectedCatalogDisplayId) || null;
  if (!selectedProduct) {
    const ambiguous = finalComparison.conflictingCues.length > 0 || finalComparison.unresolvedAlternatives.length > 0;
    return result(ambiguous ? "ambiguous" : "miss", finalComparison);
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

  return result(accepted ? "accepted" : "ambiguous", finalComparison, accepted ? selectedProduct : null);
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

