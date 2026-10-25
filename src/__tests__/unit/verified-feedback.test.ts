import { describe, expect, it } from "vitest";
import { matchDisplayToCatalog } from "@/lib/recognition/synthesizer";
import {
  addVerifiedPartNumbersToCatalog,
  findVerifiedPartNumberConflicts,
  normalizePartNumber,
  shouldApplyVerifiedVisualComparison,
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
    expect(shouldApplyVerifiedVisualComparison("iphone-13-pro", 0.93, ["iphone-13-pro", "iphone-13"])).toBe(true);
    expect(shouldApplyVerifiedVisualComparison("iphone-13-pro", 0.92, ["iphone-13-pro", "iphone-13"])).toBe(false);
    expect(shouldApplyVerifiedVisualComparison("unknown", 0.99, ["iphone-13-pro", "iphone-13"])).toBe(false);
    expect(shouldApplyVerifiedVisualComparison(null, 0.99, ["iphone-13-pro", "iphone-13"])).toBe(false);
  });
});
