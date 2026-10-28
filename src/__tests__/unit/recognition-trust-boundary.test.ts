import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanVisualCandidatesHeuristic, cleanVisualCandidatesWithOpenAi } from "@/lib/recognition/lens/decision";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class {
  chat = { completions: { create } };
} }));

const candidates = ["one.test", "two.test", "three.test", "four.test"].map((host, i) => ({
  title: "iPhone 15 Pro Max OLED display assembly", sourceUrl: `https://${host}/display`, rank: i + 1,
}));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function online() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("OPENAI_API_KEY", "unit-placeholder-credential");
}

describe("recognition evidence trust boundary", () => {
  it("does not let a larger Pro vote erase an attributable Pro Max listing", () => {
    const dominant = [...candidates, ...candidates.map((c, i) => ({ ...c,
      sourceUrl: `https://extra-${i}.test/display`, rank: i + 5,
    }))].map(c => ({ ...c, title: "iPhone 15 Pro OLED display assembly" }));
    const result = cleanVisualCandidatesHeuristic([...dominant, {
      title: "iPhone 15 Pro Max Soft OLED display assembly", sourceUrl: "https://max-source.test/display", rank: 9,
    }]);
    expect(result.model).toBeNull();
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.reasoning).toContain("larger vote");
  });

  it("retains variant conflicts hidden behind publisher deduplication", () => {
    const result = cleanVisualCandidatesHeuristic([
      ...candidates.map(c => ({ ...c, title: "iPhone 15 Pro OLED display assembly" })),
      { title: "iPhone 15 Pro Max OLED display assembly", sourceUrl: candidates[0].sourceUrl, rank: 9 },
    ]);
    expect(result.model).toBeNull();
    expect(result.confidence).toBeLessThan(0.5);
  });
  it("does not count publisher subdomains as independent evidence", () => {
    const result = cleanVisualCandidatesHeuristic(candidates.map((c, i) => ({
      ...c, sourceUrl: `https://shop${i}.same-publisher.test/display`,
    })));
    expect(result.model).toBeNull();
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("does not mark conflicting Galaxy variants confident", () => {
    const result = cleanVisualCandidatesHeuristic(candidates.map((c, i) => ({
      ...c, title: i % 2 ? "Samsung Galaxy S21 display" : "Samsung Galaxy S21 Ultra display",
    })));
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("retains an exact Galaxy variant backed by independent listings", () => {
    const result = cleanVisualCandidatesHeuristic(candidates.map(c => ({
      ...c, title: "Samsung Galaxy S21 Ultra display assembly",
    })));
    expect(result.model).toBe("Galaxy S21 ULTRA");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("preserves a trailing plus sign as a separate Galaxy variant", () => {
    const result = cleanVisualCandidatesHeuristic(candidates.map(c => ({
      ...c, title: "Samsung Galaxy S23+ display assembly",
    })));
    expect(result.model).toBe("Galaxy S23 +");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    const split = cleanVisualCandidatesHeuristic(candidates.map((c, i) => ({
      ...c, title: i % 2 ? "Samsung Galaxy S23 display" : "Samsung Galaxy S23+ display",
    })));
    expect(split.confidence).toBeLessThan(0.5);
  });
  it("does not disclose filenames or accept an AI model variant that conflicts with sources", async () => {
    online();
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      manufacturer: "Apple", model: "iPhone 8", displayName: "Apple iPhone 8 White Display", confidence: 0.99,
      reasoning: "The photograph appears to show another assembly.",
    }) } }] });
    const result = await cleanVisualCandidatesWithOpenAi(candidates, {
      filename: "PRIVATE_CUSTOMER_iPhone_8_White.jpg", imageBuffer: Buffer.from("photo"), mimeType: "image/jpeg",
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain("PRIVATE_CUSTOMER");
    expect(result.model).toBeNull();
    expect(result.displayName).not.toContain("iPhone 8");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("does not let AI convert split Pro/Pro Max evidence into a confident identity", async () => {
    online();
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      manufacturer: "Apple", model: "iPhone 15 Pro", displayName: "Apple iPhone 15 Pro Display", confidence: 0.99,
    }) } }] });
    const result = await cleanVisualCandidatesWithOpenAi(candidates.map((c, i) => ({
      ...c, title: i % 2 ? "iPhone 15 Pro screen assembly" : c.title,
    })), { imageBuffer: Buffer.from("photo"), filename: "iPhone_15_Pro.jpg" });
    expect(result.model).toBeNull();
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("retains source-based scores when the image corroborates the exact variant", async () => {
    online();
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      manufacturer: "Apple", model: "iPhone 15 Pro Max", confidence: 1,
    }) } }] });
    const result = await cleanVisualCandidatesWithOpenAi(candidates, { imageBuffer: Buffer.from("photo") });
    expect(result.model).toBe("iPhone 15 Pro Max");
    expect(result.confidence).toBeLessThan(1);
  });

  it("requires review when configured photo corroboration fails", async () => {
    online(); create.mockRejectedValue(new Error("provider timeout"));
    const result = await cleanVisualCandidatesWithOpenAi(candidates, { imageBuffer: Buffer.from("photo") });
    expect(result.model).toBeNull();
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("aborts in-flight photo corroboration when the owning recognition request expires", async () => {
    online();
    const controller = new AbortController();
    create.mockImplementation((_body, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const pending = cleanVisualCandidatesWithOpenAi(candidates, {
      imageBuffer: Buffer.from("photo"), signal: controller.signal,
    });
    controller.abort();
    const result = await pending;
    expect(result.model).toBeNull();
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("clarifies suggestedModel and displayName when AI vision inspects ambiguous 15 Pro vs 16 Pro listings", async () => {
    online();
    create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            manufacturer: "Apple",
            model: "iPhone 16 Pro",
            confidence: 0.95,
            reasoning: "Dynamic Island proportions, ultra-slim bezel geometry, and flex markings match iPhone 16 Pro.",
          }),
        },
      }],
    });
    const mixedCandidates = [
      { title: "OEM Apple iPhone 15 Pro OLED Display Screen", sourceUrl: "https://shop1.test/display", rank: 1 },
      { title: "Apple iPhone 15 Pro Max Screen Replacement", sourceUrl: "https://shop2.test/display", rank: 2 },
      { title: "Apple iPhone 16 Pro OLED Assembly", sourceUrl: "https://shop3.test/display", rank: 3 },
    ];
    const result = await cleanVisualCandidatesWithOpenAi(mixedCandidates, {
      imageBuffer: Buffer.from("photo"),
      partNumbers: ["17399-TH29-6XR5"],
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.model).toBeNull(); // Trust boundary: split candidates require review
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.suggestedModel).toBe("iPhone 16 Pro");
    expect(result.displayName).toBe("Apple iPhone 16 Pro Display");
    expect(result.reasoning).toContain("Dynamic Island proportions");
  });

  it("clarifies suggestedModel for Samsung devices when candidate listings are low confidence", async () => {
    online();
    create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            manufacturer: "Samsung",
            model: "Galaxy Note 20 Ultra",
            confidence: 0.92,
            reasoning: "Sharp 90-degree rectangle corners and NTM flex marking confirm Galaxy Note 20 Ultra.",
          }),
        },
      }],
    });
    const samsungCandidates = [
      { title: "Samsung Galaxy S22 Ultra OLED Screen Assembly", sourceUrl: "https://parts1.test/item", rank: 1 },
      { title: "Samsung Galaxy Note 20 Ultra Display Replacement", sourceUrl: "https://parts2.test/item", rank: 2 },
    ];
    const result = await cleanVisualCandidatesWithOpenAi(samsungCandidates, {
      imageBuffer: Buffer.from("photo"),
      ocrText: ["SX678NTM28U"],
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.model).toBeNull();
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.suggestedModel).toBe("Galaxy Note 20 Ultra");
    expect(result.displayName).toBe("Samsung Galaxy Note 20 Ultra Display");
    expect(result.reasoning).toContain("Sharp 90-degree rectangle corners");
  });
});
