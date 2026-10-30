import { describe, it, expect } from "vitest";
import { VendorRuleMatcher } from "@/lib/recognition/rules/matcher";

describe("Vendor Rule Matching with Stamp Families", () => {
  it("matches Vendor T when stamp is TXPP05-COF and vendor code is TXP06-COF", () => {
    const vendors = [
      {
        id: "vendor-t-id",
        name: "Vendor T",
        code: "TXP06-COF",
        aliases: [],
      },
      {
        id: "vendor-crystal-id",
        name: "Crystal",
        code: "TXPC0926",
        aliases: [],
      },
    ];

    const variants = [
      {
        id: "soft-id",
        vendorId: "vendor-t-id",
        name: "Soft",
        code: "TXP09-S",
        displayTechnology: "Soft OLED",
      },
      {
        id: "hard-id",
        vendorId: "vendor-t-id",
        name: "Hard",
        code: "TXP03-H",
        displayTechnology: "Hard OLED",
      },
      {
        id: "am-id",
        vendorId: "vendor-t-id",
        name: "After Market",
        code: "TXPS09",
        displayTechnology: "AM",
      },
      {
        id: "incell-id",
        vendorId: "vendor-t-id",
        name: "Incell",
        code: "TXP09",
        displayTechnology: "Incell",
      },
    ];

    const matcher = new VendorRuleMatcher([], vendors, variants);

    // Test with the exact stamp from display 3: TXPP05-COF
    const result1 = matcher.matchTokens(["TXPP05-COF"]);
    expect(result1.vendorName).toBe("Vendor T");
    expect(result1.confidenceScore).toBeGreaterThanOrEqual(0.7);

    // Test with TXP05-COF
    const result2 = matcher.matchTokens(["TXP05-COF"]);
    expect(result2.vendorName).toBe("Vendor T");

    // Test with TXP08
    const result3 = matcher.matchTokens(["TXP08"]);
    expect(result3.vendorName).toBe("Vendor T");

    // Test with dot-matrix OCR misread LXPP04-COF (where T was transcribed as L)
    const resultOcrMisread = matcher.matchTokens(["LXPP04-COF"]);
    expect(resultOcrMisread.vendorName).toBe("Vendor T");
    expect(resultOcrMisread.confidenceScore).toBeGreaterThanOrEqual(0.7);

    // Test with dot-matrix OCR misread LKPC9N-COF (where T->L and X->K)
    const resultOcrMisread2 = matcher.matchTokens(["LKPC9N-COF"]);
    expect(resultOcrMisread2.vendorName).toBeDefined();
    expect(["Vendor T", "Crystal"]).toContain(resultOcrMisread2.vendorName);
    expect(resultOcrMisread2.confidenceScore).toBeGreaterThanOrEqual(0.7);

    // Test with exact variant code TXP09
    const result4 = matcher.matchTokens(["TXP09"]);
    expect(result4.vendorName).toBe("Vendor T");
    expect(result4.vendorVariantName).toBe("Incell");
  });
});
