import { describe, it, expect, vi } from "vitest";
import { evaluateCleanerResponse, type CleanDisplayDecision } from "@/lib/recognition/lens/decision";
import { appleVisualEvidence } from "@/lib/recognition/lens/model-evidence";
import type { VisualCandidate } from "@/lib/recognition/lens/types";
import { synthesizeRecognition } from "@/lib/recognition/synthesizer";
import {
  matchSeededInventoryProduct,
  type SeededInventoryProduct,
  type SeededInventoryReference,
} from "@/lib/recognition/seeded-inventory";
import { processRmaItem } from "@/lib/queue/processor";

describe("Blocker 1: Explicitly rejected provisional model must not survive", () => {
  it("never contains suggestedModel alongside rejectedModel when upstream model is null and provisional candidate is rejected", () => {
    // Exact reproduction case:
    // - Upstream model: null
    // - Upstream suggestedModel: "iPhone 8 Plus"
    // - Cleaner model: "iPhone 8 Plus"
    // - Cleaner rejected: true
    const upstreamEvidence: CleanDisplayDecision = {
      manufacturer: "Apple",
      model: null,
      suggestedModel: "iPhone 8 Plus",
      confidence: 0.45,
      displayName: "Apple iPhone 8 Plus Display",
      cleanedCandidates: ["iPhone 8 Plus"],
      reasoning: "Heuristic web listing suggestion awaiting photo corroboration.",
    };

    const cleanerParsed = {
      manufacturer: "Apple",
      model: "iPhone 8 Plus",
      rejected: true,
      reasoning: "Photograph shows an iPhone with an all-screen notch display, rejecting iPhone 8 Plus home button LCD assembly.",
    };

    const decision = evaluateCleanerResponse(cleanerParsed, upstreamEvidence, []);

    // The result must NEVER contain suggestedModel: "iPhone 8 Plus" alongside rejectedModel: "iPhone 8 Plus"
    expect(decision.rejectedModel).toBe("iPhone 8 Plus");
    expect(decision.suggestedModel).toBeNull();
    expect(decision.model).toBeNull();
    expect(decision.decisionStatus).toBe("rejected");
  });

  it("proposes an alternative model cleanly when cleaner rejects provisional candidate and proposes replacement", () => {
    const upstreamEvidence: CleanDisplayDecision = {
      manufacturer: "Apple",
      model: null,
      suggestedModel: "iPhone 8 Plus",
      confidence: 0.45,
      displayName: "Apple iPhone 8 Plus Display",
      cleanedCandidates: ["iPhone 8 Plus"],
      reasoning: "Heuristic web listing suggestion.",
    };

    const cleanerParsed = {
      manufacturer: "Apple",
      model: "iPhone 7 Plus",
      rejected: true,
      reasoning: "Flex cable routing and bracket layout match iPhone 7 Plus, definitely not an iPhone 8 Plus.",
    };

    const decision = evaluateCleanerResponse(cleanerParsed, upstreamEvidence, []);

    expect(decision.rejectedModel).toBe("iPhone 8 Plus");
    expect(decision.suggestedModel).toBe("iPhone 7 Plus");
    expect(decision.model).toBeNull();
    expect(decision.decisionStatus).toBe("rejected");
    expect(decision.displayName).toBe("Apple iPhone 7 Plus Display");
  });

  it("handles cleaner abstention safely without preserving invalid models", () => {
    const upstreamEvidence: CleanDisplayDecision = {
      manufacturer: "Apple",
      model: null,
      suggestedModel: "iPhone 8 Plus",
      confidence: 0.45,
      displayName: "Apple iPhone 8 Plus Display",
      cleanedCandidates: ["iPhone 8 Plus"],
      reasoning: "Heuristic web listing suggestion.",
    };

    const cleanerParsed = {
      manufacturer: "Apple",
      model: null,
      rejected: false,
      reasoning: "Image resolution is too low to inspect connector pins.",
    };

    const decision = evaluateCleanerResponse(cleanerParsed, upstreamEvidence, []);

    expect(decision.model).toBeNull();
    expect(decision.suggestedModel).toBeNull();
    expect(decision.rejectedModel).toBeNull();
    expect(decision.decisionStatus).toBe("abstained");
  });

  it("downstream synthesizer does NOT resurrect rejected provisional model via catalog fallback", () => {
    const rejectedVisualResult = {
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: null,
        rejectedModel: "iPhone 8 Plus",
        decisionStatus: "rejected" as const,
        displayName: "Unidentified Display",
        confidence: 0.20,
        reasoning: "Cleaner rejected iPhone 8 Plus.",
      },
      normalizedManufacturer: "Apple",
      normalizedModel: "iPhone 8 Plus", // stale upstream normalized
      detectedDisplayAssembly: "Apple iPhone 8 Plus Display",
      candidates: [],
    };

    const emptyVendor = {
      vendorId: null,
      vendorName: null,
      vendorVariantId: null,
      vendorVariantName: null,
      confidenceScore: 0,
      matchedRule: null,
      evidenceNotes: [],
    };

    const emptyOcr = {
      raw_text: [],
      detected_codes: [],
      part_numbers: [],
      vendor_markings: [],
      technology_markings: [],
      possible_vendor_aliases: [],
      unreadable_regions: [],
      extraction_notes: [],
    };

    const synthesized = synthesizeRecognition(null, emptyVendor as any, emptyOcr as any, rejectedVisualResult as any);

    expect(synthesized.predictedModel).toBeNull();
    expect(synthesized.predictedDisplayAssembly).not.toContain("iPhone 8 Plus");
    expect(synthesized.evidenceNotes.some((n) => n.includes('Source candidate "iPhone 8 Plus" was rejected'))).toBe(true);
  });
});

describe("Blocker 2: False independent Google Lens consensus from duplicated sources", () => {
  it("does not treat three identical iPhone 13 listings from the same domain as independent votes over legitimate iPhone 8 Plus", () => {
    // 3 listings from the SAME domain (e.g. ebay.com), plus 1 legitimate listing for iPhone 8 Plus from another domain (ifixit.com)
    const candidates: VisualCandidate[] = [
      {
        title: "Apple iPhone 13 Screen Replacement OLED Display",
        sourceUrl: "https://www.ebay.com/itm/111111",
        sourceName: "eBay",
        rank: 1,
      },
      {
        title: "Apple iPhone 13 Screen Replacement OLED Display",
        sourceUrl: "https://www.ebay.com/itm/222222",
        sourceName: "eBay",
        rank: 2,
      },
      {
        title: "Apple iPhone 13 Screen Replacement OLED Display",
        sourceUrl: "https://www.ebay.com/itm/333333",
        sourceName: "eBay",
        rank: 3,
      },
      {
        title: "iPhone 8 Plus LCD Screen and Digitizer Full Assembly",
        sourceUrl: "https://www.ifixit.com/Store/iPhone/iPhone-8-Plus-Screen",
        sourceName: "iFixit",
        rank: 4,
      },
    ];

    const result = appleVisualEvidence(candidates);
    expect(result).not.toBeNull();
    // One duplicated domain (eBay) must NOT become three independent votes!
    // Since modern (eBay) has 1 source and legacy (iFixit) has 1 source:
    // 1) iPhone 8 Plus must NOT be invalidated as an "unrelated/irrelevant" listing
    // 2) Modern consensus must NOT be declared
    // 3) Result must be flagged as conflicting / review required, NOT confident iPhone 13 suggestion
    expect(result?.reasoning).toContain("conflicting");
    expect(result?.model).toBeNull();
    expect(result?.confidence).toBeLessThanOrEqual(0.50);
  });

  it("does not treat multi-model and compatibility listings as clean single-model corroboration", () => {
    const candidates: VisualCandidate[] = [
      {
        title: "For iPhone 8 Plus / iPhone 13 Screen Replacement LCD OLED",
        sourceUrl: "https://www.amazon.com/dp/B001",
        sourceName: "Amazon",
        rank: 1,
      },
      {
        title: "Screen Compatible with iPhone 13, 14, 15 Pro Max",
        sourceUrl: "https://www.ebay.com/itm/444444",
        sourceName: "eBay",
        rank: 2,
      },
      {
        title: "iPhone 8 Plus Replacement Display Touch Assembly",
        sourceUrl: "https://www.repairs.com/ip8plus",
        sourceName: "Repairs",
        rank: 3,
      },
    ];

    const result = appleVisualEvidence(candidates);
    expect(result).not.toBeNull();
    // Multi-model listings must not be counted as clean iPhone 13 consensus
    expect(result?.model).toBeNull();
  });
});

describe("Blocker 3: Unrestricted inventory test override prevention", () => {
  it("rejects or blocks test override activation when NODE_ENV is production", async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      // Simulate production environment
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      // Passing mock inventory match in production options must either be ignored or throw an error
      // It must NOT bypass real matching!
      const dummyItemId = "00000000-0000-0000-0000-000000000000";
      const call = () => (processRmaItem as any)(dummyItemId, {
        mockInventoryMatch: {
          status: "matched",
          product: { id: "fake-prod-id", modelName: "Fake" },
          confidence: 0.99,
          matchingCues: ["fake"],
          conflictingCues: [],
          unresolvedAlternatives: [],
        },
      });

      // In production, supplying arbitrary inventory match mock must fail or be rejected
      await expect(call()).rejects.toThrow(/test|production|unauthorized|disabled|invalid/i);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    }
  });
});

describe("Blocker 6: Single-product inventory coverage", () => {
  it("does not declare unavailable or miss when catalog contains a single real product", async () => {
    const singleProduct: SeededInventoryProduct = {
      id: "product-single",
      manufacturer: "Apple",
      modelName: "iPhone 13",
      variantName: "OLED",
      printedTitle: "Apple iPhone 13 OLED",
      barcodeValue: "665386615240",
      barcodeFormat: "UPC-A digits",
      barcodeSymbology: "CODE128",
      supplierSku: "SKU-IP13",
    };

    const singleRef: SeededInventoryReference = {
      product: singleProduct,
      displayId: "DSP-001",
      imageBuffer: Buffer.from("reference-1"),
      imageType: "back",
    };

    const compareToVerifiedExamples = vi.fn().mockResolvedValue({
      selectedCatalogDisplayId: "product-single",
      confidence: 0.88,
      matchingCues: ["flex exits at the same edge", "connector pad pattern matches"],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceItemIds: ["DSP-001"],
      model: "test-model",
      durationMs: 10,
    });

    const match = await matchSeededInventoryProduct(
      { compareToVerifiedExamples },
      [{ imageBuffer: Buffer.from("target"), imageType: "back" }],
      [singleRef]
    );

    // Single product catalog must NOT be declared unavailable or a miss!
    expect(match.status).not.toBe("unavailable");
    expect(match.status).not.toBe("miss");
    // It should preserve the provisional candidate for review
    expect(match.product?.id).toBe("product-single");
  });
});
