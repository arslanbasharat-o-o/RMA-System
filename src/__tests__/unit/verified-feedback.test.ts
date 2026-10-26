import { describe, expect, it } from "vitest";
import { matchDisplayToCatalog } from "@/lib/recognition/synthesizer";
import {
  addVerifiedPartNumbersToCatalog,
  findVerifiedPartNumberConflicts,
  normalizePartNumber,
  shouldApplyVerifiedVisualComparison,
  shouldShowUnconfirmedVerifiedSuggestion,
  shouldWithholdUnconfirmedVisualSuggestion,
  verifiedComparisonConflictsWithModel,
  type VerifiedDisplayExample,
} from "@/lib/recognition/verified-feedback";
import type { VisualIdentificationResult } from "@/lib/recognition/lens/types";

const catalog = [
  {
    id: "iphone-13-pro",
    manufacturer: "Apple",
    modelName: "iPhone 13 Pro",
    normalizedModelIdentifier: "apple-iphone-13-pro",
    aliases: ["iPhone13Pro"],
    internalSku: null,
    knownPartNumbers: [],
    displayTechnology: "OLED",
  },
  {
    id: "iphone-13",
    manufacturer: "Apple",
    modelName: "iPhone 13",
    normalizedModelIdentifier: "apple-iphone-13",
    aliases: ["iPhone13"],
    internalSku: null,
    knownPartNumbers: [],
    displayTechnology: "OLED",
  },
];

const visual: VisualIdentificationResult = {
  provider: "mock",
  candidates: [],
  durationMs: 0,
  rawResponse: {},
};

describe("verified display feedback", () => {
  it("learns an exact part number only after two independent verified examples", () => {
    const oneExample: VerifiedDisplayExample[] = [
      { itemId: "item-1", catalogDisplayId: "iphone-13-pro", partNumbers: ["821-03200-A"] },
    ];
    expect(addVerifiedPartNumbersToCatalog(catalog, oneExample)[0].knownPartNumbers).toEqual([]);

    const examples = [
      ...oneExample,
      { itemId: "item-2", catalogDisplayId: "iphone-13-pro", partNumbers: ["821 03200 A"] },
    ];
    const enriched = addVerifiedPartNumbersToCatalog(catalog, examples);
    const match = matchDisplayToCatalog(visual, enriched, ["821/03200/A"]);

    expect(normalizePartNumber("821/03200/A")).toBe("82103200A");
    expect(match?.catalogId).toBe("iphone-13-pro");
    expect(match?.matchType).toBe("part_number");
    expect(match?.confidenceScore).toBe(0.91);
    expect(match?.verifiedExampleCount).toBe(2);
  });

  it("does not learn or majority-vote a code verified against different models", () => {
    const examples: VerifiedDisplayExample[] = [
      { itemId: "item-1", catalogDisplayId: "iphone-13-pro", partNumbers: ["821-03200-A"] },
      { itemId: "item-2", catalogDisplayId: "iphone-13", partNumbers: ["821-03200-A"] },
      { itemId: "item-3", catalogDisplayId: "iphone-13-pro", partNumbers: ["821-03200-A"] },
    ];

    const enriched = addVerifiedPartNumbersToCatalog(catalog, examples);
    expect(enriched.every((display) => display.knownPartNumbers.length === 0)).toBe(true);
    expect(matchDisplayToCatalog(visual, enriched, ["821-03200-A"])).toBeNull();
    expect(findVerifiedPartNumberConflicts(["821-03200-A"], examples)).toEqual([
      { partNumber: "82103200A", exampleCount: 3, modelCount: 2 },
    ]);
  });

  it("ignores QC week codes and codes without both letters and digits", () => {
    const examples: VerifiedDisplayExample[] = [
      { itemId: "item-1", catalogDisplayId: "iphone-13-pro", partNumbers: ["2024-W12", "INCELL", "821-03200-A REV 2.1"] },
      { itemId: "item-2", catalogDisplayId: "iphone-13-pro", partNumbers: ["2024-W12", "INCELL", "821-03200-A REV 2.1"] },
    ];
    expect(addVerifiedPartNumbersToCatalog(catalog, examples)[0].knownPartNumbers).toEqual([]);
  });

  it("applies visual-example results only above the strict threshold and for supplied candidates", () => {
    const evidence = { unresolvedAlternatives: [], supportingReferenceCount: 2, searchCorroborated: false, matchingCueCount: 1 };
    expect(shouldApplyVerifiedVisualComparison("iphone-13-pro", 0.93, ["iphone-13-pro", "iphone-13"], evidence)).toBe(true);
    expect(shouldApplyVerifiedVisualComparison("iphone-13-pro", 0.92, ["iphone-13-pro", "iphone-13"], evidence)).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("unknown", 0.99, ["iphone-13-pro", "iphone-13"], evidence)).toBe(false);
    expect(shouldApplyVerifiedVisualComparison(null, 0.99, ["iphone-13-pro", "iphone-13"], evidence)).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-13", 0.99, ["iphone-13"], { ...evidence, unresolvedAlternatives: ["unrepresented lookalike"] })).toBe(true);
    expect(shouldApplyVerifiedVisualComparison("iphone-13", 0.92, ["iphone-13"], { ...evidence, unresolvedAlternatives: ["unrepresented lookalike"] })).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-13", 0.99, ["iphone-13"], { ...evidence, supportingReferenceCount: 1 })).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-13", 0.99, ["iphone-13"], { ...evidence, supportingReferenceCount: 1, unresolvedAlternatives: ["unrepresented lookalike"] })).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-13", 0.99, ["iphone-13"], { ...evidence, supportingReferenceCount: 1, searchCorroborated: true })).toBe(true);
    expect(shouldApplyVerifiedVisualComparison("iphone-13", 0.99, ["iphone-13"], { ...evidence, supportingReferenceCount: 1, searchCorroborated: true, unresolvedAlternatives: ["unrepresented lookalike"] })).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-13", 0.99, ["iphone-13"], { ...evidence, supportingReferenceCount: 0, searchCorroborated: true })).toBe(false);
  });

  it("shows a decisive single-reference comparison in review without weakening the standard rule", () => {
    const decisive = {
      unresolvedAlternatives: [],
      supportingReferenceCount: 1,
      searchCorroborated: false,
      matchingCueCount: 4,
    };
    expect(shouldApplyVerifiedVisualComparison("iphone-xr", 0.98, ["iphone-xr", "iphone-11"], decisive)).toBe(true);
    expect(shouldApplyVerifiedVisualComparison("iphone-xr", 0.96, ["iphone-xr", "iphone-11"], decisive)).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-xr", 0.98, ["iphone-xr", "iphone-11"], { ...decisive, matchingCueCount: 2 })).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-xr", 0.98, ["iphone-xr", "iphone-11"], { ...decisive, unresolvedAlternatives: ["iPhone 11"] })).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-xr", 0.98, ["iphone-xr", "iphone-11"], { ...decisive, supportingReferenceCount: 0 })).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("iphone-xr", 0.98, ["iphone-11"], decisive)).toBe(false);
  });

  it("shows an unconfirmed verified suggestion instead of leaving the display unidentified", () => {
    expect(shouldShowUnconfirmedVerifiedSuggestion("iphone-xr", 0.98, 1, 4, 0)).toBe(true);
    expect(shouldShowUnconfirmedVerifiedSuggestion("iphone-xr", 0.86, 2, 2, 0)).toBe(true);
    expect(shouldShowUnconfirmedVerifiedSuggestion("iphone-xr", 0.84, 2, 4, 0)).toBe(true);
    expect(shouldShowUnconfirmedVerifiedSuggestion("iphone-xr", 0.79, 2, 4, 0)).toBe(false);
    expect(shouldShowUnconfirmedVerifiedSuggestion("iphone-xr", 0.98, 0, 4, 0)).toBe(false);
    expect(shouldShowUnconfirmedVerifiedSuggestion("iphone-xr", 0.98, 1, 1, 0)).toBe(false);
    expect(shouldShowUnconfirmedVerifiedSuggestion("iphone-xr", 0.89, 1, 4, 1)).toBe(false);
    expect(shouldShowUnconfirmedVerifiedSuggestion("iphone-xr", 0.9, 1, 4, 1)).toBe(true);
    expect(shouldShowUnconfirmedVerifiedSuggestion(null, 0.98, 2, 4, 0)).toBe(false);
  });

  it("withholds a weak or conflicting model suggestion when verified comparison cannot confirm it", () => {
    expect(verifiedComparisonConflictsWithModel("apple\u0000iphone 12 pro max", "apple\u0000iphone 13 pro max")).toBe(true);
    expect(verifiedComparisonConflictsWithModel("apple\u0000iphone 13 pro max", "apple\u0000iphone 13 pro max")).toBe(false);
    expect(shouldWithholdUnconfirmedVisualSuggestion(0.45, false, true)).toBe(true);
    expect(shouldWithholdUnconfirmedVisualSuggestion(0.45, false, false)).toBe(true);
    expect(shouldWithholdUnconfirmedVisualSuggestion(0.95, false, true)).toBe(true);
    expect(shouldWithholdUnconfirmedVisualSuggestion(0.45, true, true)).toBe(false);
    expect(shouldWithholdUnconfirmedVisualSuggestion(0.95, false, false)).toBe(false);
  });
});
