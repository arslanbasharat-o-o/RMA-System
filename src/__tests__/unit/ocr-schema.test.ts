import { describe, it, expect } from "vitest";
import { OcrStructuredOutputSchema } from "@/lib/recognition/openai/types";
import { resolveOpenAiVisionModel } from "@/lib/recognition/openai/vision";
import { preprocessForOcr } from "@/lib/recognition/openai/preprocessor";
import sharp from "sharp";

describe("OCR Structured Output Validation", () => {
  it("should validate a complete valid OCR extraction", () => {
    const raw = {
      raw_text: ["AMI/A", "INCELL", "821-03200-A"],
      detected_codes: ["821-03200-A"],
      part_numbers: ["821-03200-A"],
      vendor_markings: ["AMI", "AMI/A"],
      technology_markings: ["INCELL"],
      possible_vendor_aliases: ["AMI/A"],
      unreadable_regions: [],
      extraction_notes: ["Clear stamp on flex connector"],
    };

    const parsed = OcrStructuredOutputSchema.parse(raw);
    expect(parsed.vendor_markings).toContain("AMI/A");
    expect(parsed.technology_markings).toContain("INCELL");
  });

  it("should reject an invalid schema missing required fields", () => {
    const incomplete = {
      raw_text: ["AMI"],
      // missing other required fields
    };

    expect(() => OcrStructuredOutputSchema.parse(incomplete)).toThrow();
  });

  it("should resolve Terra and Luna OpenAI model aliases correctly", () => {
    expect(resolveOpenAiVisionModel("terra")).toBe("gpt-5.6-terra");
    expect(resolveOpenAiVisionModel("gpt-5.6-terra")).toBe("gpt-5.6-terra");
    expect(resolveOpenAiVisionModel("TERRA")).toBe("gpt-5.6-terra");
    expect(resolveOpenAiVisionModel("luna")).toBe("gpt-5.6-luna");
    expect(resolveOpenAiVisionModel("gpt-5.6-luna")).toBe("gpt-5.6-luna");
    expect(resolveOpenAiVisionModel("gpt-6-luna")).toBe("gpt-6-luna");
    expect(resolveOpenAiVisionModel("gpt-4o")).toBe("gpt-4o");
    expect(resolveOpenAiVisionModel("gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("should preprocess display images and generate high-contrast crops", async () => {
    // Create a 200x200 test buffer
    const testBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 50, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await preprocessForOcr(testBuffer, true);
    expect(result.primaryBuffer).toBeDefined();
    expect(result.cropBuffer).toBeDefined();
    expect(result.enhancedStampBuffer).toBeDefined();
    expect(result.allCrops.length).toBeGreaterThanOrEqual(1);
  });
});
