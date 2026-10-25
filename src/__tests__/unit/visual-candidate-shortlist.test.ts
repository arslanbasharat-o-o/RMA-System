import { describe, expect, it } from "vitest";
import { visualCandidateCatalogIds } from "@/lib/queue/processor";
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
  {
    id: "iphone-14",
    manufacturer: "Apple",
    modelName: "iPhone 14",
    normalizedModelIdentifier: "apple-iphone-14",
    aliases: ["iPhone14"],
    internalSku: null,
    knownPartNumbers: [],
    displayTechnology: "OLED",
  },
];

const iphone16Catalog = [
  {
    id: "iphone-16-pro-max",
    manufacturer: "Apple",
    modelName: "iPhone 16 Pro Max",
    normalizedModelIdentifier: "apple-iphone-16-pro-max",
    aliases: ["iPhone16ProMax"],
    internalSku: null,
    knownPartNumbers: [],
    displayTechnology: "OLED",
  },
  {
    id: "iphone-16-pro",
    manufacturer: "Apple",
    modelName: "iPhone 16 Pro",
    normalizedModelIdentifier: "apple-iphone-16-pro",
    aliases: ["iPhone16Pro"],
    internalSku: null,
    knownPartNumbers: [],
    displayTechnology: "OLED",
  },
];

const samsungCatalog = [
  {
    id: "samsung-s21-ultra",
    manufacturer: "Samsung",
    modelName: "Galaxy S21 Ultra",
    normalizedModelIdentifier: "samsung-galaxy-s21-ultra",
    aliases: ["Galaxy S21 Ultra", "S21 Ultra"],
    internalSku: null,
    knownPartNumbers: [],
    displayTechnology: "OLED",
  },
  {
    id: "samsung-s21",
    manufacturer: "Samsung",
    modelName: "Galaxy S21",
    normalizedModelIdentifier: "samsung-galaxy-s21",
    aliases: ["Galaxy S21", "S21"],
    internalSku: null,
    knownPartNumbers: [],
    displayTechnology: "OLED",
  },
];

function visualResult(overrides: Partial<VisualIdentificationResult> = {}): VisualIdentificationResult {
  return {
    provider: "test",
    candidates: [],
    durationMs: 0,
    rawResponse: {},
    ...overrides,
  };
}

describe("visual candidate catalog shortlist", () => {
  it("returns only the catalog ID for a decisive voted model, ignoring lower-ranked conflicts", () => {
    const result = visualResult({
      cleanDecision: {
        manufacturer: "Apple",
        model: "iPhone 13 Pro",
        displayName: "Apple iPhone 13 Pro Display",
        confidence: 0.95,
        cleanedCandidates: [],
        reasoning: "Independent listing vote and photo corroboration agree.",
      },
      candidates: [
        { title: "Apple iPhone 13 OLED Display", rank: 1 },
        { title: "Apple iPhone 14 OLED Display", rank: 2 },
      ],
    });

    expect(visualCandidateCatalogIds(result, catalog)).toEqual(["iphone-13-pro"]);
  });

  it("abstains if a decisive visual winner conflicts with the preferred catalog match", () => {
    const result = visualResult({
      cleanDecision: {
        manufacturer: "Apple",
        model: "iPhone 13 Pro",
        displayName: "Apple iPhone 13 Pro Display",
        confidence: 0.95,
        cleanedCandidates: [],
        reasoning: "Independent listing vote and photo corroboration agree.",
      },
    });

    expect(visualCandidateCatalogIds(result, catalog, "iphone-13")).toEqual([]);
  });

  it("keeps the existing bounded alternatives for an inconclusive vote", () => {
    const result = visualResult({
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: "iPhone 13 Pro",
        displayName: "Unidentified Apple Display",
        confidence: 0.45,
        cleanedCandidates: [],
        reasoning: "Search sources disagree.",
      },
      candidates: [
        { title: "Apple iPhone 13 Pro OLED Display", rank: 1 },
        { title: "Apple iPhone 13 OLED Display", rank: 2 },
        { title: "Apple iPhone 14 OLED Display", rank: 3 },
      ],
    });

    expect(visualCandidateCatalogIds(result, catalog)).toEqual([
      "iphone-13-pro",
      "iphone-13",
      "iphone-14",
    ]);
  });

  it("returns one catalog ID when independent listing votes clearly favor a model", () => {
    const candidates = [
      ...Array.from({ length: 10 }, (_, index) => ({
        title: "Apple iPhone 16 Pro Max OLED Display Assembly",
        sourceUrl: `https://seller${index + 1}.com/item/${index + 1}`,
        rank: index + 1,
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        title: "Apple iPhone 16 Pro OLED Display Assembly",
        sourceUrl: `https://shop${index + 1}.com/item/${index + 1}`,
        rank: index + 11,
      })),
    ];
    const result = visualResult({
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: "iPhone 16 Pro Max",
        displayName: "Unidentified Apple Display",
        confidence: 0.45,
        cleanedCandidates: [],
        reasoning: "The cleaner found a competing variant.",
      },
      candidates,
    });

    expect(visualCandidateCatalogIds(result, iphone16Catalog)).toEqual(["iphone-16-pro-max"]);
  });

  it("uses the same catalog-based voting for non-Apple manufacturers", () => {
    const result = visualResult({
      candidates: Array.from({ length: 4 }, (_, index) => ({
        title: "Samsung Galaxy S21 Ultra OLED display assembly",
        sourceUrl: `https://seller${index + 1}.com/item/${index + 1}`,
        rank: index + 1,
      })),
    });

    expect(visualCandidateCatalogIds(result, samsungCatalog)).toEqual(["samsung-s21-ultra"]);
  });

  it("abstains when one search listing mentions unrelated catalog models", () => {
    const result = visualResult({
      candidates: Array.from({ length: 4 }, (_, index) => ({
        title: "Apple iPhone 16 Pro Max and Samsung Galaxy S21 Ultra OLED display assembly",
        sourceUrl: `https://seller${index + 1}.com/item/${index + 1}`,
        rank: index + 1,
      })),
    });

    expect(visualCandidateCatalogIds(result, [...iphone16Catalog, ...samsungCatalog])).toEqual([]);
  });

  it("keeps competing catalog IDs for comparison when one seller repeats a listing", () => {
    const candidates = [
      ...Array.from({ length: 10 }, (_, index) => ({
        title: "Apple iPhone 16 Pro Max OLED Display Assembly",
        sourceUrl: `https://oneseller.com/item/${index + 1}`,
        rank: index + 1,
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        title: "Apple iPhone 16 Pro OLED Display Assembly",
        sourceUrl: `https://shop${index + 1}.com/item/${index + 1}`,
        rank: index + 11,
      })),
    ];
    const result = visualResult({
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: "iPhone 16 Pro Max",
        displayName: "Unidentified Apple Display",
        confidence: 0.45,
        cleanedCandidates: [],
        reasoning: "The cleaner found a competing variant.",
      },
      candidates,
    });

    expect(visualCandidateCatalogIds(result, iphone16Catalog)).toEqual([
      "iphone-16-pro",
      "iphone-16-pro-max",
    ]);
  });
});
