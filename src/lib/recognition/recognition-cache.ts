import { createHash } from "node:crypto";
import type { SeededInventoryMatch, SeededInventoryReference } from "./seeded-inventory";

export const PREPROCESSOR_VERSION = "ocr-preprocessor-v1.2";
export const PROMPT_VERSION = "seeded-inventory-v1.1";
export const SCHEMA_VERSION = "seeded-schema-v1.1";
export const ALGORITHM_VERSION = "seeded-matcher-v1.1";
export const REASONING_EFFORT_CONFIG = "disc:low;fin:medium";
export const RECOGNITION_POLICY_VERSION = "exact-product-variant-v1";

export interface RecognitionFingerprintContext {
  rmaItemId?: string;
  targetImages: Array<{ imageType: string; checksumSha256: string }>;
  references: SeededInventoryReference[];
  discoveryModel: string;
  finalModel: string;
  promptCachingOrder?: string;
}

/**
 * Computes a deterministic composite fingerprint accounting for:
 * 1. Scope: RMA item target images (types and SHA-256 hashes).
 * 2. Active reference catalog products, reference display IDs, AND exact reference image buffer hashes.
 *    (Changing a reference image's actual bytes invalidates the fingerprint immediately).
 * 3. Exact configured discovery and final model IDs, plus reasoning effort settings.
 * 4. Image preprocessing, prompt, schema, recognition policy, and algorithm versions.
 *
 * Any change to target images, reference images, metadata, model settings, or prompts
 * automatically invalidates the fingerprint, preventing stale reuse.
 */
export function computeSeededComparisonFingerprint(ctx: RecognitionFingerprintContext): string {
  const targetImagesKey = [...ctx.targetImages]
    .map((img) => `${img.imageType}:${img.checksumSha256}`)
    .sort()
    .join("|");

  const catalogFingerprint = createHash("sha256")
    .update(
      [...ctx.references]
        .map((ref) => {
          const imageHash = createHash("sha256").update(ref.imageBuffer).digest("hex");
          return `${ref.product.id}:${ref.displayId}:${ref.product.modelName}:${ref.product.variantName}:${ref.product.printedTitle || ""}:${imageHash}`;
        })
        .sort()
        .join(";")
    )
    .digest("hex");

  const modelsKey = `${ctx.discoveryModel}:${ctx.finalModel}:${ctx.promptCachingOrder || "prefix"}:${REASONING_EFFORT_CONFIG}`;

  const payload = [
    ctx.rmaItemId || "item-scope",
    targetImagesKey,
    catalogFingerprint,
    modelsKey,
    RECOGNITION_POLICY_VERSION,
    PREPROCESSOR_VERSION,
    PROMPT_VERSION,
    SCHEMA_VERSION,
    ALGORITHM_VERSION,
  ].join("::");

  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Validates whether a previous raw_response is strictly safe to reuse.
 *
 * Safe reuse rules:
 * - Status must be 'accepted' with confidence >= 0.85
 * - Must have a valid selectedProductId present in references
 * - Conflicting cues must be empty
 * - Unresolved alternatives must be empty
 * - Incomplete, ambiguous, abstained, or error runs are NEVER reused
 */
export function isSafeForReuse(rawResponse: Record<string, unknown> | null | undefined): boolean {
  if (!rawResponse || typeof rawResponse !== "object") return false;

  const status = rawResponse.status;
  const confidence = typeof rawResponse.confidence === "number" ? rawResponse.confidence : 0;
  const selectedProductId = typeof rawResponse.selectedProductId === "string" ? rawResponse.selectedProductId : null;
  const conflictingCues = Array.isArray(rawResponse.conflictingCues) ? rawResponse.conflictingCues : [];
  const unresolvedAlternatives = Array.isArray(rawResponse.unresolvedAlternatives) ? rawResponse.unresolvedAlternatives : [];

  return (
    status === "accepted" &&
    Boolean(selectedProductId) &&
    confidence >= 0.85 &&
    conflictingCues.length === 0 &&
    unresolvedAlternatives.length === 0
  );
}

/**
 * Reconstructs a SeededInventoryMatch from a validated prior raw_response.
 * Returns null if the result does not meet safety criteria or if the product
 * is no longer present in current active catalog references.
 */
export function reconstructMatchFromPriorResponse(
  rawResponse: Record<string, unknown>,
  references: SeededInventoryReference[],
  _priorRunId: string
): SeededInventoryMatch | null {
  if (!isSafeForReuse(rawResponse)) return null;

  const selectedProductId = rawResponse.selectedProductId as string;
  const productRef = references.find((r) => r.product.id === selectedProductId);
  if (!productRef) return null;

  return {
    status: "accepted",
    product: productRef.product,
    confidence: Number(rawResponse.confidence) || 0.99,
    matchingCues: Array.isArray(rawResponse.matchingCues) ? (rawResponse.matchingCues as string[]) : [],
    conflictingCues: [],
    unresolvedAlternatives: [],
    supportingReferenceIds: Array.isArray(rawResponse.supportingReferenceIds)
      ? (rawResponse.supportingReferenceIds as string[])
      : [],
    telemetry: {
      totalCostUsd: 0,
      usage: {
        promptTokens: 0,
        cachedPromptTokens: 0,
        cacheWriteTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        isUsageMissing: false,
      },
    },
  };
}
