import { describe, expect, it } from "vitest";
import {
  isCurrentVisualDecisionPolicy,
  readVisualDecisionSnapshot,
  snapshotVisualDecision,
  stableVisualDecision,
  VISUAL_DECISION_POLICY,
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

  it("sends weak conflicting model evidence to review instead of silently discarding it", () => {
    const chosen = stableVisualDecision([result("iPhone 15 Pro")], result("iPhone 14", 0.45));
    expect(chosen?.conflict).toBe(true);
    expect(chosen?.cleanDecision?.model).toBeNull();
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

  it.each(["manual", "conflict"] as const)("preserves %s status and typed candidate evidence when storing a reused result", (flag) => {
    const snapshot = {
      ...result(flag === "manual" ? "iPhone 15 Pro Max" : null),
      [flag]: true,
      candidates: [{ title: "Exact source listing", sourceUrl: "https://example.test/display", rank: 1 }],
    };
    const saved = snapshotVisualDecision(visualResultFromSnapshot(snapshot, "same-image"));

    expect(saved[flag]).toBe(true);
    expect(saved.candidates).toEqual(snapshot.candidates);
    expect(readVisualDecisionSnapshot({ stableDecision: saved })?.candidates).toEqual(snapshot.candidates);
  });

  it("caches an unresolved result for the identical image instead of searching repeatedly", () => {
    const unresolved = result(null, 0.45);
    const reused = stableVisualDecision([unresolved]);

    expect(reused?.cleanDecision?.model).toBeNull();
    expect(reused?.cleanDecision?.displayName).toBe("Unidentified Apple Display");
  });

  it("allows a fresh result to replace an old unresolved result", () => {
    const refreshed = stableVisualDecision([result(null, 0.45)], result("iPhone 15 Pro"));

    expect(refreshed?.conflict).not.toBe(true);
    expect(refreshed?.cleanDecision?.model).toBe("iPhone 15 Pro");
  });

  it("uses stronger fresh evidence for the same model without creating a conflict", () => {
    const refreshed = stableVisualDecision(
      [result("iPhone 15 Pro", 0.55)],
      result("iPhone 15 Pro", 0.94)
    );

    expect(refreshed?.conflict).not.toBe(true);
    expect(refreshed?.cleanDecision?.model).toBe("iPhone 15 Pro");
    expect(refreshed?.cleanDecision?.confidence).toBe(0.94);
  });

  it("keeps fresh Lens evidence visible when same-image results conflict", () => {
    const older = {
      ...result("iPhone 14"),
      candidates: [{ title: "iPhone 14 display", sourceUrl: "https://example.test/14", rank: 1 }],
      aiOverview: "Older overview",
    };
    const fresh = {
      ...result("iPhone 15 Pro"),
      candidates: [{ title: "iPhone 15 Pro display", sourceUrl: "https://example.test/15", rank: 1 }],
      aiOverview: "Fresh overview",
    };
    const conflict = stableVisualDecision([older], fresh);

    expect(conflict?.conflict).toBe(true);
    expect(conflict?.cleanDecision?.model).toBeNull();
    expect(conflict?.aiOverview).toBe("Fresh overview");
    expect(conflict?.candidates.map((candidate) => candidate.title)).toEqual([
      "iPhone 14 display",
      "iPhone 15 Pro display",
    ]);
  });

  it("only reuses automated evidence saved by the active decision policy", () => {
    expect(isCurrentVisualDecisionPolicy({ decisionPolicy: VISUAL_DECISION_POLICY })).toBe(true);
    expect(isCurrentVisualDecisionPolicy({ decisionPolicy: "evidence-consensus-2026-10-18" })).toBe(false);
    expect(isCurrentVisualDecisionPolicy({ decisionPolicy: "source-corroboration-2026-10-19-v5" })).toBe(false);
    expect(isCurrentVisualDecisionPolicy({ decisionPolicy: "source-corroboration-2026-10-19-v6" })).toBe(false);
    expect(isCurrentVisualDecisionPolicy({ decisionPolicy: "source-corroboration-2026-10-19-v7" })).toBe(false);
    expect(isCurrentVisualDecisionPolicy(null)).toBe(false);
  });

  it("round trips suggestedModel across snapshot persistence", () => {
    const snapshot: VisualDecisionSnapshot = {
      manufacturer: "Apple",
      suggestedModel: "iPhone 15 Pro",
      candidates: [],
      cleanDecision: {
        manufacturer: "Apple",
        model: null,
        suggestedModel: "iPhone 15 Pro",
        displayName: "Apple iPhone 15 Pro Display",
        confidence: 0.45,
        cleanedCandidates: [],
        reasoning: "Suggested from consensus",
      },
    };
    const saved = snapshotVisualDecision(visualResultFromSnapshot(snapshot, "same-image"));
    expect(saved.suggestedModel).toBe("iPhone 15 Pro");
    const restored = readVisualDecisionSnapshot({ stableDecision: saved });
    expect(restored?.cleanDecision?.suggestedModel).toBe("iPhone 15 Pro");
    expect(restored?.suggestedModel).toBe("iPhone 15 Pro");
  });

  it("retains provider failures when displaying a safe stored result", () => {
    const snapshot = result(null, 0.45);
    const reused = visualResultFromSnapshot(snapshot, "same-image-evidence", "Google Lens returned a challenge");

    expect(reused.cleanDecision?.model).toBeNull();
    expect(reused.error).toBe("Google Lens returned a challenge");
    expect(reused.rawResponse.providerError).toBe("Google Lens returned a challenge");
  });

  it("reads decisions stored by pre-consensus releases", () => {
    const restored = readVisualDecisionSnapshot({
      candidates: [{ title: "Apple iPhone 14 Display", rank: 1 }],
      cleanDecision: {
        manufacturer: "Apple",
        model: "iPhone 14",
        displayName: "Apple iPhone 14 Display",
        confidence: 0.45,
        cleanedCandidates: ["Apple iPhone 14 Display"],
        reasoning: "Legacy provider result",
      },
    });
    expect(restored?.cleanDecision?.model).toBe("iPhone 14");
    expect(restored?.cleanDecision?.confidence).toBe(0.45);
  });
});
