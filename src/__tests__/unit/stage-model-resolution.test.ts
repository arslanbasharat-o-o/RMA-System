import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveOpenAiVisionModel,
  resolveOpenAiDiscoveryModel,
  resolveOpenAiFinalModel,
  OpenAiVisionOcrService,
} from "@/lib/recognition/openai/vision";

describe("Stage Model Resolution and Precedence", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENAI_DISCOVERY_MODEL;
    delete process.env.OPENAI_FINAL_MODEL;
    delete process.env.OPENAI_REFERENCE_MODEL;
    delete process.env.OPENAI_VISION_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("normalizes model aliases correctly", () => {
    expect(resolveOpenAiVisionModel("sol")).toBe("gpt-6.1-sol");
    expect(resolveOpenAiVisionModel("gpt-6.1-sol")).toBe("gpt-6.1-sol");
    expect(resolveOpenAiVisionModel("terra")).toBe("gpt-5.6-terra");
    expect(resolveOpenAiVisionModel("gpt-5.6-terra")).toBe("gpt-5.6-terra");
    expect(resolveOpenAiVisionModel("gpt-6.1-terra")).toBe("gpt-6.1-terra");
    expect(resolveOpenAiVisionModel("luna")).toBe("gpt-5.6-luna");
    expect(resolveOpenAiVisionModel("gpt-4o")).toBe("gpt-4o");
    expect(resolveOpenAiVisionModel("gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("Discovery and Final both resolve to the effective baseline model when stage vars are absent", () => {
    // When OPENAI_DISCOVERY_MODEL and OPENAI_FINAL_MODEL are absent,
    // both stages MUST preserve the existing effective baseline model (e.g. Sol or configured model).
    const baseline = "gpt-6.1-sol";
    expect(resolveOpenAiDiscoveryModel(baseline)).toBe("gpt-6.1-sol");
    expect(resolveOpenAiFinalModel(baseline)).toBe("gpt-6.1-sol");

    // Terra is NEVER automatically activated as default
    expect(resolveOpenAiDiscoveryModel(baseline)).not.toBe("gpt-6.1-terra");
  });

  it("resolves discovery-specific model when explicitly set without modifying final stage", () => {
    process.env.OPENAI_DISCOVERY_MODEL = "gpt-6.1-terra";

    const baseline = "gpt-6.1-sol";
    // Discovery resolves to Terra
    expect(resolveOpenAiDiscoveryModel(baseline)).toBe("gpt-6.1-terra");
    // Final continues to resolve to Sol (baseline)
    expect(resolveOpenAiFinalModel(baseline)).toBe("gpt-6.1-sol");
  });

  it("resolves final-specific model when explicitly set without modifying discovery stage", () => {
    process.env.OPENAI_FINAL_MODEL = "gpt-6.1-sol";

    const baseline = "gpt-5.6-terra";
    // Discovery remains baseline (Terra 5.6)
    expect(resolveOpenAiDiscoveryModel(baseline)).toBe("gpt-5.6-terra");
    // Final resolves to explicitly configured Sol
    expect(resolveOpenAiFinalModel(baseline)).toBe("gpt-6.1-sol");
  });

  it("does NOT change OCR or primary service model when OPENAI_DISCOVERY_MODEL is set", () => {
    process.env.OPENAI_DISCOVERY_MODEL = "gpt-6.1-terra";

    const service = new OpenAiVisionOcrService("mock-key", "gpt-6.1-sol");
    // The service primaryModel used for OCR extraction remains gpt-6.1-sol
    expect(service.getModel()).toBe("gpt-6.1-sol");
  });

  it("falls back to OPENAI_VISION_MODEL when baseline is not provided", () => {
    process.env.OPENAI_VISION_MODEL = "gpt-4o";

    expect(resolveOpenAiDiscoveryModel()).toBe("gpt-4o");
    expect(resolveOpenAiFinalModel()).toBe("gpt-4o");
  });
});
