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
  const value = (rawResponse as Record<string, unknown>).stableDecision;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<VisualDecisionSnapshot>;
  if (!Array.isArray(snapshot.candidates)) return null;
  if (snapshot.cleanDecision && (
    typeof snapshot.cleanDecision.confidence !== "number" ||
    typeof snapshot.cleanDecision.displayName !== "string"
  )) return null;
  return {
    manufacturer: typeof snapshot.manufacturer === "string" ? snapshot.manufacturer : undefined,
    model: typeof snapshot.model === "string" ? snapshot.model : undefined,
    displayAssembly: typeof snapshot.displayAssembly === "string" ? snapshot.displayAssembly : undefined,
    candidates: snapshot.candidates.filter((candidate): candidate is VisualCandidate =>
      Boolean(candidate && typeof candidate.title === "string" && typeof candidate.rank === "number")
    ).slice(0, 30),
    aiOverview: typeof snapshot.aiOverview === "string" ? snapshot.aiOverview : undefined,
    cleanDecision: snapshot.cleanDecision,
    manual: snapshot.manual === true,
    conflict: snapshot.conflict === true,
  };
}

function identityKey(snapshot: VisualDecisionSnapshot): string | null {
  const decision = snapshot.cleanDecision;
  if (!decision?.manufacturer || !decision.model || decision.confidence < 0.85) return null;
  return `${decision.manufacturer} ${decision.model}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function conflictSnapshot(snapshots: VisualDecisionSnapshot[]): VisualDecisionSnapshot {
  const manufacturers = [...new Set(snapshots.map((entry) => entry.cleanDecision?.manufacturer).filter(Boolean))];
  const manufacturer = manufacturers.length === 1 ? manufacturers[0] as string : null;
  const displayName = manufacturer ? `Unidentified ${manufacturer} Display` : "Unidentified Display";
  const models = [...new Set(snapshots.map((entry) => entry.cleanDecision?.model).filter(Boolean))];
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
