import {
  VendorRuleDefinition,
  VendorData,
  VendorVariantData,
  VendorMatchResult,
} from "./types";

export class VendorRuleMatcher {
  private rules: VendorRuleDefinition[];
  private vendors: Map<string, VendorData>;
  private variants: Map<string, VendorVariantData>;

  constructor(
    rules: VendorRuleDefinition[],
    vendors: VendorData[],
    variants: VendorVariantData[]
  ) {
    // Sort rules by priority descending
    this.rules = [...rules].filter((r) => r.isActive).sort((a, b) => b.priority - a.priority);
    this.vendors = new Map(vendors.map((v) => [v.id, v]));
    this.variants = new Map(variants.map((va) => [va.id, va]));
  }

  public matchTokens(extractedTokens: string[]): VendorMatchResult {
    const evidenceNotes: string[] = [];
    const normalizedTokens = extractedTokens
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);

    if (normalizedTokens.length === 0) {
      return {
        vendorId: null,
        vendorName: null,
        vendorVariantId: null,
        vendorVariantName: null,
        matchedRuleId: null,
        matchedPattern: null,
        confidenceScore: 0,
        matchStatus: "unknown",
        evidenceNotes: [],
        candidateAlternatives: [],
      };
    }

    interface EvaluatedMatch {
      rule: VendorRuleDefinition;
      token: string;
      score: number;
    }

    const matches: EvaluatedMatch[] = [];

    for (const rule of this.rules) {
      const patternUpper = rule.pattern.trim().toUpperCase();

      for (const token of normalizedTokens) {
        let isMatch = false;

        switch (rule.ruleType) {
          case "exact_code":
            isMatch = token === patternUpper;
            break;

          case "regex":
            try {
              const regex = new RegExp(rule.pattern, "i");
              isMatch = regex.test(token);
            } catch {
              // Invalid regex ignored
            }
            break;

          case "normalized_text": {
            const cleanToken = token.replace(/[^A-Z0-9]/g, "");
            const cleanPattern = patternUpper.replace(/[^A-Z0-9]/g, "");
            isMatch =
              cleanToken.includes(cleanPattern) ||
              token.includes(patternUpper);
            break;
          }

          case "alias":
          case "stamp_pattern": {
            if (token === patternUpper) {
              isMatch = true;
            } else if (token.length > patternUpper.length && patternUpper.length >= 2) {
              const escaped = patternUpper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const boundRegex = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`);
              isMatch = boundRegex.test(token);
            }
            break;
          }
        }

        if (isMatch) {
          const score = rule.priority * rule.confidenceWeight;
          matches.push({ rule, token, score });
          break; // move to next rule once matched for this token
        }
      }
    }

    if (matches.length === 0) {
      return {
        vendorId: null,
        vendorName: null,
        vendorVariantId: null,
        vendorVariantName: null,
        matchedRuleId: null,
        matchedPattern: null,
        confidenceScore: 0,
        matchStatus: "unknown",
        evidenceNotes: [],
        candidateAlternatives: [],
      };
    }

    // Sort evaluated matches by score descending
    matches.sort((a, b) => b.score - a.score);

    // Group alternatives by unique vendor/variant combinations
    const alternatives: Array<{
      vendorId: string;
      vendorName: string;
      variantId?: string | null;
      variantName?: string | null;
      score: number;
    }> = [];

    const seenCombos = new Set<string>();

    for (const m of matches) {
      const v = this.vendors.get(m.rule.vendorId);
      if (!v) continue;

      const va = m.rule.vendorVariantId
        ? this.variants.get(m.rule.vendorVariantId)
        : null;

      const key = `${v.id}:${va?.id || "none"}`;
      if (!seenCombos.has(key)) {
        seenCombos.add(key);
        alternatives.push({
          vendorId: v.id,
          vendorName: v.name,
          variantId: va?.id || null,
          variantName: va?.name || null,
          score: m.score,
        });
      }
    }

    // Check for conflict/ambiguity between different parent vendors
    const topMatch = matches[0];
    const topVendor = this.vendors.get(topMatch.rule.vendorId);

    if (!topVendor) {
      return {
        vendorId: null,
        vendorName: null,
        vendorVariantId: null,
        vendorVariantName: null,
        matchedRuleId: null,
        matchedPattern: null,
        confidenceScore: 0,
        matchStatus: "unknown",
        evidenceNotes: ["Top matched rule pointed to missing vendor."],
        candidateAlternatives: [],
      };
    }

    // Find the highest-scoring alternative belonging to a DIFFERENT parent vendor
    const conflictingAlternative = alternatives.find(
      (alt) => alt.vendorId !== topVendor.id
    );

    // If conflicting vendor exists with significant score, surface ambiguity without silently choosing
    if (
      conflictingAlternative &&
      (conflictingAlternative.score === topMatch.score ||
        (conflictingAlternative.score >= 140 && topMatch.score >= 140) ||
        conflictingAlternative.score >= topMatch.score * 0.85)
    ) {
      evidenceNotes.push(
        `Conflicting vendor markings detected: '${topVendor.name}' (Score: ${topMatch.score}) and '${conflictingAlternative.vendorName}' (Score: ${conflictingAlternative.score}). Manual review required.`
      );
      return {
        vendorId: null,
        vendorName: null,
        vendorVariantId: null,
        vendorVariantName: null,
        matchedRuleId: topMatch.rule.id,
        matchedPattern: topMatch.rule.pattern,
        confidenceScore: 0.5,
        matchStatus: "ambiguous",
        evidenceNotes,
        candidateAlternatives: alternatives,
      };
    }

    const topVariant = topMatch.rule.vendorVariantId
      ? this.variants.get(topMatch.rule.vendorVariantId)
      : null;

    const normalizedScore = Math.min(topMatch.score / 200, 1.0);
    const matchStatus =
      topMatch.rule.priority >= 180 && topMatch.rule.confidenceWeight >= 0.95
        ? "exact_match"
        : "strong_candidate";

    evidenceNotes.push(
      `Matched token '${topMatch.token}' with rule pattern '${topMatch.rule.pattern}' (Priority: ${topMatch.rule.priority}).`
    );

    if (!topVariant) {
      evidenceNotes.push(
        `Vendor '${topVendor.name}' confirmed, but specific variant marking is absent or unresolved. Human review recommended.`
      );
    } else {
      evidenceNotes.push(
        `Variant resolved to '${topVariant.name}' (Code: ${topVariant.code}).`
      );
    }

    return {
      vendorId: topVendor.id,
      vendorName: topVendor.name,
      vendorVariantId: topVariant?.id || null,
      vendorVariantName: topVariant?.name || null,
      matchedRuleId: topMatch.rule.id,
      matchedPattern: topMatch.rule.pattern,
      confidenceScore: normalizedScore,
      matchStatus,
      evidenceNotes,
      candidateAlternatives: alternatives,
    };
  }
}
