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
  it("uses up to 20 results and favors independent iPhone 14 Plus display listings", () => {
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
    // Keep the candidate set at 20 and ensure later listings are still considered.
    while (candidates.length < 19) {
      const rank = candidates.length + 1;
      candidates.push({ title: `Generic replacement accessory ${rank}`, rank, sourceUrl: `https://noise-${rank}.example/item` });
    }
    candidates.push({ title: "iPhone 15 Plus OLED display assembly", rank: 20, sourceUrl: "https://parts-eight.example/item" });

    const evidence = appleVisualEvidence(candidates);
    expect(evidence?.model).toBe("iPhone 14 Plus");
    expect(evidence?.confidence).toBeLessThan(1);
    expect(evidence?.reasoning).toContain("independent display sources");
    expect(evidence?.reasoning).toContain("accessory");
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
    expect(evidence?.reasoning).toContain("split between");
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
});
