import { describe, expect, it, vi } from "vitest";
import type { VerifiedDisplayComparisonResult } from "@/lib/recognition/openai/vision";
import {
  matchSeededInventoryProduct,
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

  it("does not call the vision service when there are too few catalog products", async () => {
    const compareToVerifiedExamples = vi.fn();
    const match = await matchSeededInventoryProduct(
      { compareToVerifiedExamples },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      references.slice(0, 1)
    );

    expect(match.status).toBe("miss");
    expect(compareToVerifiedExamples).not.toHaveBeenCalled();
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
