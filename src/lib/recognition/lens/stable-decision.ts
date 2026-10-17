import type { CleanDisplayDecision } from "./decision";
import type { VisualCandidate, VisualIdentificationResult } from "./types";

// A policy change can intentionally re-evaluate older images without changing
// or deleting the evidence saved by an earlier release.
export const VISUAL_DECISION_POLICY = "evidence-consensus-2026-10-18";

export interface VisualDecisionSnapshot {
  manufacturer?: string;
  model?: string;
  displayAssembly?: string;
  candidates: VisualCandidate[];
  aiOverview?: string;
  cleanDecision?: CleanDisplayDecision;
  manual?: boolean;
  conflict?: boolean;
}

export function snapshotVisualDecision(result: VisualIdentificationResult): VisualDecisionSnapshot {
  return {
    manufacturer: result.normalizedManufacturer,
    model: result.normalizedModel,
    displayAssembly: result.detectedDisplayAssembly,
    candidates: result.candidates.slice(0, 30),
    aiOverview: result.aiOverview,
    cleanDecision: result.cleanDecision,
  };
}

export function readVisualDecisionSnapshot(rawResponse: unknown): VisualDecisionSnapshot | null {
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) return null;
  const root = rawResponse as Record<string, unknown>;
  const value = root.stableDecision && typeof root.stableDecision === "object" && !Array.isArray(root.stableDecision)
    ? root.stableDecision as Record<string, unknown>
    : root;
  const decisionValue = value.cleanDecision;
  if (!decisionValue || typeof decisionValue !== "object" || Array.isArray(decisionValue)) return null;
  const rawDecision = decisionValue as Record<string, unknown>;
  if (typeof rawDecision.confidence !== "number" || typeof rawDecision.displayName !== "string") return null;
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  const cleanedCandidates = Array.isArray(rawDecision.cleanedCandidates)
    ? rawDecision.cleanedCandidates.filter((candidate): candidate is string => typeof candidate === "string")
    : [];
  const cleanDecision: CleanDisplayDecision = {
    manufacturer: typeof rawDecision.manufacturer === "string" ? rawDecision.manufacturer : null,
    model: typeof rawDecision.model === "string" ? rawDecision.model : null,
    displayName: rawDecision.displayName,
    confidence: rawDecision.confidence,
    cleanedCandidates,
    reasoning: typeof rawDecision.reasoning === "string" ? rawDecision.reasoning : "Stored visual recognition decision",
  };
  return {
    manufacturer: typeof value.manufacturer === "string" ? value.manufacturer
      : typeof root.normalizedManufacturer === "string" ? root.normalizedManufacturer
      : cleanDecision.manufacturer || undefined,
    model: typeof value.model === "string" ? value.model
      : typeof root.normalizedModel === "string" ? root.normalizedModel
      : cleanDecision.model || undefined,
    displayAssembly: typeof value.displayAssembly === "string" ? value.displayAssembly
      : typeof root.detectedDisplayAssembly === "string" ? root.detectedDisplayAssembly
      : cleanDecision.displayName,
    candidates: candidates.filter((candidate): candidate is VisualCandidate =>
      Boolean(candidate && typeof candidate.title === "string" && typeof candidate.rank === "number")
    ).slice(0, 30),
    aiOverview: typeof value.aiOverview === "string" ? value.aiOverview
      : typeof root.aiOverview === "string" ? root.aiOverview : undefined,
    cleanDecision,
    manual: value.manual === true,
    conflict: value.conflict === true,
  };
}

function identityKey(snapshot: VisualDecisionSnapshot): string | null {
  const decision = snapshot.cleanDecision;
  if (!decision?.manufacturer || !decision.model || decision.confidence < 0.85) return null;
  return `${decision.manufacturer} ${decision.model}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function observedModelKey(snapshot: VisualDecisionSnapshot): string | null {
  const manufacturer = snapshot.cleanDecision?.manufacturer || snapshot.manufacturer;
  const model = snapshot.cleanDecision?.model || snapshot.model;
  if (!manufacturer || !model) return null;
  return `${manufacturer} ${model}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function conflictSnapshot(snapshots: VisualDecisionSnapshot[]): VisualDecisionSnapshot {
  const manufacturers = [...new Set(snapshots.map((entry) =>
    entry.cleanDecision?.manufacturer || entry.manufacturer
  ).filter(Boolean))];
  const manufacturer = manufacturers.length === 1 ? manufacturers[0] as string : null;
  const displayName = manufacturer ? `Unidentified ${manufacturer} Display` : "Unidentified Display";
  const models = [...new Set(snapshots.map((entry) =>
    entry.cleanDecision?.model || entry.model
  ).filter(Boolean))];
  return {
    manufacturer: manufacturer || undefined,
    candidates: snapshots[0]?.candidates || [],
    conflict: true,
    cleanDecision: {
      manufacturer,
      model: null,
      displayName,
      confidence: 0.45,
      cleanedCandidates: [],
      reasoning: `The same image produced conflicting model evidence (${models.join(" / ") || "multiple models"}). Operator review is required.`,
    },
  };
}

/** Human corrections win. Conflicting credible machine results never become a new guess. */
export function stableVisualDecision(
  previous: VisualDecisionSnapshot[],
  fresh?: VisualDecisionSnapshot
): VisualDecisionSnapshot | null {
  const manual = previous.filter((entry) => entry.manual && identityKey(entry));
  if (manual.length) {
    return new Set(manual.map(identityKey)).size === 1 ? manual[0] : conflictSnapshot(manual);
  }

  if (previous.some((entry) => entry.conflict)) return conflictSnapshot(previous);
  const observed = [...previous, ...(fresh ? [fresh] : [])].filter((entry) => observedModelKey(entry));
  if (new Set(observed.map(observedModelKey)).size > 1) return conflictSnapshot(observed);
  const credible = previous.filter((entry) => identityKey(entry));
  if (new Set(credible.map(identityKey)).size > 1) return conflictSnapshot(credible);
  const established = credible[0];
  if (!established) return fresh || null;
  if (!fresh) return established;

  const freshKey = identityKey(fresh);
  if (freshKey && freshKey !== identityKey(established)) {
    return conflictSnapshot([established, fresh]);
  }
  // A transient Google failure or a weaker later result cannot erase an
  // already corroborated suggestion for the identical photo.
  return established;
}

export function visualResultFromSnapshot(
  snapshot: VisualDecisionSnapshot,
  source: string
): VisualIdentificationResult {
  return {
    provider: snapshot.manual ? "operator-image-match" : "stable-visual-evidence",
    candidates: snapshot.candidates,
    aiOverview: snapshot.aiOverview,
    normalizedManufacturer: snapshot.cleanDecision?.manufacturer || snapshot.manufacturer,
    normalizedModel: snapshot.cleanDecision?.model || undefined,
    detectedDisplayAssembly: snapshot.cleanDecision?.displayName || snapshot.displayAssembly,
    cleanDecision: snapshot.cleanDecision,
    rawResponse: { reusedFrom: source, stableDecision: snapshot },
    durationMs: 0,
  };
}
