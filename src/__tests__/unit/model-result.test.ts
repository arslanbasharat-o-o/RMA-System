import { describe, expect, it } from "vitest";
import { hasModelSuggestion } from "@/lib/model-result";

describe("model suggestion labels", () => {
  it("treats an explicit unidentified display label as unknown", () => {
    expect(hasModelSuggestion({
      predictedModel: null,
      predictedDisplayAssembly: "Unidentified Apple Display",
    })).toBe(false);
  });

  it("keeps a specific model label as a suggestion", () => {
    expect(hasModelSuggestion({
      predictedModel: null,
      predictedDisplayAssembly: "Apple iPhone 14 Display",
    })).toBe(true);
  });

  it("does not treat empty or pending labels as model suggestions", () => {
    expect(hasModelSuggestion({ predictedModel: null, predictedDisplayAssembly: null })).toBe(false);
    expect(hasModelSuggestion({ predictedModel: "Pending Identification" })).toBe(false);
  });
});
