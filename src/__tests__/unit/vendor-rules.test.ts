import { describe, it, expect } from "vitest";
import { VendorRuleMatcher } from "@/lib/recognition/rules/matcher";
import {
  VendorRuleDefinition,
  VendorData,
  VendorVariantData,
} from "@/lib/recognition/rules/types";

describe("VendorRuleMatcher", () => {
  const sampleVendors: VendorData[] = [
    { id: "v-ami", name: "AMI", code: "AMI", aliases: ["AM-I"] },
    { id: "v-jk", name: "JK", code: "JK", aliases: ["JK-Tech"] },
    { id: "v-gx", name: "GX", code: "GX", aliases: [] },
  ];

  const sampleVariants: VendorVariantData[] = [
    { id: "va-ami-a", vendorId: "v-ami", name: "AMI/A", code: "AMI/A" },
    { id: "va-ami-incell", vendorId: "v-ami", name: "AMI In-cell", code: "AMI-INCELL" },
    { id: "va-ami-oled", vendorId: "v-ami", name: "AMI OLED", code: "AMI-OLED" },
    { id: "va-jk-incell", vendorId: "v-jk", name: "JK In-cell", code: "JK-INCELL" },
  ];

  const sampleRules: VendorRuleDefinition[] = [
    {
      id: "r1",
      vendorId: "v-ami",
      vendorVariantId: "va-ami-a",
      ruleType: "exact_code",
      pattern: "AMI/A",
      priority: 200,
      confidenceWeight: 1.0,
      isActive: true,
    },
    {
      id: "r2",
      vendorId: "v-ami",
      vendorVariantId: "va-ami-a",
      ruleType: "regex",
      pattern: "^AMI[\\/\\-]A$",
      priority: 190,
      confidenceWeight: 0.98,
      isActive: true,
    },
    {
      id: "r3",
      vendorId: "v-ami",
      vendorVariantId: "va-ami-incell",
      ruleType: "normalized_text",
      pattern: "AMI INCELL",
      priority: 180,
      confidenceWeight: 0.95,
      isActive: true,
    },
    {
      id: "r4",
      vendorId: "v-ami",
      vendorVariantId: null,
      ruleType: "alias",
      pattern: "AM-I",
      priority: 100,
      confidenceWeight: 0.85,
      isActive: true,
    },
    {
      id: "r5",
      vendorId: "v-ami",
      vendorVariantId: null,
      ruleType: "exact_code",
      pattern: "AMI",
      priority: 90,
      confidenceWeight: 0.85,
      isActive: true,
    },
    {
      id: "r6",
      vendorId: "v-jk",
      vendorVariantId: "va-jk-incell",
      ruleType: "normalized_text",
      pattern: "JK INCELL",
      priority: 180,
      confidenceWeight: 0.95,
      isActive: true,
    },
  ];

  const matcher = new VendorRuleMatcher(sampleRules, sampleVendors, sampleVariants);

  it("should match exact variant code 'AMI/A'", () => {
    const res = matcher.matchTokens(["821-03200-A", "AMI/A", "QC-PASS"]);
    expect(res.vendorName).toBe("AMI");
    expect(res.vendorVariantName).toBe("AMI/A");
    expect(res.matchStatus).toBe("exact_match");
  });

  it("should match variant via normalized text 'AMI INCELL'", () => {
    const res = matcher.matchTokens(["AMI INCELL", "REV 2.0"]);
    expect(res.vendorName).toBe("AMI");
    expect(res.vendorVariantName).toBe("AMI In-cell");
    expect(res.matchStatus).toBe("exact_match");
  });

  it("should match regex pattern 'AMI-A' to variant 'AMI/A'", () => {
    const res = matcher.matchTokens(["AMI-A", "2024-W12"]);
    expect(res.vendorName).toBe("AMI");
    expect(res.vendorVariantName).toBe("AMI/A");
  });

  it("should identify parent vendor 'AMI' without inventing a variant when only base mark is present", () => {
    const res = matcher.matchTokens(["AMI", "821-00000-A"]);
    expect(res.vendorName).toBe("AMI");
    // CRITICAL: Variant must NOT be hallucinated!
    expect(res.vendorVariantId).toBeNull();
    expect(res.vendorVariantName).toBeNull();
    expect(res.evidenceNotes.some((n) => n.includes("unresolved"))).toBe(true);
  });

  it("should flag unknown markings without inventing a vendor", () => {
    const res = matcher.matchTokens(["XYZ-9999", "UNKNOWN-MARKING"]);
    expect(res.vendorId).toBeNull();
    expect(res.vendorName).toBeNull();
    expect(res.matchStatus).toBe("unknown");
  });

  it("should handle empty or whitespace-only tokens safely", () => {
    const res = matcher.matchTokens(["", "   "]);
    expect(res.matchStatus).toBe("unknown");
    expect(res.vendorId).toBeNull();
  });

  it("should NOT falsely match single-character noise tokens like 'A' or 'M' to 'AMI'", () => {
    // Regression test: Previously patternUpper.includes(token) would match 'A' or 'M' to 'AMI'
    const resA = matcher.matchTokens(["A", "821-00000"]);
    expect(resA.vendorId).toBeNull();
    expect(resA.matchStatus).toBe("unknown");

    const resM = matcher.matchTokens(["M"]);
    expect(resM.vendorId).toBeNull();
    expect(resM.matchStatus).toBe("unknown");
  });

  it("should detect conflicting vendor markings and flag as ambiguous without silently picking one", () => {
    // Both AMI/A and JK INCELL are present
    const res = matcher.matchTokens(["AMI/A", "JK INCELL"]);
    expect(res.matchStatus).toBe("ambiguous");
    expect(res.vendorId).toBeNull();
    expect(res.vendorName).toBeNull();
    expect(res.evidenceNotes.some((n) => n.includes("Conflicting vendor markings detected"))).toBe(true);
  });
});
