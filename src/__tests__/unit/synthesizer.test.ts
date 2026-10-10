import { describe, it, expect } from "vitest";
import {
  matchDisplayToCatalog,
  synthesizeRecognition,
} from "@/lib/recognition/synthesizer";
import { VisualIdentificationResult } from "@/lib/recognition/lens/types";
import { VendorMatchResult } from "@/lib/recognition/rules/types";
import { OcrStructuredOutput } from "@/lib/recognition/openai/types";

describe("Unified Synthesizer", () => {
  const catalog = [
    {
      id: "cat-13p",
      manufacturer: "Apple",
      modelName: "iPhone 13 Pro",
      normalizedModelIdentifier: "apple-iphone-13-pro",
      aliases: ["iPhone13Pro", "13 Pro", "A2638"],
      internalSku: "DISP-IP13P-OLED",
      knownPartNumbers: ["821-03200-A"],
      displayTechnology: "OLED",
    },
    {
      id: "cat-a15",
      manufacturer: "Samsung",
      modelName: "Galaxy A15",
      normalizedModelIdentifier: "samsung-galaxy-a15",
      aliases: ["GalaxyA15", "A15", "SM-A155F"],
      internalSku: "DISP-SAM-A15",
      knownPartNumbers: ["GH82-33451A"],
      displayTechnology: "Super AMOLED",
    },
  ];

  it("should prioritize exact part-number match over visual candidate", () => {
    const visualResult: VisualIdentificationResult = {
      provider: "mock",
      candidates: [{ title: "Apple iPhone 12 Screen", rank: 1 }],
      durationMs: 50,
      rawResponse: {},
    };

    // OCR extracted part number "821-03200-A" belonging to iPhone 13 Pro
    const match = matchDisplayToCatalog(visualResult, catalog, ["821-03200-A"]);
    expect(match).not.toBeNull();
    expect(match?.modelName).toBe("iPhone 13 Pro");
    expect(match?.matchType).toBe("part_number");
  });

  it("should match by alias when part number is absent", () => {
    const visualResult: VisualIdentificationResult = {
      provider: "mock",
      candidates: [{ title: "Samsung Galaxy A15 5G Replacement Panel", rank: 1 }],
      durationMs: 50,
      rawResponse: {},
    };

    const match = matchDisplayToCatalog(visualResult, catalog, []);
    expect(match).not.toBeNull();
    expect(match?.modelName).toBe("Galaxy A15");
    expect(match?.matchType).toBe("alias");
  });

  it("does not match a numeric alias without the matching manufacturer", () => {
    const visualResult: VisualIdentificationResult = {
      provider: "mock",
      candidates: [{ title: "Samsung Galaxy Note 12 replacement screen", rank: 1 }],
      durationMs: 10,
      rawResponse: {},
    };
    const catalogWithGenericAlias = [
      { ...catalog[0], aliases: ["12"] },
      catalog[1],
    ];

    expect(matchDisplayToCatalog(visualResult, catalogWithGenericAlias, [])).toBeNull();
  });

  it("does not collapse Pro Max or Ultra models into their base families", () => {
    const visualResult: VisualIdentificationResult = {
      provider: "mock",
      candidates: [{ title: "Apple iPhone 13 Pro Max and Galaxy S23 Ultra display", rank: 1 }],
      durationMs: 10,
      rawResponse: {},
    };
    const catalogWithAliases = [
      { ...catalog[0], aliases: ["iPhone 13 Pro", "13 Pro"] },
      { ...catalog[1], modelName: "Galaxy S23", manufacturer: "Samsung", aliases: ["Galaxy S23", "S23"] },
    ];

    expect(matchDisplayToCatalog(visualResult, catalogWithAliases, [])).toBeNull();
  });

  it("should synthesize exact match when both model and vendor are verified", () => {
    const displayMatch = {
      catalogId: "cat-13p",
      manufacturer: "Apple",
      modelName: "iPhone 13 Pro",
      normalizedIdentifier: "apple-iphone-13-pro",
      displayTechnology: "OLED",
      internalSku: "DISP-IP13P",
      confidenceScore: 0.95,
      matchType: "exact" as const,
    };

    const vendorMatch: VendorMatchResult = {
      vendorId: "v-ami",
      vendorName: "AMI",
      vendorVariantId: "va-ami-a",
      vendorVariantName: "AMI/A",
      matchedRuleId: "r1",
      matchedPattern: "AMI/A",
      confidenceScore: 1.0,
      matchStatus: "exact_match",
      evidenceNotes: ["Verified ink stamp"],
      candidateAlternatives: [],
    };

    const ocr: OcrStructuredOutput = {
      raw_text: ["AMI/A"],
      detected_codes: ["AMI/A"],
      part_numbers: ["821-03200-A"],
      vendor_markings: ["AMI/A"],
      technology_markings: ["OLED"],
      possible_vendor_aliases: [],
      unreadable_regions: [],
      extraction_notes: [],
    };

    const unified = synthesizeRecognition(displayMatch, vendorMatch, ocr);
    expect(unified.overallMatchStatus).toBe("exact_match");
    expect(unified.itemStatus).toBe("suggested_match");
    expect(unified.predictedModel).toBe("iPhone 13 Pro");
    expect(unified.identifiedVendorName).toBe("AMI");
    expect(unified.identifiedVendorVariantName).toBe("AMI/A");
  });

  it("should escalate discrepancy when Google Lens contradicts physical part number (Section 10)", () => {
    // Visual candidate claims Google Pixel 7
    const visualResult: VisualIdentificationResult = {
      provider: "mock",
      candidates: [{ title: "Google Pixel 7 LCD Screen Replacement", rank: 1 }],
      durationMs: 50,
      rawResponse: {},
    };

    // But part number matches Apple iPhone 13 Pro
    const displayMatch = matchDisplayToCatalog(visualResult, catalog, ["821-03200-A"]);
    expect(displayMatch).not.toBeNull();
    expect(displayMatch?.matchType).toBe("part_number");
    expect(displayMatch?.contradictionDetected).toBe(true);
    expect(displayMatch?.confidenceScore).toBeLessThan(0.8);

    const vendorMatch: VendorMatchResult = {
      vendorId: "v-ami",
      vendorName: "AMI",
      vendorVariantId: "va-ami-a",
      vendorVariantName: "AMI/A",
      matchedRuleId: "r1",
      matchedPattern: "AMI/A",
      confidenceScore: 1.0,
      matchStatus: "exact_match",
      evidenceNotes: [],
      candidateAlternatives: [],
    };

    const ocr: OcrStructuredOutput = {
      raw_text: ["AMI/A"],
      detected_codes: ["AMI/A"],
      part_numbers: ["821-03200-A"],
      vendor_markings: ["AMI/A"],
      technology_markings: [],
      possible_vendor_aliases: [],
      unreadable_regions: [],
      extraction_notes: [],
    };

    const unified = synthesizeRecognition(displayMatch, vendorMatch, ocr);
    // Discrepancy between part number and visual candidate MUST trigger human review
    expect(unified.itemStatus).toBe("review_required");
    expect(unified.overallMatchStatus).toBe("ambiguous");
    expect(unified.evidenceNotes.some((n) => n.toLowerCase().includes("discrepancy detected"))).toBe(true);
  });

  it("should force review_required when display match is missing even if vendor matched", () => {
    const vendorMatch: VendorMatchResult = {
      vendorId: "v-ami",
      vendorName: "AMI",
      vendorVariantId: null,
      vendorVariantName: null,
      matchedRuleId: "r5",
      matchedPattern: "AMI",
      confidenceScore: 0.9,
      matchStatus: "exact_match",
      evidenceNotes: [],
      candidateAlternatives: [],
    };

    const ocr: OcrStructuredOutput = {
      raw_text: ["AMI"],
      detected_codes: [],
      part_numbers: [],
      vendor_markings: ["AMI"],
      technology_markings: [],
      possible_vendor_aliases: [],
      unreadable_regions: [],
      extraction_notes: [],
    };

    const unified = synthesizeRecognition(null, vendorMatch, ocr);
    expect(unified.itemStatus).toBe("review_required");
    expect(unified.predictedModel).toBeNull();
  });

  it("should match catalog items whose modelName includes the manufacturer prefix", () => {
    const catalogWithPrefix = [
      {
        id: "cat-op5t",
        manufacturer: "OnePlus",
        modelName: "One Plus 5T",
        normalizedModelIdentifier: "oneplus-one-plus-5t",
        aliases: ["One Plus 5T", "OnePlus 5T"],
        internalSku: "DISP-OP-5T",
        knownPartNumbers: [],
        displayTechnology: "AMOLED",
      },
      {
        id: "cat-s9p",
        manufacturer: "Samsung",
        modelName: "Samsung Galaxy S9 Plus",
        normalizedModelIdentifier: "samsung-galaxy-s9-plus",
        aliases: ["Galaxy S9 Plus", "S9 Plus"],
        internalSku: "DISP-SAM-S9P",
        knownPartNumbers: [],
        displayTechnology: "Super AMOLED",
      },
    ];

    const opVisual: VisualIdentificationResult = {
      provider: "mock",
      candidates: [{ title: "LCD Assembly For One Plus 5T Without Frame", rank: 1 }],
      cleanDecision: {
        manufacturer: "OnePlus",
        model: "OnePlus 5T",
        displayName: "OnePlus 5T Display",
        confidence: 0.9,
        cleanedCandidates: ["OnePlus 5T"],
        reasoning: "Matched OnePlus 5T",
      },
      durationMs: 20,
      rawResponse: {},
    };

    const opMatch = matchDisplayToCatalog(opVisual, catalogWithPrefix, []);
    expect(opMatch).not.toBeNull();
    expect(opMatch?.catalogId).toBe("cat-op5t");
    expect(opMatch?.matchType).toBe("exact");

    const samVisual: VisualIdentificationResult = {
      provider: "mock",
      candidates: [{ title: "Samsung Galaxy S9 Plus AMOLED Display Assembly", rank: 1 }],
      cleanDecision: {
        manufacturer: "Samsung",
        model: "Galaxy S9 Plus",
        displayName: "Samsung Galaxy S9 Plus Display",
        confidence: 0.9,
        cleanedCandidates: ["Samsung Galaxy S9 Plus"],
        reasoning: "Matched Galaxy S9 Plus",
      },
      durationMs: 20,
      rawResponse: {},
    };

    const samMatch = matchDisplayToCatalog(samVisual, catalogWithPrefix, []);
    expect(samMatch).not.toBeNull();
    expect(samMatch?.catalogId).toBe("cat-s9p");
    expect(samMatch?.matchType).toBe("exact");
  });
});

