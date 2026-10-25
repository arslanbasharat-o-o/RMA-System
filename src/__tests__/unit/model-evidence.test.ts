import { describe, expect, it } from "vitest";
import { appleVisualEvidence } from "@/lib/recognition/lens/model-evidence";
import type { VisualCandidate } from "@/lib/recognition/lens/types";

function matches(entries: Array<[string, string]>): VisualCandidate[] {
  return entries.map(([title, host], index) => ({
    title,
    sourceUrl: `https://${host}/listing/${index + 1}`,
    rank: index + 1,
  }));
}

describe("ranked Apple display evidence", () => {
  it("considers later independent conflicts across all 30 results despite a larger leading vote", () => {
    const candidates = matches([
      ["LCD assembly for iPhone 14 Plus", "parts-one.example"],
      ["Soft OLED replacement display iPhone 14 Plus", "parts-two.example"],
      ["iPhone 14 Plus screen and digitizer", "parts-three.example"],
      ["iPhone 14 Plus compatible screen", "parts-four.example"],
      ["iPhone 14 Plus LCD assembly", "parts-five.example"],
      ["iPhone 12 Pro display", "other-one.example"],
      ["iPhone 13 Pro Max case", "accessory.example"],
      ["iPhone 14 Plus OLED replacement display", "parts-six.example"],
      ["iPhone 14 Pro Max screen assembly", "other-two.example"],
      ["iPhone 15 Plus screen protector", "protector.example"],
      ["iPhone 15 Plus display assembly", "parts-seven.example"],
    ]);
    // Keep the candidate set at 30 and ensure later listings are still considered.
    while (candidates.length < 29) {
      const rank = candidates.length + 1;
      candidates.push({ title: `Generic replacement accessory ${rank}`, rank, sourceUrl: `https://noise-${rank}.example/item` });
    }
    candidates.push({ title: "iPhone 15 Plus OLED display assembly", rank: 30, sourceUrl: "https://parts-eight.example/item" });

    const evidence = appleVisualEvidence(candidates);
    expect(evidence?.model).toBeNull();
    expect(evidence?.confidence).toBeLessThan(0.5);
    expect(evidence?.reasoning).toContain("iPhone 15 Plus");
    expect(evidence?.reasoning).toContain("independent display listings");
    expect(evidence?.reasoning).toContain("accessory");
    expect(evidence?.reasoning).toContain("top 30 results");
  });

  it("leaves close 14 Plus and 15 Plus evidence unresolved", () => {
    const evidence = appleVisualEvidence(matches([
      ["iPhone 14 Plus replacement display", "fourteen-a.example"],
      ["iPhone 15 Plus OLED screen", "fifteen-a.example"],
      ["iPhone 14 Plus LCD assembly", "fourteen-b.example"],
      ["iPhone 15 Plus display assembly", "fifteen-b.example"],
      ["iPhone 14 Plus touch display", "fourteen-c.example"],
      ["iPhone 15 Plus screen replacement", "fifteen-c.example"],
    ]));
    expect(evidence?.model).toBeNull();
    expect(evidence?.confidence).toBeLessThan(0.5);
    expect(evidence?.reasoning).toContain("disagree between");
  });

  it("does not count a single marketplace as multiple independent sources", () => {
    const evidence = appleVisualEvidence(matches([
      ["iPhone 14 Plus LCD display assembly", "marketplace.example"],
      ["iPhone 14 Plus OLED replacement screen", "marketplace.example"],
      ["iPhone 14 Plus display panel", "marketplace.example"],
    ]));
    expect(evidence?.model).toBeNull();
    expect(evidence?.confidence).toBeLessThan(0.5);
    expect(evidence?.reasoning).toContain("1 independent display source(s)");
  });

  it("counts one publisher once per model instead of erasing its different-model listing", () => {
    const evidence = appleVisualEvidence(matches([
      ["iPhone 14 Pro Max OLED display assembly", "ifixit.com"],
      ["iPhone 13 Pro Max OLED display assembly", "ifixit.com"],
      ["iPhone 13 Pro Max replacement screen", "mobile-sentrix.example"],
      ["iPhone 13 Pro Max display panel", "fixez.example"],
      ["iPhone 13 Pro Max screen assembly", "injured-gadgets.example"],
    ]));

    expect(evidence?.model).toBe("iPhone 13 Pro Max");
    expect(evidence?.confidence).toBeGreaterThan(0.5);
    expect(evidence?.reasoning).toContain("4 independent display sources");
  });

  it("does not treat matching titles without attributable listing URLs as independent evidence", () => {
    const evidence = appleVisualEvidence([
      { title: "iPhone 14 Plus LCD display", rank: 1 },
      { title: "iPhone 14 Plus OLED replacement screen", rank: 2 },
      { title: "iPhone 14 Plus display assembly", rank: 3 },
    ]);
    expect(evidence?.model).toBeNull();
    expect(evidence?.confidence).toBeLessThan(0.5);
    expect(evidence?.reasoning).toContain("unattributed results ignored");
  });

  it("uses Google Lens publisher labels when result links redirect through Google", () => {
    const evidence = appleVisualEvidence([
      { title: "iPhone 15 Pro OLED display assembly", sourceUrl: "https://www.google.com/search?q=listing-1", sourceName: "MobileSentrix", rank: 1 },
      { title: "iPhone 15 Pro LCD replacement screen", sourceUrl: "https://www.google.com/search?q=listing-2", sourceName: "Fixez", rank: 2 },
      { title: "iPhone 15 Pro display assembly", sourceUrl: "https://www.google.com/search?q=listing-3", sourceName: "Spares Nordic", rank: 3 },
    ]);
    expect(evidence?.model).toBe("iPhone 15 Pro");
    expect(evidence?.confidence).toBeLessThan(1);
    expect(evidence?.reasoning).toContain("3 independent display sources");
  });

  it("collapses country-specific publisher labels and rejects Google as a source", () => {
    const sameMarketplace = appleVisualEvidence([
      { title: "iPhone 14 Plus LCD display assembly", sourceUrl: "https://www.google.com/search?q=a", sourceName: "Amazon.com", rank: 1 },
      { title: "iPhone 14 Plus OLED replacement screen", sourceUrl: "https://www.google.com/search?q=b", sourceName: "Amazon.ae", rank: 2 },
      { title: "iPhone 14 Plus display panel", sourceUrl: "https://www.google.com/search?q=c", sourceName: "Amazon", rank: 3 },
    ]);
    expect(sameMarketplace?.model).toBeNull();
    expect(sameMarketplace?.reasoning).toContain("1 independent display source(s)");

    const googleOnly = appleVisualEvidence([
      { title: "iPhone 14 Plus LCD display assembly", sourceUrl: "https://www.google.com/search?q=a", sourceName: "Google", rank: 1 },
      { title: "iPhone 14 Plus OLED replacement screen", sourceUrl: "https://www.google.com/search?q=b", sourceName: "Google Lens", rank: 2 },
      { title: "iPhone 14 Plus display panel", sourceUrl: "https://www.google.com/search?q=c", sourceName: "Google Search", rank: 3 },
    ]);
    expect(googleOnly?.model).toBeNull();
    expect(googleOnly?.reasoning).toContain("unattributed results ignored");
  });

  it("ignores mixed compatibility listings and accessories", () => {
    const evidence = appleVisualEvidence(matches([
      ["iPhone 14 Plus / iPhone 15 Plus compatible replacement screen", "mixed.example"],
      ["iPhone 15 Plus case and screen protector", "accessory.example"],
      ["iPhone 14 Plus screen assembly", "one.example"],
      ["iPhone 14 Plus OLED display", "two.example"],
      ["iPhone 14 Plus LCD replacement screen", "three.example"],
    ]));
    expect(evidence?.model).toBe("iPhone 14 Plus");
    expect(evidence?.confidence).toBeGreaterThan(0.5);
    expect(evidence?.reasoning).toContain("mixed-model");
  });

  it("uses an exact AI Overview as corroboration when independent listings already agree", () => {
    const evidence = appleVisualEvidence(matches([
      ["iPhone 14 Plus LCD display assembly", "fourteen-a.example"],
      ["iPhone 14 Plus OLED replacement screen", "fourteen-b.example"],
      ["iPhone 14 Plus display panel", "fourteen-c.example"],
    ]), "The image shows an iPhone 14 Plus replacement display.");

    expect(evidence?.model).toBe("iPhone 14 Plus");
    expect(evidence?.reasoning).toContain("AI Overview names the same exact model");
  });

  it("does not let a conflicting exact AI Overview overrule listing consensus", () => {
    const evidence = appleVisualEvidence(matches([
      ["iPhone 14 Plus LCD display assembly", "fourteen-a.example"],
      ["iPhone 14 Plus OLED replacement screen", "fourteen-b.example"],
      ["iPhone 14 Plus display panel", "fourteen-c.example"],
    ]), "This is an iPhone 15 Plus display assembly.");

    expect(evidence?.model).toBeNull();
    expect(evidence?.confidence).toBeLessThan(0.5);
    expect(evidence?.reasoning).toContain("evidence conflicts");
  });

  it("requires review when an unhedged AI Overview names multiple model variants", () => {
    const evidence = appleVisualEvidence(matches([
      ["iPhone 14 Plus LCD display assembly", "fourteen-a.example"],
      ["iPhone 14 Plus OLED replacement screen", "fourteen-b.example"],
      ["iPhone 14 Plus display panel", "fourteen-c.example"],
    ]), "The image shows an iPhone 14 Plus or iPhone 15 Plus display.");

    expect(evidence?.model).toBeNull();
    expect(evidence?.confidence).toBeLessThan(0.5);
    expect(evidence?.reasoning).toContain("names multiple models");
  });

  it("does not let a hedged AI Overview choose a close model variant", () => {
    const evidence = appleVisualEvidence(matches([
      ["iPhone 14 Plus LCD display assembly", "fourteen-a.example"],
      ["iPhone 14 Plus OLED replacement screen", "fourteen-b.example"],
      ["iPhone 14 Plus display panel", "fourteen-c.example"],
    ]), "This may be for an iPhone 15 Plus or a similar compatible model.");

    expect(evidence?.model).toBe("iPhone 14 Plus");
    expect(evidence?.reasoning).toContain("hedged wording");
  });

  it("keeps an AI Overview suggestion unresolved without independent listing corroboration", () => {
    const evidence = appleVisualEvidence([
      { title: "iPhone 14 Plus display panel", rank: 1 },
    ], "This is an iPhone 14 Plus display.");

    expect(evidence?.model).toBeNull();
    expect(evidence?.confidence).toBeLessThan(0.5);
    expect(evidence?.reasoning).toContain("no attributable listing evidence confirms");
  });
});
