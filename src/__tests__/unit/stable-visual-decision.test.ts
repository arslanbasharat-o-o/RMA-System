import { describe, expect, it } from "vitest";
import {
  readVisualDecisionSnapshot,
  stableVisualDecision,
  visualResultFromSnapshot,
  type VisualDecisionSnapshot,
} from "@/lib/recognition/lens/stable-decision";

function result(model: string | null, confidence = 0.88): VisualDecisionSnapshot {
  return {
    manufacturer: "Apple",
    model: model || undefined,
    candidates: [],
    cleanDecision: {
      manufacturer: "Apple",
      model,
      displayName: model ? `Apple ${model} Display` : "Unidentified Apple Display",
      confidence,
      cleanedCandidates: [],
      reasoning: "Independent source evidence",
    },
  };
}

describe("stable decisions for an identical uploaded image", () => {
  it("keeps a corroborated result when a later search is inconclusive", () => {
    const chosen = stableVisualDecision([result("iPhone 16 Pro")], result(null, 0.45));
    expect(chosen?.cleanDecision?.model).toBe("iPhone 16 Pro");
    expect(visualResultFromSnapshot(chosen!, "same-image").normalizedModel).toBe("iPhone 16 Pro");
  });

  it("sends conflicting credible variants to review instead of choosing one", () => {
    const chosen = stableVisualDecision([result("iPhone 16 Pro")], result("iPhone 16 Pro Max"));
    expect(chosen?.conflict).toBe(true);
    expect(chosen?.cleanDecision?.model).toBeNull();
    expect(chosen?.cleanDecision?.confidence).toBeLessThan(0.5);
    expect(stableVisualDecision([chosen!], result("iPhone 16 Pro"))?.cleanDecision?.model).toBeNull();
  });

  it("uses an operator correction for the same photo over machine suggestions", () => {
    const manual = { ...result("iPhone 16 Pro" , 1), manual: true };
    const chosen = stableVisualDecision([result("iPhone 16 Pro Max"), manual], result("iPhone 16 Pro Max"));
    expect(chosen?.cleanDecision?.model).toBe("iPhone 16 Pro");
    expect(chosen?.manual).toBe(true);
  });

  it("round trips the stored snapshot without a provider call", () => {
    const snapshot = result("iPhone 14 Plus");
    const restored = readVisualDecisionSnapshot({ stableDecision: snapshot });
    expect(restored?.cleanDecision?.model).toBe("iPhone 14 Plus");
    expect(readVisualDecisionSnapshot({ stableDecision: { candidates: "invalid" } })).toBeNull();
  });
});
