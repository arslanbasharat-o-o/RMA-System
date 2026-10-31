import { z } from "zod";
import type { OpenAiCallTelemetry } from "./telemetry";

export const OcrStructuredOutputSchema = z.object({
  raw_text: z.array(z.string()).describe("All verbatim readable text extracted from the display"),
  detected_codes: z.array(z.string()).describe("Any alphanumeric codes, model numbers, or serial strings"),
  part_numbers: z.array(z.string()).describe("Part numbers or assembly codes found on flex cable, stickers or glass"),
  vendor_markings: z.array(z.string()).describe("Vendor stamps, supplier logos, or brand marks (e.g. AMI, JK, GX)"),
  technology_markings: z.array(z.string()).describe("Display technology markings (e.g. INCELL, OLED, TFT, AFTERMARKET)"),
  possible_vendor_aliases: z.array(z.string()).describe("Alternative abbreviations or observed variants of vendor marks"),
  unreadable_regions: z.array(z.string()).describe("Areas where markings or stickers are smudged, torn, or illegible"),
  extraction_notes: z.array(z.string()).describe("Factual extraction observations without hallucinating unseen data"),
});

export type OcrStructuredOutput = z.infer<typeof OcrStructuredOutputSchema>;

export interface OcrExtractionResult {
  structured: OcrStructuredOutput;
  model: string;
  durationMs: number;
  rawResponse?: Record<string, unknown>;
  error?: string;
  telemetry?: OpenAiCallTelemetry;
}
