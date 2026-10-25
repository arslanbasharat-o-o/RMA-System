import { describe, expect, it } from "vitest";
import { applyVisualCatalogConsensus, visualCandidateCatalogIds } from "@/lib/queue/processor";
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

const samsungVariantCatalog = [
  ...samsungCatalog,
  {
    id: "samsung-s21-ultra-soft",
    manufacturer: "Samsung",
    modelName: "Samsung Galaxy S21 Ultra",
    normalizedModelIdentifier: "samsung-galaxy-s21-ultra-soft",
    aliases: ["Galaxy S21 Ultra", "S21 Ultra"],
    internalSku: "S21U-SOFT",
    knownPartNumbers: [],
    displayTechnology: "Soft OLED",
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

  it("keeps competing models available for verified comparison when the visual result abstains", () => {
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

    expect(visualCandidateCatalogIds(result, iphone16Catalog)).toEqual([
      "iphone-16-pro-max",
      "iphone-16-pro",
    ]);
  });

  it("includes lower-ranked catalog models in the bounded shortlist for an uncertain image", () => {
    const models = [
      { id: "iphone-x", modelName: "iPhone X" },
      { id: "iphone-12-pro-max", modelName: "iPhone 12 Pro Max" },
      { id: "iphone-14-pro-max", modelName: "iPhone 14 Pro Max" },
      { id: "iphone-11", modelName: "iPhone 11" },
      { id: "iphone-13-pro-max", modelName: "iPhone 13 Pro Max" },
      { id: "iphone-xr", modelName: "iPhone XR" },
    ];
    const modelCatalog = models.map(({ id, modelName }) => ({
      id,
      manufacturer: "Apple",
      modelName,
      normalizedModelIdentifier: id,
      aliases: [],
      internalSku: null,
      knownPartNumbers: [],
      displayTechnology: "OLED",
    }));
    const candidates = [
      ...Array.from({ length: 4 }, (_, index) => ({
        title: "Apple iPhone X OLED display assembly",
        sourceUrl: `https://seller${index + 1}.com/iphone-x/${index + 1}`,
        rank: index + 1,
      })),
      { title: "Apple iPhone 12 Pro Max OLED display", sourceUrl: "https://shop-one.com/12pm", rank: 5 },
      { title: "Apple iPhone 12 Pro Max display assembly", sourceUrl: "https://shop-two.com/12pm", rank: 6 },
      { title: "Apple iPhone 14 Pro Max display assembly", sourceUrl: "https://shop-three.com/14pm", rank: 7 },
      { title: "Apple iPhone 11 display assembly", sourceUrl: "https://shop-four.com/11", rank: 8 },
      { title: "Apple iPhone 13 Pro Max screen assembly", sourceUrl: "https://shop-five.com/13pm", rank: 9 },
      { title: "Apple iPhone XR OLED display assembly", sourceUrl: "https://shop-six.com/xr", rank: 10 },
    ];
    const result = visualResult({
      candidates,
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: "iPhone X",
        displayName: "Unidentified Apple Display",
        confidence: 0.45,
        cleanedCandidates: [],
        reasoning: "The image-based decision is uncertain.",
      },
    });

    expect(visualCandidateCatalogIds(result, modelCatalog)).toEqual(models.map(({ id }) => id));
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

  it("votes by device model when several catalog rows describe the same model", () => {
    const result = visualResult({
      candidates: Array.from({ length: 4 }, (_, index) => ({
        title: "Samsung Galaxy S21 Ultra OLED display assembly",
        sourceUrl: `https://seller${index + 1}.com/item/${index + 1}`,
        rank: index + 1,
      })),
    });

    expect(visualCandidateCatalogIds(result, samsungVariantCatalog)).toEqual(["samsung-s21-ultra"]);
  });

  it("keeps a publisher vote for each model and returns one shortlist entry per model", () => {
    const result = visualResult({
      candidates: [
        { title: "Samsung Galaxy S21 Ultra display assembly", sourceUrl: "https://ifixit.com/ultra", rank: 1 },
        { title: "Samsung Galaxy S21 OLED display", sourceUrl: "https://ifixit.com/standard", rank: 2 },
        { title: "Samsung Galaxy S21 Ultra replacement screen", sourceUrl: "https://parts-two.com/ultra", rank: 3 },
        { title: "Samsung Galaxy S21 display assembly", sourceUrl: "https://parts-three.com/standard", rank: 4 },
        { title: "Samsung Galaxy S21 Ultra OLED screen", sourceUrl: "https://parts-four.com/ultra", rank: 5 },
        { title: "Samsung Galaxy S21 touch display", sourceUrl: "https://parts-five.com/standard", rank: 6 },
      ],
    });

    expect(visualCandidateCatalogIds(result, samsungVariantCatalog)).toEqual([
      "samsung-s21-ultra",
      "samsung-s21",
    ]);
  });

  it("uses decisive catalog voting for a generic catalog model without upgrading a photo conflict", () => {
    const candidates = Array.from({ length: 4 }, (_, index) => ({
      title: "Samsung Galaxy S21 Ultra OLED display assembly",
      sourceUrl: `https://seller${index + 1}.com/item/${index + 1}`,
      rank: index + 1,
    }));
    const undecided = visualResult({
      candidates,
      cleanDecision: {
        manufacturer: "Samsung",
        model: null,
        suggestedModel: "Galaxy S21",
        displayName: "Unidentified Samsung Display",
        confidence: 0.45,
        cleanedCandidates: [],
        reasoning: "Visual listings were ambiguous.",
      },
    });
    const photoConflict = visualResult({
      ...undecided,
      cleanDecision: {
        ...undecided.cleanDecision!,
        reasoning: "The photograph did not corroborate the suggested model.",
      },
    });

    const consensus = applyVisualCatalogConsensus(undecided, samsungVariantCatalog);
    expect(consensus.cleanDecision?.model).toBe("Galaxy S21 Ultra");
    expect(consensus.cleanDecision?.confidence).toBe(0.84);
    expect(applyVisualCatalogConsensus(photoConflict, samsungVariantCatalog)).toBe(photoConflict);
  });

  it("abstains when decisive catalog votes conflict with a confident visual decision", () => {
    const result = visualResult({
      candidates: Array.from({ length: 4 }, (_, index) => ({
        title: "Samsung Galaxy S21 Ultra OLED display assembly",
        sourceUrl: `https://seller${index + 1}.com/item/${index + 1}`,
        rank: index + 1,
      })),
      cleanDecision: {
        manufacturer: "Samsung",
        model: "Galaxy S21",
        displayName: "Samsung Galaxy S21 Display",
        confidence: 0.95,
        cleanedCandidates: [],
        reasoning: "The uploaded photo corroborates the model.",
      },
    });

    const consensus = applyVisualCatalogConsensus(result, samsungVariantCatalog);
    expect(consensus.cleanDecision?.model).toBeNull();
    expect(consensus.cleanDecision?.suggestedModel).toBe("Galaxy S21 Ultra");
    expect(consensus.cleanDecision?.confidence).toBe(0.45);
    expect(consensus.cleanDecision?.reasoning).toContain("signals conflict");
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
