import { describe, expect, it, vi } from "vitest";
import type { VerifiedDisplayComparisonResult } from "@/lib/recognition/openai/vision";
import {
  matchSeededInventoryProduct,
  matchSeededProductByText,
  type SeededInventoryProduct,
  type SeededInventoryReference,
} from "@/lib/recognition/seeded-inventory";

const products: SeededInventoryProduct[] = [
  { id: "product-a", manufacturer: "Apple", modelName: "iPhone 16", variantName: "COF", printedTitle: "Liphone 16 COF", barcodeValue: "665386615240", barcodeFormat: "UPC-A digits", barcodeSymbology: "CODE128", supplierSku: null },
  { id: "product-b", manufacturer: "Apple", modelName: "iPhone 16", variantName: "Soft", printedTitle: "Liphone 16 Soft", barcodeValue: "665386615257", barcodeFormat: "UPC-A digits", barcodeSymbology: "CODE128", supplierSku: null },
  { id: "product-c", manufacturer: "Apple", modelName: "iPhone 15", variantName: "Soft", printedTitle: "Liphone 15 Soft", barcodeValue: "665386615455", barcodeFormat: "UPC-A digits", barcodeSymbology: "CODE128", supplierSku: null },
];

const references: SeededInventoryReference[] = products.map((product, index) => ({
  product,
  displayId: `DSP-00${index + 1}`,
  imageBuffer: Buffer.from(`reference-${index}`),
  imageType: "back",
}));

function comparison(overrides: Partial<VerifiedDisplayComparisonResult> = {}): VerifiedDisplayComparisonResult {
  return {
    selectedCatalogDisplayId: "product-a",
    confidence: 0.96,
    matchingCues: ["flex exits at the same edge", "connector pad pattern matches"],
    conflictingCues: [],
    unresolvedAlternatives: [],
    supportingReferenceItemIds: ["DSP-001"],
    model: "test-model",
    durationMs: 10,
    ...overrides,
  };
}

describe("seeded inventory product matching", () => {
  it("accepts a strong exact variant comparison and verifies it against sibling variants", async () => {
    const compareToVerifiedExamples = vi.fn()
      .mockResolvedValueOnce(comparison())
      .mockResolvedValueOnce(comparison());

    const match = await matchSeededInventoryProduct(
      { compareToVerifiedExamples },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      references
    );

    expect(match.status).toBe("accepted");
    expect(match.product?.barcodeValue).toBe("665386615240");
    expect(compareToVerifiedExamples).toHaveBeenCalledTimes(2);
    expect(compareToVerifiedExamples.mock.calls[0][3]).toEqual({ mode: "discovery", identityLevel: "product_variant" });
    const finalReferences = compareToVerifiedExamples.mock.calls[1][1] as Array<{ catalogDisplayId: string }>;
    expect(finalReferences.map((reference) => reference.catalogDisplayId)).toContain("product-b");
    expect(finalReferences.map((reference) => reference.catalogDisplayId)).not.toContain("product-c");
  });

  it("keeps a match ambiguous when a conflicting cue contradicts the candidate", async () => {
    const compareToVerifiedExamples = vi.fn()
      .mockResolvedValueOnce(comparison())
      .mockResolvedValueOnce(comparison({
        conflictingCues: [
          "DSP-001 has a different lower flex and taped contact assembly, unlike the uploaded display.",
        ],
      }));

    const match = await matchSeededInventoryProduct(
      { compareToVerifiedExamples },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      references
    );

    expect(match.status).toBe("ambiguous");
    expect(match.product).toBeNull();
  });

  it("does not disqualify a candidate when conflicting cues only explain why rejected alternatives were ruled out", async () => {
    const compareToVerifiedExamples = vi.fn()
      .mockResolvedValueOnce(comparison())
      .mockResolvedValueOnce(comparison({
        conflictingCues: [
          "DSP-002 has a different lower flex and taped contact assembly, unlike the uploaded display.",
        ],
      }));

    const match = await matchSeededInventoryProduct(
      { compareToVerifiedExamples },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      references
    );

    expect(match.status).toBe("accepted");
    expect(match.product?.id).toBe("product-a");
  });

  it("withholds UPC/SKU when a visually selected variant is ambiguous", async () => {
    const compareToVerifiedExamples = vi.fn()
      .mockResolvedValueOnce(comparison())
      .mockResolvedValueOnce(comparison({ confidence: 0.82, unresolvedAlternatives: ["Liphone 16 Soft"] }));

    const match = await matchSeededInventoryProduct(
      { compareToVerifiedExamples },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      references
    );

    expect(match.status).toBe("ambiguous");
    expect(match.product).toBeNull();
  });

  it("returns a miss when discovery abstains and an error when the provider fails", async () => {
    const miss = await matchSeededInventoryProduct(
      { compareToVerifiedExamples: vi.fn().mockResolvedValue(comparison({ selectedCatalogDisplayId: null, confidence: 0.2 })) },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      references
    );
    const providerError = await matchSeededInventoryProduct(
      { compareToVerifiedExamples: vi.fn().mockResolvedValue(comparison({ error: "provider offline", selectedCatalogDisplayId: null })) },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      references
    );

    expect(miss.status).toBe("miss");
    expect(providerError.status).toBe("error");
    expect(providerError.error).toBe("provider offline");
  });

  it("does not call the vision service when there are no catalog products", async () => {
    const compareToVerifiedExamples = vi.fn();
    const match = await matchSeededInventoryProduct(
      { compareToVerifiedExamples },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      []
    );

    expect(match.status).toBe("unavailable");
    expect(match.error).toContain("No active inventory references");
    expect(compareToVerifiedExamples).not.toHaveBeenCalled();
  });

  it("evaluates a single product catalog under sparse coverage policy and preserves provisional candidate for review", async () => {
    const compareToVerifiedExamples = vi.fn().mockResolvedValueOnce(comparison());
    const match = await matchSeededInventoryProduct(
      { compareToVerifiedExamples },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      references.slice(0, 1)
    );

    // Single-product catalog must NOT be declared unavailable or miss
    expect(match.status).not.toBe("unavailable");
    expect(match.status).not.toBe("miss");
    // Preserved as provisional candidate for review with capped confidence
    expect(match.product?.id).toBe("product-a");
    expect(match.confidence).toBeLessThanOrEqual(0.70);
    expect(compareToVerifiedExamples).toHaveBeenCalledTimes(1);
  });

  it("P2: verifies processor explicitly treats primary photos as back for seeded matcher", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const processorSource = await fs.readFile(
      path.resolve(process.cwd(), "src/lib/queue/processor.ts"),
      "utf8"
    );
    // Explicit primary -> back mapping
    expect(processorSource).toContain('image.imageType === "primary" ? "back" : image.imageType');
  });
});

describe("matchSeededProductByText", () => {
  const seedList: SeededInventoryProduct[] = [
    { id: "1", manufacturer: "Apple", modelName: "iPhone 16", variantName: "COF", printedTitle: "Liphone 16 COF", barcodeValue: "665386615240", barcodeFormat: null, barcodeSymbology: null, supplierSku: null },
    { id: "2", manufacturer: "Apple", modelName: "iPhone 16 Pro", variantName: "Hard", printedTitle: "Liphone 16 Pro Hard OLED", barcodeValue: "665871925243", barcodeFormat: null, barcodeSymbology: null, supplierSku: "SKU-16PRO-HD" },
    { id: "3", manufacturer: "Apple", modelName: "iPhone 16 Pro Max", variantName: "COF", printedTitle: "Liphone 16 Pro Max COF 120HZ", barcodeValue: "665871826212", barcodeFormat: null, barcodeSymbology: null, supplierSku: null },
    { id: "4", manufacturer: "Samsung", modelName: "Galaxy S24", variantName: "OLED", printedTitle: "Samsung S24 OLED", barcodeValue: "880609123456", barcodeFormat: null, barcodeSymbology: null, supplierSku: "SAM-S24" },
  ];

  it("resolves exact model name", () => {
    const match = matchSeededProductByText("iPhone 16 Pro", seedList);
    expect(match?.id).toBe("2");
    expect(match?.barcodeValue).toBe("665871925243");
  });

  it("resolves manufacturer prepended to model name", () => {
    const match = matchSeededProductByText("Apple iPhone 16 Pro", seedList);
    expect(match?.id).toBe("2");
    expect(match?.barcodeValue).toBe("665871925243");
  });

  it("prioritizes longest model match over substring", () => {
    const match = matchSeededProductByText("Apple iPhone 16 Pro Max Screen Assembly", seedList);
    expect(match?.id).toBe("3");
    expect(match?.barcodeValue).toBe("665871826212");
  });

  it("matches printedTitle directly", () => {
    const match = matchSeededProductByText("Liphone 16 Pro Hard OLED", seedList);
    expect(match?.id).toBe("2");
    expect(match?.supplierSku).toBe("SKU-16PRO-HD");
  });

  it("matches supplierSku directly", () => {
    const match = matchSeededProductByText("SAM-S24", seedList);
    expect(match?.id).toBe("4");
    expect(match?.barcodeValue).toBe("880609123456");
  });

  it("matches barcode value directly", () => {
    const match = matchSeededProductByText("665386615240", seedList);
    expect(match?.id).toBe("1");
    expect(match?.modelName).toBe("iPhone 16");
  });

  it("handles empty or null queries safely", () => {
    expect(matchSeededProductByText("", seedList)).toBeNull();
    expect(matchSeededProductByText(null, seedList)).toBeNull();
    expect(matchSeededProductByText(undefined, seedList)).toBeNull();
    expect(matchSeededProductByText("Nonexistent Device XYZ", seedList)).toBeNull();
  });
});

