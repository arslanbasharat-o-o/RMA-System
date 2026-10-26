export interface VerifiedDisplayExample {
  itemId: string;
  catalogDisplayId: string | null;
  partNumbers: string[];
}

export interface VerifiedPartNumberConflict {
  partNumber: string;
  exampleCount: number;
  modelCount: number;
}

export const VERIFIED_VISUAL_MATCH_THRESHOLD = 0.93;
export const VISUAL_SUGGESTION_CONFIDENCE_THRESHOLD = 0.85;
// A review-only suggestion is not an automatic confirmation. Two independent
// references for the same device model carry enough evidence to surface a
// lower-confidence match for a human to check. With one reference, a residual
// unresolved alternative raises the bar instead of hiding the best candidate.
export const MULTI_REFERENCE_SUGGESTION_THRESHOLD = 0.8;
export const UNRESOLVED_SINGLE_REFERENCE_SUGGESTION_THRESHOLD = 0.9;
// Near-identical siblings such as iPhone XR and iPhone 11 can make generic
// image search prefer the wrong one. A decisive comparison against a single
// operator-verified reference may still be shown in review, but only above a
// stricter threshold and with concrete matching cues. This never auto-verifies
// an item.
export const DECISIVE_SINGLE_REFERENCE_CONFIDENCE_THRESHOLD = 0.97;
export const DECISIVE_SINGLE_REFERENCE_MATCHING_CUES = 3;

export function verifiedComparisonConflictsWithModel(
  initialModelKey: string | null,
  comparedModelKey: string | null
): boolean {
  return Boolean(initialModelKey && comparedModelKey && initialModelKey !== comparedModelKey);
}

export function shouldWithholdUnconfirmedVisualSuggestion(
  initialConfidence: number,
  comparisonWasApplied: boolean,
  comparisonConflicts: boolean
): boolean {
  return !comparisonWasApplied && (
    comparisonConflicts ||
    !Number.isFinite(initialConfidence) ||
    initialConfidence < VISUAL_SUGGESTION_CONFIDENCE_THRESHOLD
  );
}

export function shouldApplyVerifiedVisualComparison(
  selectedCatalogDisplayId: string | null,
  confidence: number,
  candidateCatalogIds: string[],
  evidence: {
    unresolvedAlternatives: string[];
    /** Distinct verified items for the selected device model, across SKUs. */
    supportingReferenceCount: number;
    searchCorroborated: boolean;
    matchingCueCount: number;
  }
): boolean {
  // Two independent verified references are stronger evidence than a residual
  // note about a model that the comparison already ruled out. A single
  // reference normally needs search agreement and a clean alternative list.
  // The exception is a decisive single-reference match: near-identical
  // siblings can make search prefer the wrong model, so a 0.97+ comparison
  // with several concrete cues and no unresolved alternative is still useful
  // enough to show the operator which model the verified reference supports.
  const decisiveSingleReference = evidence.supportingReferenceCount === 1 &&
    confidence >= DECISIVE_SINGLE_REFERENCE_CONFIDENCE_THRESHOLD &&
    evidence.matchingCueCount >= DECISIVE_SINGLE_REFERENCE_MATCHING_CUES &&
    evidence.unresolvedAlternatives.length === 0;
  const corroborated = evidence.supportingReferenceCount >= 2 ||
    (evidence.supportingReferenceCount >= 1 && evidence.searchCorroborated) ||
    decisiveSingleReference;
  const unresolvedBlocks = evidence.unresolvedAlternatives.length > 0 &&
    evidence.supportingReferenceCount < 2;
  return Boolean(
    selectedCatalogDisplayId &&
    !unresolvedBlocks &&
    corroborated &&
    candidateCatalogIds.includes(selectedCatalogDisplayId) &&
    Number.isFinite(confidence) &&
    confidence >= VERIFIED_VISUAL_MATCH_THRESHOLD
  );
}

/**
 * A selected model backed by a verified reference and several concrete cues is
 * still useful to the operator even when it is not strong enough to confirm
 * automatically. The item stays in review; this only decides what suggestion
 * to show instead of leaving the display unidentified.
 */
export function shouldShowUnconfirmedVerifiedSuggestion(
  selectedCatalogDisplayId: string | null,
  confidence: number,
  supportingReferenceCount: number,
  matchingCueCount: number,
  unresolvedAlternativeCount: number
): boolean {
  const requiredConfidence = supportingReferenceCount >= 2
    ? MULTI_REFERENCE_SUGGESTION_THRESHOLD
    : unresolvedAlternativeCount > 0
      ? UNRESOLVED_SINGLE_REFERENCE_SUGGESTION_THRESHOLD
      : VISUAL_SUGGESTION_CONFIDENCE_THRESHOLD;
  return Boolean(
    selectedCatalogDisplayId &&
    supportingReferenceCount >= 1 &&
    matchingCueCount >= 2 &&
    Number.isFinite(confidence) &&
    confidence >= requiredConfidence
  );
}

/** Normalize punctuation variants without guessing or fuzzy-matching codes. */
export function normalizePartNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isLearnablePartNumber(value: string): boolean {
  const normalized = normalizePartNumber(value);
  if (normalized.length < 6 || !/[A-Z]/.test(normalized) || !/\d/.test(normalized)) return false;
  if (/\b(?:REV|REVISION|QC|PASS|BATCH|LOT|DATE|WARRANTY)\b/i.test(value)) return false;
  // OCR often labels QC dates and production weeks as part numbers. They are
  // not stable identifiers for the device model and must not enter feedback.
  if (/^(?:20)?\d{2}W\d{1,2}$/.test(normalized)) return false;
  return true;
}

/**
 * Enrich catalog part-number indexes only from independent, manually verified
 * displays. A code needs two distinct verified items and must map to one model.
 * Conflicting codes are intentionally omitted, so they cannot break a tie.
 */
export function addVerifiedPartNumbersToCatalog<T extends {
  id: string;
  knownPartNumbers: string[];
}>(catalog: T[], examples: VerifiedDisplayExample[]): Array<T & {
  verifiedPartNumberSupport: Record<string, number>;
}> {
  const evidenceByCode = new Map<string, Map<string, Set<string>>>();

  for (const example of examples) {
    if (!example.catalogDisplayId) continue;
    for (const partNumber of example.partNumbers || []) {
      if (!isLearnablePartNumber(partNumber)) continue;
      const code = normalizePartNumber(partNumber);
      const items = evidenceByCode.get(code) || new Map<string, Set<string>>();
      const itemModels = items.get(example.itemId) || new Set<string>();
      itemModels.add(example.catalogDisplayId);
      items.set(example.itemId, itemModels);
      evidenceByCode.set(code, items);
    }
  }

  const mappings = new Map<string, Array<{ code: string; support: number }>>();
  for (const [code, items] of evidenceByCode) {
    const modelIds = new Set([...items.values()].flatMap((ids) => [...ids]));
    const support = items.size;
    if (support < 2 || modelIds.size !== 1) continue;
    const [modelId] = modelIds;
    const codes = mappings.get(modelId) || [];
    codes.push({ code, support });
    mappings.set(modelId, codes);
  }

  return catalog.map((display) => {
    const curatedCodes = new Set(display.knownPartNumbers.map(normalizePartNumber));
    const learned = (mappings.get(display.id) || [])
      .filter((entry) => !curatedCodes.has(entry.code));
    const supportByCode: Record<string, number> = {};
    for (const entry of learned) supportByCode[entry.code] = entry.support;
    return {
      ...display,
      knownPartNumbers: [
        ...display.knownPartNumbers,
        ...learned.map((entry) => entry.code),
      ],
      verifiedPartNumberSupport: supportByCode,
    };
  });
}

/** Report conflicting operator labels without resolving them by majority vote. */
export function findVerifiedPartNumberConflicts(
  partNumbers: string[],
  examples: VerifiedDisplayExample[]
): VerifiedPartNumberConflict[] {
  const requestedCodes = new Set(partNumbers.filter(isLearnablePartNumber).map(normalizePartNumber));
  const labelsByCode = new Map<string, Map<string, Set<string>>>();
  for (const example of examples) {
    if (!example.catalogDisplayId) continue;
    for (const partNumber of example.partNumbers || []) {
      const code = normalizePartNumber(partNumber);
      if (!requestedCodes.has(code)) continue;
      const items = labelsByCode.get(code) || new Map<string, Set<string>>();
      const itemModels = items.get(example.itemId) || new Set<string>();
      itemModels.add(example.catalogDisplayId);
      items.set(example.itemId, itemModels);
      labelsByCode.set(code, items);
    }
  }

  return [...labelsByCode.entries()].flatMap(([code, items]) => {
    const modelIds = new Set([...items.values()].flatMap((ids) => [...ids]));
    if (items.size < 2 || modelIds.size < 2) return [];
    return [{ partNumber: code, exampleCount: items.size, modelCount: modelIds.size }];
  });
}
