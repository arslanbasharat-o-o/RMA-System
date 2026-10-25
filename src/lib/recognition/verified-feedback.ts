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

export function shouldApplyVerifiedVisualComparison(
  selectedCatalogDisplayId: string | null,
  confidence: number,
  candidateCatalogIds: string[]
): boolean {
  return Boolean(
    selectedCatalogDisplayId &&
    candidateCatalogIds.includes(selectedCatalogDisplayId) &&
    Number.isFinite(confidence) &&
    confidence >= VERIFIED_VISUAL_MATCH_THRESHOLD
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
