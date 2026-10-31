import { describe, it, expect } from "vitest";
import { appleVisualEvidence } from "@/lib/recognition/lens/model-evidence";
import type { VisualCandidate } from "@/lib/recognition/lens/types";
import {
  isModelSupportedByEvidence,
  modelsMatchExactly,
  evaluateCleanerResponse,
  type CleanDisplayDecision,
} from "@/lib/recognition/lens/decision";

describe("DEF-01 & DEF-02: Google Lens Candidate Filtering & Anti-Selection Bias", () => {
  it("preserves genuine retail phone titles for iPhone 13 and does not drop them as irrelevant", () => {
    // 5 clean retail listings for iPhone 13 without the word 'screen' or 'replacement'
    const retailCandidates: VisualCandidate[] = [
      {
        title: "Apple iPhone 13, 128GB, Midnight - Unlocked (Renewed)",
        sourceUrl: "https://amazon.com/dp/B09V3HMZ8S",
        sourceName: "Amazon",
        rank: 1,
      },
      {
        title: "Apple iPhone 13 (128GB) - Starlight",
        sourceUrl: "https://flipkart.com/apple-iphone-13",
        sourceName: "Flipkart",
        rank: 2,
      },
      {
        title: "Apple iPhone 13 128GB Green Verizon Excellent Condition",
        sourceUrl: "https://ebay.com/itm/123456789",
        sourceName: "eBay",
        rank: 3,
      },
      {
        title: "iPhone 13 128GB Blue - Refurbished",
        sourceUrl: "https://backmarket.com/iphone-13",
        sourceName: "BackMarket",
        rank: 4,
      },
    ];

    const result = appleVisualEvidence(retailCandidates);
    expect(result).not.toBeNull();
    // iPhone 13 evidence should be recognized rather than being discarded as irrelevant
    expect(result?.suggestedModel || result?.model).toBe("iPhone 13");
  });

  it("prevents single-survivor bias: a lone spurious replacement screen listing cannot beat consensus retail listings", () => {
    const mixedCandidates: VisualCandidate[] = [
      {
        title: "Apple iPhone 13, 128GB, Midnight - Unlocked (Renewed)",
        sourceUrl: "https://amazon.com/dp/B09V3HMZ8S",
        sourceName: "Amazon",
        rank: 1,
      },
      {
        title: "Apple iPhone 13 (128GB) - Starlight",
        sourceUrl: "https://flipkart.com/apple-iphone-13",
        sourceName: "Flipkart",
        rank: 2,
      },
      {
        title: "Apple iPhone 13 128GB Green Verizon Excellent Condition",
        sourceUrl: "https://ebay.com/itm/123456789",
        sourceName: "eBay",
        rank: 3,
      },
      {
        title: "Apple iPhone 13 256GB Pink AT&T Clean IMEI",
        sourceUrl: "https://swappa.com/listing/iphone-13",
        sourceName: "Swappa",
        rank: 4,
      },
      // Lone spurious replacement listing for an old legacy device
      {
        title: "iPhone 8 Plus Screen Replacement LCD Touch Digitizer Assembly",
        sourceUrl: "https://aliexpress.com/item/8888.html",
        sourceName: "AliExpress",
        rank: 5,
      },
    ];

    const result = appleVisualEvidence(mixedCandidates);
    expect(result).not.toBeNull();
    // The consensus iPhone 13 listings must prevail over the single iPhone 8 Plus listing
    expect(result?.model).not.toBe("iPhone 8 Plus");
    expect(result?.suggestedModel).not.toBe("iPhone 8 Plus");
    expect(result?.suggestedModel || result?.model).toBe("iPhone 13");
  });

  it("never awards high confidence (>= 0.90) when only a single candidate survives", () => {
    const singleSurvivor: VisualCandidate[] = [
      {
        title: "iPhone 8 Plus Screen Replacement Black",
        sourceUrl: "https://ebay.com/itm/single-item",
        sourceName: "eBay",
        rank: 1,
      },
    ];

    const result = appleVisualEvidence(singleSurvivor);
    if (result) {
      // Must require operator review and not claim definitive model
      expect(result.model).toBeNull();
      expect(result.confidence).toBeLessThanOrEqual(0.50);
    }
  });
});

describe("DEF-04: Exact Model Identity & Anti-Substring Corroboration", () => {
  it("distinguishes iPhone 13 Pro from iPhone 13 Pro Max without substring false-positives", () => {
    expect(modelsMatchExactly("iPhone 13 Pro", "iPhone 13 Pro Max")).toBe(false);
    expect(modelsMatchExactly("iPhone 13 Pro Max", "iPhone 13 Pro")).toBe(false);
    expect(modelsMatchExactly("iPhone 13", "iPhone 13 Pro")).toBe(false);
    expect(modelsMatchExactly("iPhone 13", "iPhone 13 mini")).toBe(false);
    expect(modelsMatchExactly("iPhone 13 mini", "iPhone 13")).toBe(false);
  });

  it("normalizes harmless casing and manufacturer prefixes for exact matches", () => {
    expect(modelsMatchExactly("Apple iPhone 13 Pro", "iPhone 13 Pro")).toBe(true);
    expect(modelsMatchExactly("iphone 13 pro", "iPhone 13 Pro")).toBe(true);
    expect(modelsMatchExactly("iPhone 13 Pro", "IPHONE 13 PRO")).toBe(true);
  });

  it("distinguishes Samsung and other model families accurately", () => {
    expect(modelsMatchExactly("Galaxy S22", "Galaxy S22 Ultra")).toBe(false);
    expect(modelsMatchExactly("Galaxy S22+", "Galaxy S22 Ultra")).toBe(false);
    expect(modelsMatchExactly("Galaxy Note 20", "Galaxy Note 20 Ultra")).toBe(false);
    expect(modelsMatchExactly("Samsung Galaxy S23", "Galaxy S23")).toBe(true);
  });

  it("isModelSupportedByEvidence does NOT consider iPhone 13 Pro Max listing as evidence for iPhone 13 Pro", () => {
    const candidates: VisualCandidate[] = [
      {
        title: "OEM Apple iPhone 13 Pro Max Screen Display Assembly",
        sourceUrl: "https://ebay.com/itm/1",
        rank: 1,
      },
    ];

    // Candidate is strictly 13 Pro Max. If checking 13 Pro, it must return false!
    const supported = isModelSupportedByEvidence("Apple", "iPhone 13 Pro", candidates);
    expect(supported).toBe(false);
  });

  it("isModelSupportedByEvidence does NOT consider iPhone 13 mini listing as evidence for iPhone 13", () => {
    const candidates: VisualCandidate[] = [
      {
        title: "Apple iPhone 13 mini 128GB Blue",
        sourceUrl: "https://ebay.com/itm/2",
        rank: 1,
      },
    ];

    const supported = isModelSupportedByEvidence("Apple", "iPhone 13", candidates);
    expect(supported).toBe(false);
  });
});

import { synthesizeRecognition } from "@/lib/recognition/synthesizer";
import type { VisualIdentificationResult } from "@/lib/recognition/lens/types";
import type { VendorMatchResult } from "@/lib/recognition/rules/types";
import type { OcrStructuredOutput } from "@/lib/recognition/openai/types";

const emptyVendorMatch: VendorMatchResult = {
  vendorId: null,
  vendorName: null,
  vendorVariantId: null,
  vendorVariantName: null,
  matchedRuleId: null,
  matchedPattern: null,
  confidenceScore: 0,
  matchStatus: "unknown",
  evidenceNotes: [],
  candidateAlternatives: [],
};

const emptyOcrOutput: OcrStructuredOutput = {
  raw_text: [],
  detected_codes: [],
  part_numbers: [],
  vendor_markings: [],
  technology_markings: [],
  possible_vendor_aliases: [],
  unreadable_regions: [],
  extraction_notes: [],
};

describe("DEF-03: Cleaner Rejection & Safe Fallback Semantics", () => {
  it("synthesizer does NOT promote a cleaner-rejected model into predictedModel", () => {
    const rejectedVisualResult: VisualIdentificationResult = {
      detectedDisplayAssembly: "Apple iPhone 8 Plus Display",
      normalizedManufacturer: "Apple",
      normalizedModel: "iPhone 8 Plus",
      provider: "lens",
      candidates: [],
      durationMs: 10,
      rawResponse: {},
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: null, // Safe fallback: rejected candidate is null!
        rejectedModel: "iPhone 8 Plus",
        decisionStatus: "rejected",
        displayName: "Unidentified Display",
        confidence: 0.20,
        cleanedCandidates: [],
        reasoning: "Photograph shows tall 19.5:9 display with notch; rejected iPhone 8 Plus.",
      },
    };

    const unified = synthesizeRecognition(null, emptyVendorMatch, emptyOcrOutput, rejectedVisualResult);
    // Predicted model MUST be null, not iPhone 8 Plus!
    expect(unified.predictedModel).toBeNull();
    expect(unified.itemStatus).toBe("review_required");
  });

  it("synthesizer adopts provisional suggestions only when decisionStatus is not rejected", () => {
    const provisionalVisualResult: VisualIdentificationResult = {
      detectedDisplayAssembly: "Apple iPhone 13 Display",
      normalizedManufacturer: "Apple",
      normalizedModel: "iPhone 13",
      provider: "lens",
      candidates: [],
      durationMs: 10,
      rawResponse: {},
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: "iPhone 13",
        decisionStatus: "provisional",
        displayName: "Apple iPhone 13 Display",
        confidence: 0.45,
        cleanedCandidates: ["iPhone 13"],
        reasoning: "Visual search listings support iPhone 13; operator review suggested.",
      },
    };

    const unified = synthesizeRecognition(null, emptyVendorMatch, emptyOcrOutput, provisionalVisualResult);
    expect(unified.predictedModel).toBe("iPhone 13");
    expect(unified.itemStatus).toBe("review_required");
    expect(unified.overallMatchStatus).toBe("unknown");
  });
});

describe("DEF-05: Separation of Hardware Model Identification from Warehouse Inventory", () => {
  it("an identified phone model without a warehouse catalog match does NOT fabricate SKU or barcode", () => {
    const visualResult: VisualIdentificationResult = {
      detectedDisplayAssembly: "Apple iPhone 13 (OLED)",
      normalizedManufacturer: "Apple",
      normalizedModel: "iPhone 13",
      provider: "lens",
      candidates: [],
      durationMs: 10,
      rawResponse: {},
      cleanDecision: {
        manufacturer: "Apple",
        model: "iPhone 13",
        displayName: "Apple iPhone 13 (OLED)",
        confidence: 0.85,
        cleanedCandidates: [],
        reasoning: "Clean OLED screen identification.",
      },
    };

    // No catalogDisplayMatch (outside display)
    const unified = synthesizeRecognition(null, emptyVendorMatch, emptyOcrOutput, visualResult);
    expect(unified.predictedModel).toBe("iPhone 13");
    expect(unified.catalogDisplayId).toBeNull();
    expect(unified.identifiedVendorId).toBeNull();
    expect(unified.identifiedVendorName).toBeNull();
  });
});

import { deriveInventoryMatchStatus } from "@/lib/recognition/seeded-inventory";
import type { CatalogDisplayMatch } from "@/lib/recognition/synthesizer";

describe("Mandate 2: Flex-Code & Legacy Guards (821- prefix safety)", () => {
  it("does NOT invalidate a legitimate legacy device (iPhone 8 Plus) when an Apple 821- flex code is present", () => {
    // Apple iPhone 8 Plus screen with genuine Apple 821-01050-A flex cable marking
    const candidates: VisualCandidate[] = [
      {
        title: "Apple iPhone 8 Plus Screen Replacement LCD Digitizer Assembly",
        sourceUrl: "https://ebay.com/itm/iphone-8-plus-screen",
        rank: 1,
      },
      {
        title: "iPhone 8 Plus LCD Screen and Digitizer Full Assembly Black",
        sourceUrl: "https://mobilesentrix.com/iphone-8-plus",
        rank: 2,
      },
      {
        title: "iPhone 8 Plus Display Screen Replacement OEM",
        sourceUrl: "https://injuredgadgets.com/iphone-8-plus",
        rank: 3,
      },
    ];

    // OCR contains an Apple 821- flex cable part number (common across iPhone 6/7/8)
    const ocrHints = ["821-01050-A", "APPLE", "FLEX-CBL"];
    const result = appleVisualEvidence(candidates, undefined, ocrHints);

    expect(result).not.toBeNull();
    // The 821- prefix must NOT invalidate iPhone 8 Plus!
    expect(result?.model || result?.suggestedModel).toBe("iPhone 8 Plus");
  });

  it("does NOT invalidate legacy models from arbitrary lot stamps like 413022 or M308", () => {
    const candidates: VisualCandidate[] = [
      {
        title: "Apple iPhone 8 LCD Display Assembly White",
        sourceUrl: "https://ebay.com/itm/iphone-8-screen",
        rank: 1,
      },
    ];

    const ocrHints = ["413022", "M308", "QC PASS"];
    const result = appleVisualEvidence(candidates, undefined, ocrHints);

    expect(result).not.toBeNull();
    expect(result?.model || result?.suggestedModel).toBe("iPhone 8");
  });

  it("DOES invalidate legacy LCD when affirmative OLED markers or modern consensus are present", () => {
    const candidates: VisualCandidate[] = [
      {
        title: "Apple iPhone 8 Plus Screen Replacement",
        sourceUrl: "https://ebay.com/itm/iphone-8-plus",
        rank: 1,
      },
    ];

    // Affirmative OLED physical cue
    const ocrHints = ["HARD OLED", "FLEX 2.1"];
    const result = appleVisualEvidence(candidates, undefined, ocrHints);

    // Because iPhone 8 Plus is LCD, the OLED marking invalidates it!
    expect(result?.model).not.toBe("iPhone 8 Plus");
    expect(result?.suggestedModel).not.toBe("iPhone 8 Plus");
  });
});

describe("Mandate 3: Rejected-Model, Abstention & Provider Error Semantics", () => {
  it("treats model: null without explicit rejection as an abstention, not a rejection", () => {
    const abstainedVisualResult: VisualIdentificationResult = {
      detectedDisplayAssembly: "Unidentified Display",
      normalizedManufacturer: "Apple",
      normalizedModel: "iPhone 13",
      provider: "lens",
      candidates: [],
      durationMs: 10,
      rawResponse: {},
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: null,
        rejectedModel: null, // NOT rejected!
        decisionStatus: "abstained",
        displayName: "Unidentified Display",
        confidence: 0.35,
        cleanedCandidates: [],
        reasoning: "Visual AI abstained from identification; photo angle was inconclusive.",
      },
    };

    const unified = synthesizeRecognition(null, emptyVendorMatch, emptyOcrOutput, abstainedVisualResult);
    expect(unified.predictedModel).toBeNull();
    expect(unified.itemStatus).toBe("review_required");
    // Rejected model forensic note should NOT be present because it was an abstention
    expect(unified.evidenceNotes.some((n) => n.includes("was rejected during physical inspection"))).toBe(false);
  });

  it("provider errors do not count as model rejection or positive evidence", () => {
    const errorVisualResult: VisualIdentificationResult = {
      detectedDisplayAssembly: "Unidentified Display",
      normalizedManufacturer: "Apple",
      normalizedModel: "iPhone 13",
      provider: "lens",
      candidates: [],
      durationMs: 10,
      rawResponse: {},
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: null,
        rejectedModel: null,
        decisionStatus: "provider_error",
        displayName: "Unidentified Display",
        confidence: 0.35,
        cleanedCandidates: [],
        reasoning: "Photo corroboration was unavailable due to a provider error.",
      },
    };

    const unified = synthesizeRecognition(null, emptyVendorMatch, emptyOcrOutput, errorVisualResult);
    expect(unified.predictedModel).toBeNull();
    expect(unified.itemStatus).toBe("review_required");
    expect(unified.evidenceNotes.some((n) => n.includes("was rejected during physical inspection"))).toBe(false);
  });

  it("preserves explicitly rejected candidates in forensic evidence without promoting them", () => {
    const rejectedVisualResult: VisualIdentificationResult = {
      detectedDisplayAssembly: "Unidentified Display",
      normalizedManufacturer: "Apple",
      normalizedModel: "iPhone 8 Plus",
      provider: "lens",
      candidates: [],
      durationMs: 10,
      rawResponse: {},
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: null,
        rejectedModel: "iPhone 8 Plus",
        decisionStatus: "rejected",
        displayName: "Unidentified Display",
        confidence: 0.20,
        cleanedCandidates: [],
        reasoning: "Screen has modern notch and OLED panel; rejected iPhone 8 Plus candidate.",
      },
    };

    const unified = synthesizeRecognition(null, emptyVendorMatch, emptyOcrOutput, rejectedVisualResult);
    expect(unified.predictedModel).toBeNull();
    // Forensic evidence note MUST be present for operator audit!
    expect(unified.evidenceNotes.some((n) => n.includes('Source candidate "iPhone 8 Plus" was rejected'))).toBe(true);
  });

  it("accepts an independently verified model (part_number) when a weaker provider has provider_error or abstains", () => {
    const errorVisualResult: VisualIdentificationResult = {
      detectedDisplayAssembly: "Unidentified Display",
      normalizedManufacturer: "Apple",
      normalizedModel: undefined,
      provider: "lens",
      candidates: [],
      durationMs: 10,
      rawResponse: {},
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: null,
        decisionStatus: "provider_error",
        displayName: "Unidentified Display",
        confidence: 0.35,
        cleanedCandidates: [],
        reasoning: "Visual provider timeout.",
      },
    };

    // Authoritative hardware catalog part-number match
    const verifiedCatalogMatch: CatalogDisplayMatch = {
      catalogId: "cat-13-pro",
      manufacturer: "Apple",
      modelName: "iPhone 13 Pro",
      normalizedIdentifier: "apple iphone 13 pro",
      confidenceScore: 0.95,
      matchType: "part_number",
      matchedPartNumber: "821-03200-A",
      verifiedExampleCount: 3,
    };

    const unified = synthesizeRecognition(verifiedCatalogMatch, emptyVendorMatch, emptyOcrOutput, errorVisualResult);
    // The independently verified model is accepted despite provider error on visual search!
    expect(unified.predictedModel).toBe("iPhone 13 Pro");
    expect(unified.catalogDisplayId).toBe("cat-13-pro");
    expect(unified.modelConfidenceScore).toBe(0.95);
  });
});

describe("Mandates 1 & 4: Inventory Match State Machine & Warehouse Associations", () => {
  it("derives exact inventory match status based on explicit lifecycle states", () => {
    // 1. Not evaluated
    expect(deriveInventoryMatchStatus({ status: "pending_upload" })).toBe("not_evaluated");
    expect(deriveInventoryMatchStatus({ status: "uploaded" })).toBe("not_evaluated");

    // 2. Processing
    expect(deriveInventoryMatchStatus({ status: "processing" })).toBe("processing");
    expect(deriveInventoryMatchStatus({ status: "queued" })).toBe("processing");

    // 3. Matched (with valid product ID and clean evidence)
    expect(
      deriveInventoryMatchStatus({
        status: "suggested_match",
        inventoryMatchStatus: "matched",
        seededDisplayProductId: "prod-123",
        inventoryMatchEvidence: { conflictingCues: [] },
      })
    ).toBe("matched");

    // 4. Review required (conflicting cues or unresolved alternatives)
    expect(
      deriveInventoryMatchStatus({
        status: "review_required",
        seededDisplayProductId: "prod-123",
        inventoryMatchEvidence: { conflictingCues: ["Flex connector differs from warehouse sample"] },
      })
    ).toBe("review_required");

    // 5. No verified match (completed without inventory link)
    expect(
      deriveInventoryMatchStatus({
        status: "suggested_match",
        inventoryMatchStatus: "no_verified_match",
        seededDisplayProductId: null,
      })
    ).toBe("no_verified_match");

    // 6. Error
    expect(
      deriveInventoryMatchStatus({
        status: "failed",
        inventoryMatchStatus: "error",
      })
    ).toBe("error");
  });

  it("does NOT classify unlinked displays as external unless established by evaluation", () => {
    // Newly uploaded item awaiting evaluation
    const pendingItem = {
      status: "uploaded",
      seededDisplayProductId: null,
      inventoryMatchStatus: "not_evaluated",
    };
    expect(deriveInventoryMatchStatus(pendingItem)).toBe("not_evaluated");
  });

  it("BLOCKER 2: strictly validates all invalid and contradictory inventory states", () => {
    // 1. Invalid status string must be caught and routed to review_required
    expect(
      deriveInventoryMatchStatus({
        status: "suggested_match",
        inventoryMatchStatus: "corrupt_value",
      })
    ).toBe("review_required");

    // 2. 'matched' without a product ID is contradictory -> review_required
    expect(
      deriveInventoryMatchStatus({
        status: "suggested_match",
        inventoryMatchStatus: "matched",
        seededDisplayProductId: null,
      })
    ).toBe("review_required");

    // 3. 'no_verified_match' WITH a linked product ID is contradictory -> review_required
    expect(
      deriveInventoryMatchStatus({
        status: "suggested_match",
        inventoryMatchStatus: "no_verified_match",
        seededDisplayProductId: "prod-999",
      })
    ).toBe("review_required");

    // 4. General RMA status 'verified' without inventory evaluation must NOT infer 'no_verified_match'
    expect(
      deriveInventoryMatchStatus({
        status: "verified",
        seededDisplayProductId: null,
      })
    ).toBe("not_evaluated");

    // 5. General RMA status 'suggested_match' without inventory evaluation must NOT infer 'no_verified_match'
    expect(
      deriveInventoryMatchStatus({
        status: "suggested_match",
        seededDisplayProductId: null,
      })
    ).toBe("not_evaluated");

    // 6. Persisted 'matched' with conflicting evidence is demoted to 'review_required'
    expect(
      deriveInventoryMatchStatus({
        status: "suggested_match",
        inventoryMatchStatus: "matched",
        seededDisplayProductId: "prod-100",
        inventoryMatchEvidence: {
          conflictingCues: ["IC chip serial does not match reference"],
        },
      })
    ).toBe("review_required");
  });
});

describe("BLOCKER 4: Multi-Candidate Consensus & Outlier Resistance", () => {
  it("preserves legitimate legacy iPhone 8 Plus when 1 rogue modern iPhone 13 listing is present", () => {
    // 5 iPhone 8 Plus listings across independent sources + 1 rogue iPhone 13 listing
    const candidates: VisualCandidate[] = [
      { title: "OEM Apple iPhone 8 Plus LCD Screen Replacement Black", sourceUrl: "https://ifixit.com/item/1", sourceName: "iFixit", rank: 1 },
      { title: "iPhone 8 Plus Touch Screen Digitizer Assembly Genuine", sourceUrl: "https://ebay.com/item/2", sourceName: "eBay", rank: 2 },
      { title: "Apple iPhone 8 Plus White Display Assembly", sourceUrl: "https://mobilesentrix.com/item/3", sourceName: "MobileSentrix", rank: 3 },
      { title: "Replacement Screen for iPhone 8 Plus Premium Quality", sourceUrl: "https://injuredgadgets.com/item/4", sourceName: "InjuredGadgets", rank: 4 },
      { title: "iPhone 8 Plus LCD and Digitizer Full Assembly", sourceUrl: "https://amazon.com/item/5", sourceName: "Amazon", rank: 5 },
      // Rogue modern listing
      { title: "Apple iPhone 13 128GB Midnight Unlocked", sourceUrl: "https://walmart.com/item/6", sourceName: "Walmart", rank: 6 },
    ];

    const result = appleVisualEvidence(candidates);
    expect(result).not.toBeNull();
    // Consensus on iPhone 8 Plus must NOT be invalidated by a lone outlier
    expect(result?.model).toBe("iPhone 8 Plus");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("recognizes modern iPhone 13 when genuine multi-candidate consensus exists", () => {
    // 5 iPhone 13 listings across independent sources + 1 iPhone 8 Plus listing
    const candidates: VisualCandidate[] = [
      { title: "Apple iPhone 13, 128GB, Midnight - Unlocked (Renewed)", sourceUrl: "https://amazon.com/dp/B09V3HMZ8S", sourceName: "Amazon", rank: 1 },
      { title: "Apple iPhone 13 (128GB) - Starlight", sourceUrl: "https://flipkart.com/apple-iphone-13", sourceName: "Flipkart", rank: 2 },
      { title: "Apple iPhone 13 128GB Green Verizon Excellent Condition", sourceUrl: "https://ebay.com/itm/123456789", sourceName: "eBay", rank: 3 },
      { title: "iPhone 13 128GB Blue - Refurbished", sourceUrl: "https://backmarket.com/iphone-13", sourceName: "BackMarket", rank: 4 },
      { title: "iPhone 13 OLED Display Screen Replacement Assembly", sourceUrl: "https://ifixit.com/item/13", sourceName: "iFixit", rank: 5 },
      // Lone legacy listing
      { title: "iPhone 8 Plus Screen Replacement Black", sourceUrl: "https://aliexpress.com/item/888", sourceName: "AliExpress", rank: 6 },
    ];

    const result = appleVisualEvidence(candidates);
    expect(result).not.toBeNull();
    expect(result?.model).toBe("iPhone 13");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("triggers operator review when candidate listings are evenly split without physical cues", () => {
    // 3 iPhone 8 Plus listings + 3 iPhone 13 listings (tied conflict)
    const candidates: VisualCandidate[] = [
      { title: "iPhone 8 Plus LCD Screen Replacement Assembly", sourceUrl: "https://ifixit.com/item/1", sourceName: "iFixit", rank: 1 },
      { title: "Apple iPhone 13 OLED Screen Assembly", sourceUrl: "https://mobilesentrix.com/item/2", sourceName: "MobileSentrix", rank: 2 },
      { title: "iPhone 8 Plus Touch Screen Digitizer Black", sourceUrl: "https://ebay.com/item/3", sourceName: "eBay", rank: 3 },
      { title: "iPhone 13 OLED Display Screen Replacement", sourceUrl: "https://injuredgadgets.com/item/4", sourceName: "InjuredGadgets", rank: 4 },
      { title: "iPhone 8 Plus White Display Panel", sourceUrl: "https://amazon.com/item/5", sourceName: "Amazon", rank: 5 },
      { title: "Apple iPhone 13 Display Replacement", sourceUrl: "https://repairsuniverse.com/item/6", sourceName: "RepairsUniverse", rank: 6 },
    ];

    const result = appleVisualEvidence(candidates);
    expect(result).not.toBeNull();
    // Conflicting mixed listings must trigger operator review, not certify either model
    expect(result?.model).toBeNull();
    expect(result?.confidence).toBeLessThanOrEqual(0.50);
  });

  it("resolves tied conflict to modern iPhone 13 when physical OLED markings are present", () => {
    // 3 iPhone 8 Plus listings + 3 iPhone 13 listings, but OCR confirms HARD OLED
    const candidates: VisualCandidate[] = [
      { title: "iPhone 8 Plus LCD Screen Replacement Assembly", sourceUrl: "https://ifixit.com/item/1", sourceName: "iFixit", rank: 1 },
      { title: "Apple iPhone 13 OLED Screen Assembly", sourceUrl: "https://mobilesentrix.com/item/2", sourceName: "MobileSentrix", rank: 2 },
      { title: "iPhone 8 Plus Touch Screen Digitizer Black", sourceUrl: "https://ebay.com/item/3", sourceName: "eBay", rank: 3 },
      { title: "iPhone 13 OLED Display Screen Replacement", sourceUrl: "https://injuredgadgets.com/item/4", sourceName: "InjuredGadgets", rank: 4 },
      { title: "iPhone 8 Plus White Display Panel", sourceUrl: "https://amazon.com/item/5", sourceName: "Amazon", rank: 5 },
      { title: "Apple iPhone 13 Display Replacement", sourceUrl: "https://repairsuniverse.com/item/6", sourceName: "RepairsUniverse", rank: 6 },
    ];

    const ocrHints = ["HARD OLED", "AL13-DISPLAY", "821-03200-A"];

    const result = appleVisualEvidence(candidates, undefined, ocrHints);
    expect(result).not.toBeNull();
    // Physical OLED marking invalidates legacy LCD and resolves to iPhone 13
    expect(result?.model).toBe("iPhone 13");
  });

  it("does not let generic flex cable prefix (821-) invalidate legitimate iPhone 8 Plus", () => {
    const candidates: VisualCandidate[] = [
      { title: "OEM Apple iPhone 8 Plus LCD Screen Replacement Black", sourceUrl: "https://ifixit.com/item/1", sourceName: "iFixit", rank: 1 },
      { title: "iPhone 8 Plus Touch Screen Digitizer Assembly Genuine", sourceUrl: "https://ebay.com/item/2", sourceName: "eBay", rank: 2 },
      { title: "Apple iPhone 8 Plus White Display Assembly", sourceUrl: "https://mobilesentrix.com/item/3", sourceName: "MobileSentrix", rank: 3 },
      { title: "Replacement Screen for iPhone 8 Plus Premium Quality", sourceUrl: "https://injuredgadgets.com/item/4", sourceName: "InjuredGadgets", rank: 4 },
    ];

    // Generic 821- flex code is common to iPhone 8 Plus as well as modern iPhones
    const ocrHints = ["821-0284"];

    const result = appleVisualEvidence(candidates, undefined, ocrHints);
    expect(result).not.toBeNull();
    expect(result?.model).toBe("iPhone 8 Plus");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.85);
  });
});

describe("BLOCKER 5: Cleaner Decision Rejection Ordering & Contradiction Protection", () => {
  const baseEvidence: CleanDisplayDecision = {
    manufacturer: "Apple",
    model: "iPhone 8 Plus",
    suggestedModel: "iPhone 8 Plus",
    confidence: 0.90,
    displayName: "Apple iPhone 8 Plus Display",
    decisionStatus: "provisional",
    rejectedModel: null,
    reasoning: "Heuristic evidence suggests iPhone 8 Plus.",
    cleanedCandidates: ["Apple iPhone 8 Plus Screen Replacement"],
  };

  const sampleCandidates: VisualCandidate[] = [
    { title: "Apple iPhone 8 Plus Screen Replacement", rank: 1 },
  ];

  it("enforces Contradiction Guard: rejects candidate when cleaner sets rejected: true even if model string matches", () => {
    const contradictoryResponse = {
      manufacturer: "Apple",
      model: "iPhone 8 Plus",
      rejected: true,
      reasoning: "The tall 19.5:9 form factor cannot be an iPhone 8 Plus; rejected.",
    };

    const decision = evaluateCleanerResponse(contradictoryResponse, baseEvidence, sampleCandidates);
    // Must NEVER accept when rejected: true!
    expect(decision.decisionStatus).toBe("rejected");
    expect(decision.model).toBeNull();
    expect(decision.suggestedModel).toBeNull();
    expect(decision.rejectedModel).toBe("iPhone 8 Plus");
    expect(decision.confidence).toBeLessThanOrEqual(0.20);
  });

  it("correctly handles rejection that proposes a replacement model", () => {
    const replacementResponse = {
      manufacturer: "Apple",
      model: "iPhone 13",
      rejected: true,
      reasoning: "This display has a notch and OLED panel, rejecting iPhone 8 Plus in favor of iPhone 13.",
    };

    const decision = evaluateCleanerResponse(replacementResponse, baseEvidence, sampleCandidates);
    expect(decision.decisionStatus).toBe("rejected");
    expect(decision.model).toBeNull();
    expect(decision.suggestedModel).toBe("iPhone 13");
    expect(decision.rejectedModel).toBe("iPhone 8 Plus");
    expect(decision.displayName).toBe("Apple iPhone 13 Display");
    expect(decision.confidence).toBe(0.40);
  });

  it("detects reasoning contradiction as explicit rejection even if rejected boolean is omitted", () => {
    const contradictionInReasoning = {
      manufacturer: "Apple",
      model: "iPhone 8 Plus",
      reasoning: "Physical inspection shows this is definitely not an iPhone 8 Plus due to bezel layout.",
    };

    const decision = evaluateCleanerResponse(contradictionInReasoning, baseEvidence, sampleCandidates);
    expect(decision.decisionStatus).toBe("rejected");
    expect(decision.model).toBeNull();
    expect(decision.rejectedModel).toBe("iPhone 8 Plus");
  });

  it("accepts candidate when corroborated with clean reasoning and no rejection", () => {
    const cleanMatch = {
      manufacturer: "Apple",
      model: "iPhone 8 Plus",
      rejected: false,
      reasoning: "Bezel dimensions and Touch ID cutout confirm iPhone 8 Plus.",
    };

    const decision = evaluateCleanerResponse(cleanMatch, baseEvidence, sampleCandidates);
    expect(decision.decisionStatus).toBe("accepted");
    expect(decision.model).toBe("iPhone 8 Plus");
  });

  it("abstains with safe confidence when cleaner output is malformed or empty", () => {
    const malformed = null;
    const decision = evaluateCleanerResponse(malformed, baseEvidence, sampleCandidates);
    expect(decision.decisionStatus).toBe("abstained");
    expect(decision.model).toBeNull();
    expect(decision.confidence).toBe(0.35);
  });
});
