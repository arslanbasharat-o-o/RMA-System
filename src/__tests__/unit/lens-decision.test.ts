import { describe, it, expect } from "vitest";
import {
  cleanRawCandidateTitle,
  cleanVisualCandidatesHeuristic,
  cleanVisualCandidatesWithOpenAi,
} from "@/lib/recognition/lens/decision";
import { VisualCandidate } from "@/lib/recognition/lens/types";

describe("Google Lens Visual Candidate Cleaner & OpenAI Decision Engine", () => {
  describe("cleanRawCandidateTitle", () => {
    it("should strip e-commerce, tools, marketplace noise and OEM labels", () => {
      const raw =
        "OEM Apple iPhone 13 Pro OLED Screen Replacement Display Assembly Digitizer Tools eBay Free Shipping";
      const cleaned = cleanRawCandidateTitle(raw);
      expect(cleaned).not.toContain("OEM");
      expect(cleaned).not.toContain("eBay");
      expect(cleaned).not.toContain("Tools");
      expect(cleaned).not.toContain("Free Shipping");
      expect(cleaned).toContain("Apple iPhone 13 Pro");
    });

    it("should strip parentheticals and extra whitespace", () => {
      const raw = "Samsung Galaxy S23 (Phantom Black) (6.1 inch) Replacement Panel";
      const cleaned = cleanRawCandidateTitle(raw);
      expect(cleaned).not.toContain("Phantom Black");
      expect(cleaned).not.toContain("Replacement Panel");
      expect(cleaned).toBe("Samsung Galaxy S23");
    });
  });

  describe("cleanVisualCandidatesHeuristic", () => {
    it("should resolve clean Apple iPhone 13 Pro display decision", () => {
      const candidates: VisualCandidate[] = [
        {
          title: "OEM Apple iPhone 13 Pro OLED Screen Replacement Display Assembly eBay",
          rank: 1,
        },
        {
          title: "Apple iPhone 13 Pro Max Display Touchscreen original refurbished",
          rank: 2,
        },
      ];

      const decision = cleanVisualCandidatesHeuristic(candidates);
      expect(decision.manufacturer).toBe("Apple");
      expect(decision.model).toBe("iPhone 13 Pro");
      expect(decision.displayName).toBe("Apple iPhone 13 Pro Display");
      expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
      expect(decision.cleanedCandidates.length).toBeGreaterThan(0);
      expect(decision.cleanedCandidates[0]).not.toContain("eBay");
    });

    it("should resolve clean Samsung Galaxy S23 display decision", () => {
      const candidates: VisualCandidate[] = [
        {
          title: "Samsung Galaxy S23 SM-S911B AMOLED Display Assembly Replacement with Frame",
          rank: 1,
        },
        {
          title: "Original Galaxy S23 Screen OLED Digitizer",
          rank: 2,
        },
      ];

      const decision = cleanVisualCandidatesHeuristic(candidates);
      expect(decision.manufacturer).toBe("Samsung");
      expect(decision.model).toBe("Galaxy S23");
      expect(decision.displayName).toBe("Samsung Galaxy S23 Display");
      expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("should resolve clean OnePlus 5T display decision from attached catalog style candidates", () => {
      const candidates: VisualCandidate[] = [
        {
          title: "LCD Assembly For One Plus 5T Without Frame (Refurbished)",
          rank: 1,
        },
      ];

      const decision = cleanVisualCandidatesHeuristic(candidates);
      expect(decision.manufacturer).toBe("OnePlus");
      expect(decision.model).toBe("OnePlus 5T");
      expect(decision.displayName).toBe("OnePlus 5T Display");
    });

    it("should resolve Google Pixel 7 correctly", () => {
      const candidates: VisualCandidate[] = [
        {
          title: "Google Pixel 7 Pro AMOLED Screen Replacement Assembly",
          rank: 1,
        },
      ];

      const decision = cleanVisualCandidatesHeuristic(candidates);
      expect(decision.manufacturer).toBe("Google");
      expect(decision.model).toBe("Pixel 7 Pro");
      expect(decision.displayName).toBe("Google Pixel 7 Pro Display");
    });

    it("should handle empty or null candidate arrays gracefully", () => {
      const decision = cleanVisualCandidatesHeuristic([]);
      expect(decision.manufacturer).toBeNull();
      expect(decision.model).toBeNull();
      expect(decision.displayName).toBe("Unidentified Display");
      expect(decision.confidence).toBe(0);
    });

    it("should complete heuristic cleanup in less than 5ms for rapid turnaround", () => {
      const candidates: VisualCandidate[] = [
        { title: "OEM Apple iPhone 14 Pro Screen Replacement eBay", rank: 1 },
        { title: "Apple iPhone 14 Pro Max Display Panel", rank: 2 },
      ];
      const start = Date.now();
      for (let i = 0; i < 50; i++) {
        cleanVisualCandidatesHeuristic(candidates);
      }
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50); // 50 runs in <50ms = <1ms per run
    });
  });

  describe("cleanVisualCandidatesWithOpenAi", () => {
    it("should seamlessly fall back to heuristic when in test mode without throwing", async () => {
      const candidates: VisualCandidate[] = [
        {
          title: "OEM Apple iPhone 13 Pro OLED Screen Replacement Display Assembly",
          rank: 1,
        },
      ];

      const decision = await cleanVisualCandidatesWithOpenAi(candidates, { isMock: true });
      expect(decision.manufacturer).toBe("Apple");
      expect(decision.model).toBe("iPhone 13 Pro");
      expect(decision.displayName).toBe("Apple iPhone 13 Pro Display");
      expect(decision.confidence).toBeGreaterThanOrEqual(0.8);
      expect(decision.reasoning).toBeDefined();
    });
  });
});
