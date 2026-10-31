import { VisualIdentificationResult } from "./lens/types";
import { OcrStructuredOutput } from "./openai/types";
import { VendorMatchResult } from "./rules/types";
import { extractAppleModels } from "./lens/model-evidence";
import { cleanCatalogModelName, sanitizeDisplayTechnology } from "./lens/cleaner-utils";
import { isUnidentifiedLabel } from "@/lib/model-result";

export interface CatalogDisplayMatch {
  catalogId: string;
  manufacturer: string;
  modelName: string;
  normalizedIdentifier: string;
  displayTechnology?: string | null;
  internalSku?: string | null;
  confidenceScore: number;
  matchType: "exact" | "alias" | "candidate" | "part_number";
  contradictionDetected?: boolean;
  contradictionDetails?: string;
  verifiedExampleCount?: number;
  matchedPartNumber?: string;
}

export interface UnifiedIdentificationResult {
  // Display Model (Task A)
  predictedManufacturer: string | null;
  predictedModel: string | null;
  predictedDisplayAssembly: string | null;
  catalogDisplayId: string | null;
  modelConfidenceScore: number;

  // Vendor & Variant (Task B)
  identifiedVendorId: string | null;
  identifiedVendorName: string | null;
  identifiedVendorVariantId: string | null;
  identifiedVendorVariantName: string | null;
  vendorConfidenceScore: number;

  // Synthesis & Status
  overallMatchStatus:
    | "exact_match"
    | "strong_candidate"
    | "possible_candidate"
    | "ambiguous"
    | "unknown";
  itemStatus:
    | "suggested_match"
    | "review_required"
    | "verified"
    | "failed";

  extractedTextSummary: string;
  matchedCodesSummary: string;
  evidenceNotes: string[];
}

function normalizeModelText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/pro\s*max/g, "pro max")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsModelPhrase(title: string, phrase: string): boolean {
  const normalizedTitle = ` ${normalizeModelText(title)} `;
  const normalizedPhrase = normalizeModelText(phrase);
  if (!normalizedPhrase) return false;
  const offset = normalizedTitle.indexOf(` ${normalizedPhrase} `);
  if (offset < 0) return false;
  const followingText = normalizedTitle.slice(offset + normalizedPhrase.length + 2);
  return !/^(?:pro|max|plus|ultra|fe|mini)\b/.test(followingText);
}

function compactSlug(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]/g, "");
}

function compactPartNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Normalizes and matches Google Lens candidates against internal display catalog items.
 */
export function matchDisplayToCatalog(
  visualResult: VisualIdentificationResult,
  catalog: Array<{
    id: string;
    manufacturer: string;
    modelName: string;
    normalizedModelIdentifier: string;
    aliases: string[];
    internalSku: string | null;
    knownPartNumbers: string[];
    displayTechnology: string | null;
    verifiedPartNumberSupport?: Record<string, number>;
  }>,
  extractedPartNumbers: string[] = []
): CatalogDisplayMatch | null {
  // 1. First priority: Exact match via extracted part number
  const partNumberMatches = new Map<string, {
    item: (typeof catalog)[number];
    matchedPartNumber: string;
    verifiedExampleCount: number;
  }>();
  for (const partNum of extractedPartNumbers) {
    const cleanPart = compactPartNumber(partNum);
    for (const item of catalog) {
      if (item.knownPartNumbers.some((known) => compactPartNumber(known) === cleanPart)) {
        partNumberMatches.set(item.id, {
          item,
          matchedPartNumber: partNum,
          verifiedExampleCount: item.verifiedPartNumberSupport?.[cleanPart] || 0,
        });
      }
    }
  }
  if (partNumberMatches.size === 1) {
    const { item, matchedPartNumber, verifiedExampleCount } = [...partNumberMatches.values()][0];
    let contradictionDetected = false;
    let contradictionDetails: string | undefined;

    if (visualResult.candidates.length > 0) {
      const topCandidate = visualResult.candidates[0].title;
      const matchesVisual =
        containsModelPhrase(topCandidate, item.modelName) ||
        (item.aliases || []).some((alias) => {
          const numericAlias = /^\d+$/.test(normalizeModelText(alias));
          return (!numericAlias || containsModelPhrase(topCandidate, item.manufacturer)) &&
            containsModelPhrase(topCandidate, alias);
        });

      if (!matchesVisual) {
        contradictionDetected = true;
        contradictionDetails = `Part number matches ${item.manufacturer} ${item.modelName}, but visual search suggested '${topCandidate}'`;
      }
    }

    return {
      catalogId: item.id,
      manufacturer: item.manufacturer,
      modelName: item.modelName,
      normalizedIdentifier: item.normalizedModelIdentifier,
      displayTechnology: item.displayTechnology,
      internalSku: item.internalSku,
      confidenceScore: contradictionDetected
        ? 0.7
        : verifiedExampleCount
        ? verifiedExampleCount >= 3 ? 0.96 : 0.91
        : 0.99,
      matchType: "part_number",
      contradictionDetected,
      contradictionDetails,
      verifiedExampleCount: verifiedExampleCount || undefined,
      matchedPartNumber,
    };
  } else if (partNumberMatches.size > 1) {
    return null;
  }

  // Do not turn one weak or conflicting visual result into a catalog identity
  // merely because its title happens to match one stored alias.
  if (visualResult.cleanDecision && visualResult.cleanDecision.confidence < 0.5) {
    return null;
  }

  // 2. Second priority: Match normalized visual result manufacturer + model (including OpenAI decision)
  const mfg =
    visualResult.cleanDecision?.manufacturer ||
    visualResult.normalizedManufacturer ||
    null;
  const rawModel =
    visualResult.cleanDecision?.model ||
    visualResult.normalizedModel ||
    null;

  const mdl =
    mfg && rawModel && rawModel.toLowerCase().startsWith(mfg.toLowerCase())
      ? rawModel.slice(mfg.length).trim()
      : rawModel;

  if (mfg && mdl) {
    const normSearchFull = compactSlug(`${mfg} ${mdl}`);
    const normSearchModel = compactSlug(mdl);
    const normMfg = compactSlug(mfg);

    const exactMatches = catalog.filter((item) => {
      const normCatFull = compactSlug(`${item.manufacturer} ${item.modelName}`);
      const normCatModel = compactSlug(item.modelName);
      const normCatMfg = compactSlug(item.manufacturer);

      // Clean catalog model if it repeats the manufacturer (e.g. "Samsung Galaxy S9 Plus" -> "Galaxy S9 Plus")
      const cleanCatModel =
        item.modelName.toLowerCase().startsWith(item.manufacturer.toLowerCase())
          ? item.modelName.slice(item.manufacturer.length).trim()
          : item.modelName;
      const normCatCleanModel = compactSlug(cleanCatModel);

      const isModelMatch =
        normSearchModel === normCatModel ||
        normSearchModel === normCatCleanModel ||
        normSearchFull === normCatModel ||
        normSearchModel === normCatFull;

      return normSearchFull === normCatFull || (normMfg === normCatMfg && isModelMatch);
    });
    // When only one exact catalog assembly exists, select it immediately.
    const selectedAppleModel = extractAppleModels(mdl)[0];
    const familyMatches = selectedAppleModel ? catalog.filter((item) =>
      compactSlug(item.manufacturer) === normMfg && extractAppleModels(item.modelName)[0] === selectedAppleModel
    ) : exactMatches;

    if (exactMatches.length === 1 && familyMatches.length <= 1) {
      const item = exactMatches[0];
      return {
        catalogId: item.id,
        manufacturer: item.manufacturer,
        modelName: item.modelName,
        normalizedIdentifier: item.normalizedModelIdentifier,
        displayTechnology: item.displayTechnology,
        internalSku: item.internalSku,
        confidenceScore: Math.min(0.98, visualResult.cleanDecision?.confidence ?? 0.75),
        matchType: "exact",
      };
    }
  }

  // 3. Third priority: Alias and search term matching
  const searchQueries: string[] = [];
  if (visualResult.cleanDecision?.displayName) {
    searchQueries.push(visualResult.cleanDecision.displayName);
  }
  if (mdl) {
    if (mfg) searchQueries.push(`${mfg} ${mdl}`);
    searchQueries.push(mdl);
  }
  for (const candidate of visualResult.candidates) {
    if (candidate.title) searchQueries.push(candidate.title);
  }

  for (const query of searchQueries) {
    const title = normalizeModelText(query);
    const querySlug = compactSlug(query);
    if (!title && !querySlug) continue;

    const specificity = new Map<string, number>();
    const matches = catalog.filter((item) => {
      if (mfg && mdl) {
        if (compactSlug(item.manufacturer) !== compactSlug(mfg)) return false;
        const selectedApple = extractAppleModels(mdl);
        const catalogApple = extractAppleModels(item.modelName);
        const cleanModel = item.modelName.toLowerCase().startsWith(item.manufacturer.toLowerCase())
          ? item.modelName.slice(item.manufacturer.length).trim() : item.modelName;
        const sameModel = compactSlug(cleanModel) === compactSlug(mdl) ||
          (item.aliases || []).some((alias) => compactSlug(alias) === compactSlug(mdl)) ||
          (selectedApple.length === 1 && catalogApple.length === 1 && selectedApple[0] === catalogApple[0]);
        // Lower-ranked sources may suggest a different device. They cannot
        // replace the chosen identity merely because that SKU is in the catalog.
        if (!sameModel) return false;
      }
      const itemMfg = normalizeModelText(item.manufacturer);
      const itemMfgSlug = compactSlug(item.manufacturer);
      const manufacturerPresent =
        (mfg && compactSlug(mfg) === itemMfgSlug) ||
        ` ${title} `.includes(` ${itemMfg} `) ||
        querySlug.includes(itemMfgSlug);

      const matchingAliases = (item.aliases || []).filter((alias) => {
        const normalizedAlias = normalizeModelText(alias);
        const aliasSlug = compactSlug(alias);
        if (!normalizedAlias || !aliasSlug) return false;

        // Bare numbers such as "12" only identify a model when its manufacturer is present.
        if (/^\d+$/.test(normalizedAlias) && !manufacturerPresent) return false;

        return (
          containsModelPhrase(query, alias) ||
          querySlug === aliasSlug
        );
      });
      if (!matchingAliases.length) return false;
      specificity.set(item.id, Math.max(...matchingAliases.map((alias) => normalizeModelText(alias).length)));
      return true;
    });

    const bestSpecificity = Math.max(0, ...specificity.values());
    const strongestMatches = matches.filter((item) => specificity.get(item.id) === bestSpecificity);
    if (strongestMatches.length === 1 && matches.length === 1) {
      const item = strongestMatches[0];
      const cleanName = cleanCatalogModelName(item.modelName);
      return {
        catalogId: item.id,
        manufacturer: item.manufacturer,
        modelName: cleanName,
        normalizedIdentifier: item.normalizedModelIdentifier,
        displayTechnology: sanitizeDisplayTechnology(cleanName, item.displayTechnology),
        internalSku: item.internalSku,
        confidenceScore: Math.min(0.95, visualResult.cleanDecision?.confidence ?? 0.75),
        matchType: "alias",
      };
    }
    // Listing keywords cannot establish a supplier-specific assembly variant.
    if (matches.length > 1) return null;
  }

  return null;
}

/**
 * Combines independent visual and vendor recognition evidence into a unified result.
 */
export function synthesizeRecognition(
  displayMatch: CatalogDisplayMatch | null,
  vendorMatch: VendorMatchResult,
  ocrOutput: OcrStructuredOutput,
  visualResult?: VisualIdentificationResult | null
): UnifiedIdentificationResult {
  const evidenceNotes: string[] = [];
  const visualStatus = visualResult?.cleanDecision?.decisionStatus;
  const isCleanerRejected = visualStatus === "rejected";
  const isCleanerAbstained = visualStatus === "abstained";
  const isProviderError = visualStatus === "provider_error";
  const rejectedModel = visualResult?.cleanDecision?.rejectedModel;

  const visualModelIsUsable = !visualResult?.cleanDecision || (
    visualResult.cleanDecision.confidence >= 0.5 &&
    !isCleanerRejected &&
    !isCleanerAbstained &&
    !isProviderError
  );

  // If a candidate model was explicitly rejected by physical inspection,
  // it must NEVER be resurrected via catalog alias or visual candidate fallback.
  const displayMatchIsRejected = Boolean(
    isCleanerRejected && (
      (rejectedModel && displayMatch && (
        compactSlug(displayMatch.modelName) === compactSlug(rejectedModel)
      )) ||
      (displayMatch?.matchType !== "part_number" && rejectedModel)
    )
  );

  // Exact part-number evidence remains authoritative and independently verified,
  // allowing an independently verified model to be accepted even when a weaker provider has provider_error, abstained, or disagreed.
  const acceptedDisplayMatch = displayMatch &&
    !displayMatchIsRejected &&
    (visualModelIsUsable || displayMatch.matchType === "part_number")
    ? displayMatch
    : null;

  // Model assignment
  const predictedManufacturer =
    acceptedDisplayMatch?.manufacturer ||
    visualResult?.cleanDecision?.manufacturer ||
    visualResult?.normalizedManufacturer ||
    null;

  const visualCleanModel = (isCleanerRejected || isCleanerAbstained || isProviderError)
    ? null
    : visualResult?.cleanDecision?.model ||
      visualResult?.cleanDecision?.suggestedModel ||
      (rejectedModel && visualResult?.normalizedModel === rejectedModel ? null : visualResult?.normalizedModel) ||
      null;

  let rawModel = acceptedDisplayMatch?.modelName
    ? cleanCatalogModelName(acceptedDisplayMatch.modelName)
    : visualCleanModel;

  // Clean redundant manufacturer prefix if present
  if (
    predictedManufacturer &&
    rawModel &&
    rawModel.toLowerCase().startsWith(predictedManufacturer.toLowerCase())
  ) {
    rawModel = rawModel.slice(predictedManufacturer.length).trim();
  }
  const predictedModel = rawModel;

  const catalogCleanName = acceptedDisplayMatch?.modelName
    ? cleanCatalogModelName(acceptedDisplayMatch.modelName)
    : null;

  const displayLabel = acceptedDisplayMatch && catalogCleanName
    ? (catalogCleanName.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(acceptedDisplayMatch.manufacturer.toLowerCase().replace(/[^a-z0-9]/g, ""))
        ? catalogCleanName
        : `${acceptedDisplayMatch.manufacturer} ${catalogCleanName}`)
    : null;

  const cleanTech = sanitizeDisplayTechnology(predictedModel || catalogCleanName || "", acceptedDisplayMatch?.displayTechnology);

  // If cleaner rejected the candidate model, never resurrect the rejected model via stale detectedDisplayAssembly
  const isAssemblyRejected = Boolean(
    rejectedModel &&
    visualResult?.detectedDisplayAssembly &&
    (compactSlug(visualResult.detectedDisplayAssembly).includes(compactSlug(rejectedModel)) ||
     isCleanerRejected)
  );
  const safeDetectedAssembly = !isAssemblyRejected && !isCleanerRejected && visualResult?.detectedDisplayAssembly && !isUnidentifiedLabel(visualResult.detectedDisplayAssembly)
    ? visualResult.detectedDisplayAssembly
    : null;

  const predictedDisplayAssembly = acceptedDisplayMatch
    ? `${displayLabel}${cleanTech ? ` (${cleanTech})` : " Display"}`
    : (visualResult?.cleanDecision?.displayName && !isUnidentifiedLabel(visualResult.cleanDecision.displayName)
       ? visualResult.cleanDecision.displayName
       : (safeDetectedAssembly
          ? safeDetectedAssembly
          : (predictedManufacturer && predictedModel
             ? `${predictedManufacturer} ${predictedModel} Display`
             : predictedManufacturer === "Apple"
             ? "Unidentified Apple Display"
             : "Unidentified Display")));
  const catalogDisplayId = acceptedDisplayMatch?.catalogId || null;
  const modelConfidenceScore =
    acceptedDisplayMatch?.confidenceScore ||
    (visualResult?.cleanDecision?.confidence ?? (visualResult?.normalizedModel ? 0.75 : 0));

  if (acceptedDisplayMatch) {
    evidenceNotes.push(
      `Display identified as ${predictedManufacturer} ${predictedModel} via ${acceptedDisplayMatch.matchType} matching.`
    );
  } else if (visualResult?.cleanDecision?.displayName) {
    const rawReason = visualResult.cleanDecision.reasoning;
    if (rawReason && !rawReason.toLowerCase().includes("internal catalog")) {
      evidenceNotes.push(`Visual suggestion: ${predictedDisplayAssembly}. ${rawReason}`);
    } else {
      evidenceNotes.push(`Visual suggestion: ${predictedDisplayAssembly}.`);
    }
  }
  if (acceptedDisplayMatch && visualResult?.cleanDecision?.reasoning) {
    evidenceNotes.push(visualResult.cleanDecision.reasoning);
  }
  if (rejectedModel) {
    evidenceNotes.push(`Forensic note: Source candidate "${rejectedModel}" was rejected during physical inspection.`);
  }

  // Vendor assignment
  const identifiedVendorId = vendorMatch?.vendorId || null;
  const identifiedVendorName = vendorMatch?.vendorName || null;
  const identifiedVendorVariantId = vendorMatch?.vendorVariantId || null;
  const identifiedVendorVariantName = vendorMatch?.vendorVariantName || null;
  const vendorConfidenceScore = vendorMatch?.confidenceScore ?? 0;

  if (vendorMatch?.evidenceNotes) {
    evidenceNotes.push(...vendorMatch.evidenceNotes);
  }

  // Check for contradiction or provider failure
  let hasContradiction = false;
  if (
    visualResult?.cleanDecision &&
    visualResult.cleanDecision.confidence < 0.5 &&
    visualResult.candidates.length > 0 &&
    acceptedDisplayMatch?.matchType !== "part_number"
  ) {
    hasContradiction = true;
    evidenceNotes.push("Visual search candidates conflict across multiple models.");
  }
  if (visualResult?.error) {
    hasContradiction = true;
    evidenceNotes.push(
      `Visual identification error: ${visualResult.error}. Escalated for review.`
    );
  } else if (acceptedDisplayMatch?.contradictionDetected) {
    hasContradiction = true;
    evidenceNotes.push(
      `Discrepancy detected: ${acceptedDisplayMatch.contradictionDetails || "Physical part number contradicted visual candidate."} Escalated for review.`
    );
  } else if (acceptedDisplayMatch && visualResult) {
    const visualModel = visualResult.normalizedModel;
    if (
      acceptedDisplayMatch.matchType === "part_number" &&
      visualModel &&
      !acceptedDisplayMatch.modelName.toLowerCase().includes(visualModel.toLowerCase()) &&
      !visualModel.toLowerCase().includes(acceptedDisplayMatch.modelName.toLowerCase())
    ) {
      hasContradiction = true;
      evidenceNotes.push(
        `Discrepancy detected: Physical part number indicates '${acceptedDisplayMatch.manufacturer} ${acceptedDisplayMatch.modelName}' while visual search suggested '${visualModel}'. Escalated for review.`
      );
    }
  }

  // Determine overall status
  let overallMatchStatus: UnifiedIdentificationResult["overallMatchStatus"] = "unknown";
  let itemStatus: UnifiedIdentificationResult["itemStatus"] = "review_required";

  const isModelConfident = Boolean(acceptedDisplayMatch && modelConfidenceScore >= 0.85);
  const isVendorConfident =
    vendorMatch.matchStatus === "exact_match" ||
    (vendorMatch.matchStatus === "strong_candidate" && identifiedVendorVariantId !== null);

  if (vendorMatch.matchStatus === "ambiguous" || hasContradiction) {
    overallMatchStatus = "ambiguous";
    itemStatus = "review_required";
  } else if (isModelConfident && isVendorConfident) {
    overallMatchStatus = "exact_match";
    itemStatus = "suggested_match";
  } else if (isModelConfident && vendorMatch.matchStatus !== "unknown") {
    overallMatchStatus = "strong_candidate";
    itemStatus = "suggested_match";
  } else if (isModelConfident || isVendorConfident) {
    overallMatchStatus = "possible_candidate";
    itemStatus = "review_required";
  } else if (modelConfidenceScore > 0.5 || vendorConfidenceScore > 0.5) {
    overallMatchStatus = "possible_candidate";
    itemStatus = "review_required";
  } else {
    overallMatchStatus = "unknown";
    itemStatus = "review_required";
  }

  const extractedTextSummary = [
    ...ocrOutput.vendor_markings,
    ...ocrOutput.detected_codes,
    ...ocrOutput.technology_markings,
  ]
    .filter(Boolean)
    .join(" | ");

  const matchedCodesSummary = [
    vendorMatch.matchedPattern ? `Pattern: ${vendorMatch.matchedPattern}` : "",
    ocrOutput.part_numbers.length > 0 ? `PN: ${ocrOutput.part_numbers.join(",")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    predictedManufacturer,
    predictedModel,
    predictedDisplayAssembly,
    catalogDisplayId,
    modelConfidenceScore,
    identifiedVendorId,
    identifiedVendorName,
    identifiedVendorVariantId,
    identifiedVendorVariantName,
    vendorConfidenceScore,
    overallMatchStatus,
    itemStatus,
    extractedTextSummary,
    matchedCodesSummary,
    evidenceNotes,
  };
}
