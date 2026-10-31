import { describe, it, expect } from "vitest";
import {
  computeSeededComparisonFingerprint,
  isSafeForReuse,
  reconstructMatchFromPriorResponse,
} from "@/lib/recognition/recognition-cache";
import type { SeededInventoryReference } from "@/lib/recognition/seeded-inventory";

describe("Recognition Cache and Result Reuse", () => {
  const sampleTargetImages = [
    {
      imageType: "back",
      checksumSha256: "target-sha-1111111111111111111111111111111111111111111111111111111111111111",
    },
    {
      imageType: "top_edge",
      checksumSha256: "target-sha-2222222222222222222222222222222222222222222222222222222222222222",
    },
  ];

  const sampleReferences: SeededInventoryReference[] = [
    {
      product: {
        id: "prod-1",
        manufacturer: "Apple",
        modelName: "iPhone 16 Pro",
        variantName: "OLED",
        printedTitle: "iPhone 16 Pro Display",
        barcodeValue: null,
        barcodeFormat: null,
        barcodeSymbology: null,
        supplierSku: null,
      },
      displayId: "disp-001",
      imageBuffer: Buffer.from("ref-1-bytes"),
      imageType: "back",
    },
    {
      product: {
        id: "prod-2",
        manufacturer: "Apple",
        modelName: "iPhone 16 Plus",
        variantName: "OLED",
        printedTitle: "iPhone 16 Plus Display",
        barcodeValue: null,
        barcodeFormat: null,
        barcodeSymbology: null,
        supplierSku: null,
      },
      displayId: "disp-002",
      imageBuffer: Buffer.from("ref-2-bytes"),
      imageType: "back",
    },
  ];

  it("computes deterministic fingerprint for identical inputs", () => {
    const fp1 = computeSeededComparisonFingerprint({
      rmaItemId: "item-123",
      targetImages: sampleTargetImages,
      references: sampleReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
      promptCachingOrder: "prefix",
    });

    const fp2 = computeSeededComparisonFingerprint({
      rmaItemId: "item-123",
      targetImages: [...sampleTargetImages],
      references: [...sampleReferences],
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
      promptCachingOrder: "prefix",
    });

    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("invalidates fingerprint if rmaItemId changes (cross-item/customer protection)", () => {
    const fp1 = computeSeededComparisonFingerprint({
      rmaItemId: "item-123",
      targetImages: sampleTargetImages,
      references: sampleReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    const fp2 = computeSeededComparisonFingerprint({
      rmaItemId: "item-456",
      targetImages: sampleTargetImages,
      references: sampleReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    expect(fp1).not.toBe(fp2);
  });

  it("invalidates fingerprint if target images change", () => {
    const fp1 = computeSeededComparisonFingerprint({
      targetImages: sampleTargetImages,
      references: sampleReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    const fp2 = computeSeededComparisonFingerprint({
      targetImages: [
        {
          imageType: "back",
          checksumSha256: "different-target-sha",
        },
      ],
      references: sampleReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    expect(fp1).not.toBe(fp2);
  });

  it("invalidates fingerprint if catalog references change", () => {
    const fp1 = computeSeededComparisonFingerprint({
      targetImages: sampleTargetImages,
      references: sampleReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    const fp2 = computeSeededComparisonFingerprint({
      targetImages: sampleTargetImages,
      references: [sampleReferences[0]],
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    expect(fp1).not.toBe(fp2);
  });

  it("regression: invalidates fingerprint if reference image actual bytes change even with identical product ID and labels", () => {
    const fp1 = computeSeededComparisonFingerprint({
      targetImages: sampleTargetImages,
      references: sampleReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    // Same product ID, same display ID, same label, but different image bytes
    const modifiedReferences = [
      {
        ...sampleReferences[0],
        imageBuffer: Buffer.from("replaced-display-photo-different-pixel-bytes"),
      },
      sampleReferences[1],
    ];

    const fp2 = computeSeededComparisonFingerprint({
      targetImages: sampleTargetImages,
      references: modifiedReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    expect(fp1).not.toBe(fp2);
  });

  it("invalidates fingerprint if model changes", () => {
    const fp1 = computeSeededComparisonFingerprint({
      targetImages: sampleTargetImages,
      references: sampleReferences,
      discoveryModel: "gpt-6.1-terra",
      finalModel: "gpt-6.1-sol",
    });

    const fp2 = computeSeededComparisonFingerprint({
      targetImages: sampleTargetImages,
      references: sampleReferences,
      discoveryModel: "gpt-6.1-sol",
      finalModel: "gpt-6.1-sol",
    });

    expect(fp1).not.toBe(fp2);
  });

  it("isSafeForReuse strictly validates criteria", () => {
    // Valid prior response meeting all criteria
    const validResponse = {
      status: "accepted",
      selectedProductId: "prod-1",
      confidence: 0.95,
      matchingCues: ["Top notch cutout matches", "Flex connector aligns"],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: ["disp-001"],
    };

    expect(isSafeForReuse(validResponse)).toBe(true);

    // Reject confidence below threshold (< 0.85)
    expect(
      isSafeForReuse({
        ...validResponse,
        confidence: 0.82,
      })
    ).toBe(false);

    // Reject if conflicting cues are present
    expect(
      isSafeForReuse({
        ...validResponse,
        conflictingCues: ["Flex connector pin count differs"],
      })
    ).toBe(false);

    // Reject if unresolved alternatives exist
    expect(
      isSafeForReuse({
        ...validResponse,
        unresolvedAlternatives: ["prod-2"],
      })
    ).toBe(false);

    // Reject if selectedProductId is missing or null
    expect(
      isSafeForReuse({
        ...validResponse,
        selectedProductId: null,
      })
    ).toBe(false);

    // Reject status !== "accepted"
    expect(
      isSafeForReuse({
        ...validResponse,
        status: "abstain",
      })
    ).toBe(false);

    // Reject null or empty input
    expect(isSafeForReuse(null)).toBe(false);
    expect(isSafeForReuse(undefined)).toBe(false);
  });

  it("reconstructMatchFromPriorResponse retains data and provides zero-cost telemetry", () => {
    const priorResponse = {
      status: "accepted",
      selectedProductId: "prod-1",
      confidence: 0.95,
      matchingCues: ["Top notch cutout matches", "Flex connector aligns"],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: ["disp-001"],
    };

    const priorRunId = "run-uuid-9999";
    const reconstructed = reconstructMatchFromPriorResponse(priorResponse, sampleReferences, priorRunId);

    expect(reconstructed).not.toBeNull();
    expect(reconstructed!.status).toBe("accepted");
    expect(reconstructed!.product).toEqual(sampleReferences[0].product);
    expect(reconstructed!.confidence).toBe(0.95);
    expect(reconstructed!.matchingCues).toEqual(["Top notch cutout matches", "Flex connector aligns"]);
    expect(reconstructed!.conflictingCues).toEqual([]);
    expect(reconstructed!.unresolvedAlternatives).toEqual([]);
    expect(reconstructed!.supportingReferenceIds).toEqual(["disp-001"]);
    // Reused matches cost $0.00
    expect(reconstructed!.telemetry?.totalCostUsd).toBe(0);
    expect(reconstructed!.telemetry?.usage.promptTokens).toBe(0);
  });

  it("refuses reconstruction if product was deactivated or deleted from references", () => {
    const priorResponse = {
      status: "accepted",
      selectedProductId: "prod-deleted-or-deactivated",
      confidence: 0.95,
      matchingCues: ["Top notch cutout matches"],
      conflictingCues: [],
      unresolvedAlternatives: [],
      supportingReferenceIds: ["disp-001"],
    };

    const priorRunId = "run-uuid-9999";
    const reconstructed = reconstructMatchFromPriorResponse(priorResponse, sampleReferences, priorRunId);

    // Because 'prod-deleted-or-deactivated' is not in sampleReferences, reconstruction returns null
    expect(reconstructed).toBeNull();
  });
});
