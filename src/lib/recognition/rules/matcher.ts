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
    this.vendors = new Map(vendors.map((v) => [v.id, v]));
    this.variants = new Map(variants.map((va) => [va.id, va]));

    // Synthesize rules for any vendor / variant codes that don't have explicit rules
    const synthesized: VendorRuleDefinition[] = [...rules.filter((r) => r.isActive)];
    const existingRuleKeys = new Set(
      synthesized.map((r) => `${r.vendorId}:${r.pattern.toUpperCase()}`)
    );

    for (const v of vendors) {
      const codeUpper = v.code.toUpperCase();
      if (!existingRuleKeys.has(`${v.id}:${codeUpper}`)) {
        synthesized.push({
          id: `synth-${v.id}-${codeUpper}`,
          vendorId: v.id,
          vendorVariantId: null,
          ruleType: "exact_code",
          pattern: codeUpper,
          priority: 200,
          confidenceWeight: 1.0,
          isActive: true,
        });
        synthesized.push({
          id: `synth-stamp-${v.id}-${codeUpper}`,
          vendorId: v.id,
          vendorVariantId: null,
          ruleType: "stamp_pattern",
          pattern: codeUpper,
          priority: 180,
          confidenceWeight: 0.95,
          isActive: true,
        });
        existingRuleKeys.add(`${v.id}:${codeUpper}`);
      }

      // Auto-synthesize prefix stamp rule for code families (e.g. "TXP" from "TXP06-COF", "TXP09", "TXP-08")
      const alphaPrefixMatch = codeUpper.match(/^([A-Z]{3,6})/);
      if (alphaPrefixMatch) {
        const prefix = alphaPrefixMatch[1];
        if (!existingRuleKeys.has(`${v.id}:${prefix}`)) {
          synthesized.push({
            id: `synth-prefix-${v.id}-${prefix}`,
            vendorId: v.id,
            vendorVariantId: null,
            ruleType: "stamp_pattern",
            pattern: prefix,
            priority: 160 + prefix.length * 5,
            confidenceWeight: 0.9,
            isActive: true,
          });
          existingRuleKeys.add(`${v.id}:${prefix}`);
        }
      }

      for (const alias of v.aliases || []) {
        const aliasUpper = alias.toUpperCase();
        if (!existingRuleKeys.has(`${v.id}:${aliasUpper}`)) {
          synthesized.push({
            id: `synth-${v.id}-${aliasUpper}`,
            vendorId: v.id,
            vendorVariantId: null,
            ruleType: "exact_code",
            pattern: aliasUpper,
            priority: 195,
            confidenceWeight: 1.0,
            isActive: true,
          });
          synthesized.push({
            id: `synth-stamp-${v.id}-${aliasUpper}`,
            vendorId: v.id,
            vendorVariantId: null,
            ruleType: "stamp_pattern",
            pattern: aliasUpper,
            priority: 175,
            confidenceWeight: 0.95,
            isActive: true,
          });
          existingRuleKeys.add(`${v.id}:${aliasUpper}`);
        }
      }
    }

    for (const va of variants) {
      const vaCodeUpper = va.code.toUpperCase();
      if (!existingRuleKeys.has(`${va.vendorId}:${vaCodeUpper}`)) {
        synthesized.push({
          id: `synth-va-${va.id}-${vaCodeUpper}`,
          vendorId: va.vendorId,
          vendorVariantId: va.id,
          ruleType: "exact_code",
          pattern: vaCodeUpper,
          priority: 210,
          confidenceWeight: 1.0,
          isActive: true,
        });
        existingRuleKeys.add(`${va.vendorId}:${vaCodeUpper}`);
      }
    }

    // Sort rules by priority descending
    this.rules = synthesized.sort((a, b) => b.priority - a.priority);
  }

  public matchTokens(extractedTokens: string[]): VendorMatchResult {
    const evidenceNotes: string[] = [];
    const expandedTokens = new Set<string>();

    for (const raw of extractedTokens) {
      if (!raw || typeof raw !== "string") continue;
      const upper = raw.trim().toUpperCase();
      if (!upper) continue;
      expandedTokens.add(upper);

      // Add alphanumeric stripped token (e.g. "TXP-09" -> "TXP09", "TXP 09" -> "TXP09")
      const stripped = upper.replace(/[^A-Z0-9]/g, "");
      if (stripped && stripped !== upper) {
        expandedTokens.add(stripped);
      }

      // Dot-matrix hardware stamp OCR confusion normalization:
      // On brushed metal display shields, the crossbar of 'T' in 'TXP'/'TXPP' is often truncated or faded,
      // and diagonal strokes of 'X' can be segmented, leading OCR engines to transcribe 'LXPP', 'LXP', 'LKPP', or 'LKPC'.
      if (/^L[KX]/i.test(upper)) {
        expandedTokens.add(upper.replace(/^L[KX]/i, "TX"));
      }
      if (stripped && /^L[KX]/i.test(stripped)) {
        expandedTokens.add(stripped.replace(/^L[KX]/i, "TX"));
      }

      // Split words/sub-tokens (e.g. "QC TXP09 PASS" -> "QC", "TXP09", "PASS")
      const parts = upper.split(/[\s,;:|/\-_()[\]{}]+/).filter((p) => p.length >= 2);
      for (const p of parts) {
        expandedTokens.add(p);
        const pStripped = p.replace(/[^A-Z0-9]/g, "");
        if (pStripped && pStripped !== p) {
          expandedTokens.add(pStripped);
        }

        // Dot-matrix hardware stamp OCR confusion normalization for sub-tokens:
        if (/^L[KX]/i.test(pStripped)) {
          const tVariant = pStripped.replace(/^L[KX]/i, "TX");
          expandedTokens.add(tVariant);
          const tAlpha = tVariant.match(/^([A-Z]{3,6})/);
          if (tAlpha) {
            expandedTokens.add(tAlpha[1]);
            if (tAlpha[1].length === 4 && (tAlpha[1].endsWith("P") || tAlpha[1].startsWith("TXP"))) {
              expandedTokens.add(tAlpha[1].slice(0, 3));
            }
          }
        }

        // Extract alpha prefix from sub-token (e.g. "TXPP05" -> "TXPP", "TXP05" -> "TXP")
        const partAlpha = pStripped.match(/^([A-Z]{3,6})/);
        if (partAlpha) {
          expandedTokens.add(partAlpha[1]);
          // For 4-letter prefixes like TXPP / TXPC / TXPS, also add the 3-letter root TXP
          if (partAlpha[1].length === 4 && (partAlpha[1].endsWith("P") || partAlpha[1].startsWith("TXP"))) {
            expandedTokens.add(partAlpha[1].slice(0, 3));
          }
        }
      }
    }

    const normalizedTokens = Array.from(expandedTokens);

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
      const cleanPattern = patternUpper.replace(/[^A-Z0-9]/g, "");

      for (const token of normalizedTokens) {
        const cleanToken = token.replace(/[^A-Z0-9]/g, "");
        let isMatch = false;

        switch (rule.ruleType) {
          case "exact_code":
            isMatch =
              token === patternUpper ||
              (cleanPattern.length >= 2 && cleanToken === cleanPattern);
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
            isMatch =
              (cleanPattern.length >= 2 && cleanToken.includes(cleanPattern)) ||
              token.includes(patternUpper);
            break;
          }

          case "alias":
          case "stamp_pattern": {
            if (
              token === patternUpper ||
              (cleanPattern.length >= 2 && cleanToken === cleanPattern)
            ) {
              isMatch = true;
            } else if (cleanPattern.length >= 2 && cleanToken.includes(cleanPattern)) {
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

    // Find the highest-scoring alternative belonging to a DIFFERENT parent vendor.
    // Exclude alternatives whose matched pattern is merely a shorter substring/prefix of the winning pattern
    // (e.g. 3-character root 'TXP' should never conflict with 4-character specific code 'TXPC').
    const conflictingAlternative = alternatives.find((alt) => {
      if (alt.vendorId === topVendor.id) return false;
      const altMatch = matches.find((m) => m.rule.vendorId === alt.vendorId);
      if (altMatch && topMatch.rule.pattern && altMatch.rule.pattern) {
        const topPat = topMatch.rule.pattern.toUpperCase();
        const altPat = altMatch.rule.pattern.toUpperCase();
        if (topPat.startsWith(altPat) && topPat.length > altPat.length) {
          return false;
        }
      }
      return true;
    });

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
