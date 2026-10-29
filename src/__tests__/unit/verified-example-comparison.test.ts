import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

import { OpenAiVisionOcrService } from "@/lib/recognition/openai/vision";

const originalTestLiveAi = process.env.TEST_LIVE_AI;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

async function syntheticDisplayPhoto() {
  return sharp({
    create: { width: 300, height: 500, channels: 3, background: { r: 90, g: 110, b: 130 } },
  }).jpeg().toBuffer();
}

describe("verified display visual comparison", () => {
  beforeEach(() => {
    process.env.TEST_LIVE_AI = "true";
    process.env.OPENAI_API_KEY = "unit-test-key";
    mockCreate.mockReset();
  });

  afterEach(() => {
    if (originalTestLiveAi === undefined) delete process.env.TEST_LIVE_AI;
    else process.env.TEST_LIVE_AI = originalTestLiveAi;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it("compares like-angled target crops to verified candidates and accepts only a supplied model", async () => {
    const imageBuffer = await syntheticDisplayPhoto();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        selected_catalog_display_id: "model-a",
        confidence: 0.94,
        matching_cues: ["notch shape", "connector layout"],
        conflicting_cues: [],
      }) } }],
    });

    const service = new OpenAiVisionOcrService("unit-test-key", "gpt-4o-mini");
    const result = await service.compareToVerifiedExamples(
      [
        { imageBuffer, imageType: "primary" },
        { imageBuffer, imageType: "flex_cable" },
      ],
      [
        {
          itemId: "verified-a",
          catalogDisplayId: "model-a",
          label: "Apple iPhone 13",
          images: [
            { imageBuffer, imageType: "front" },
            { imageBuffer, imageType: "back" },
          ],
        },
        {
          itemId: "verified-b",
          catalogDisplayId: "model-b",
          label: "Apple iPhone 13 Pro",
          images: [{ imageBuffer, imageType: "front" }],
        },
      ]
    );

    expect(result).toMatchObject({
      selectedCatalogDisplayId: "model-a",
      confidence: 0.94,
      matchingCues: ["notch shape", "connector layout"],
      conflictingCues: [],
      model: "gpt-4o-mini",
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const request = mockCreate.mock.calls[0][0] as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const visibleLabels = request.messages[1].content
      .filter((part) => part.type === "text")
      .map((part) => part.text || "");
    expect(visibleLabels).toContain("New display photo angle: front view.");
    expect(visibleLabels).toContain("Focused crop: front camera notch and top edge.");
    expect(visibleLabels).toContain("Focused crop: flex cable and printed code close-up.");
    expect(visibleLabels).toContain("Focused crop: back-view top edge and sensor cutouts.");
    for (const part of request.messages[1].content) {
      if (part.type === "image_url") expect(part).toHaveProperty("image_url.detail", "high");
    }
    expect(visibleLabels).toContain("Human-verified reference model-a: Apple iPhone 13. Compare its physical geometry to the new display.");
  });

  it("rejects an output model outside the supplied verified candidates", async () => {
    const imageBuffer = await syntheticDisplayPhoto();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        selected_catalog_display_id: "unsupplied-model",
        confidence: 0.99,
        matching_cues: [],
        conflicting_cues: [],
      }) } }],
    });

    const service = new OpenAiVisionOcrService("unit-test-key", "gpt-4o-mini");
    const result = await service.compareToVerifiedExamples(
      [{ imageBuffer, imageType: "primary" }],
      [
        { itemId: "a", catalogDisplayId: "model-a", label: "Model A", images: [{ imageBuffer, imageType: "front" }] },
        { itemId: "b", catalogDisplayId: "model-b", label: "Model B", images: [{ imageBuffer, imageType: "front" }] },
      ]
    );

    expect(result.selectedCatalogDisplayId).toBeNull();
    expect(result.error).toContain("Invalid verified-example comparison response");
  });

  it("reserves reasoning tokens for reference models and bounds retries", async () => {
    const imageBuffer = await syntheticDisplayPhoto();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      selected_catalog_display_id: "none", confidence: 0.2, matching_cues: [], conflicting_cues: [],
    }) } }] });
    await new OpenAiVisionOcrService("unit-test-key", "gpt-6.1-sol", 120000).compareToVerifiedExamples(
      [{ imageBuffer, imageType: "back" }],
      [
        { itemId: "a", catalogDisplayId: "a", label: "A", images: [{ imageBuffer, imageType: "back" }] },
        { itemId: "b", catalogDisplayId: "b", label: "B", images: [{ imageBuffer, imageType: "back" }] },
      ]
    );
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ model: "gpt-6.1-sol", max_completion_tokens: 8000, reasoning_effort: "medium" });
    expect(mockCreate.mock.calls[0][1]).toEqual({ timeout: 120000, maxRetries: 1 });
  });

  it("uses a compact low-effort shortlist for discovery and keeps final detail", async () => {
    const imageBuffer = await syntheticDisplayPhoto();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      selected_catalog_display_id: "a", confidence: 0.9,
    }) } }] });
    const readable = [
      { itemId: "a", catalogDisplayId: "a", label: "A", images: [{ imageBuffer, imageType: "back" }] },
      { itemId: "b", catalogDisplayId: "b", label: "B", images: [{ imageBuffer, imageType: "back" }] },
    ];
    const discovery = await new OpenAiVisionOcrService("unit-test-key", "gpt-6.1-sol", 120000)
      .compareToVerifiedExamples([{ imageBuffer, imageType: "back" }], readable, [], { mode: "discovery" });
    expect(discovery.selectedCatalogDisplayId).toBe("a");
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      max_completion_tokens: 3000, reasoning_effort: "low",
      response_format: { json_schema: { name: "verified_display_shortlist" } },
    });
    const discoveryRequest = mockCreate.mock.calls[0][0] as {
      messages: Array<{ content: Array<{ type: string; text?: string; image_url?: { detail?: string } }> }>;
    };
    const discoveryImages = discoveryRequest.messages[1].content
      .filter((part) => part.type === "image_url");
    expect(discoveryImages.some((part) => part.image_url?.detail === "low")).toBe(true);
    expect(discoveryImages.some((part) => part.image_url?.detail === "high")).toBe(true);
    expect(discoveryRequest.messages[1].content.some((part) => part.type === "text" &&
      /Focused crop: lower flex cable/.test(part.text || ""))).toBe(false);

    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      selected_catalog_display_id: "a", confidence: 0.9, matching_cues: [], conflicting_cues: [],
    }) } }] });
    await new OpenAiVisionOcrService("unit-test-key", "gpt-6.1-sol", 120000)
      .compareToVerifiedExamples([{ imageBuffer, imageType: "back" }], readable);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      max_completion_tokens: 8000, reasoning_effort: "medium",
      response_format: { json_schema: { name: "verified_display_comparison" } },
    });
  });

  it("includes unrepresented catalog alternatives and retains reported ambiguity", async () => {
    const imageBuffer = await syntheticDisplayPhoto();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      selected_catalog_display_id: "a", confidence: 0.98, matching_cues: ["similar cutouts"], conflicting_cues: [],
      unresolved_alternatives: ["unrepresented device"],
    }) } }] });
    const comparison = await new OpenAiVisionOcrService("unit-test-key", "gpt-4o").compareToVerifiedExamples(
      [{ imageBuffer, imageType: "back" }],
      [
        { itemId: "a", catalogDisplayId: "a", label: "A", images: [{ imageBuffer, imageType: "back" }] },
        { itemId: "b", catalogDisplayId: "b", label: "B", images: [{ imageBuffer, imageType: "back" }] },
      ], ["A", "B", "unrepresented device"]
    );
    expect(comparison.unresolvedAlternatives).toEqual(["unrepresented device"]);
    expect(JSON.stringify(mockCreate.mock.calls[0][0].messages)).toContain("unrepresented device");
  });

  it("P2: Uses product-variant reviewer prompt and instructions when identityLevel is product_variant", async () => {
    const imageBuffer = await syntheticDisplayPhoto();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        selected_catalog_display_id: "variant-1",
        confidence: 0.95,
        matching_cues: ["same flex layout"],
        conflicting_cues: [],
      }) } }],
    });

    const readable = [
      { itemId: "seed-ref-1", catalogDisplayId: "variant-1", label: "iPhone 16 COF", images: [{ imageBuffer, imageType: "back" as const }] },
      { itemId: "seed-ref-2", catalogDisplayId: "variant-2", label: "iPhone 16 Soft", images: [{ imageBuffer, imageType: "back" as const }] },
    ];

    await new OpenAiVisionOcrService("unit-test-key", "gpt-4o-mini").compareToVerifiedExamples(
      [{ imageBuffer, imageType: "back" as const }],
      readable,
      [],
      { identityLevel: "product_variant" }
    );

    const callPayload = mockCreate.mock.calls[0][0];
    const systemContent = callPayload.messages[0].content as string;
    expect(systemContent).toContain("seeded-inventory product-variant reviewer");

    const userParts = callPayload.messages[1].content as Array<{ type: string; text?: string }>;
    const userTextCombined = userParts.filter((p) => p.type === "text").map((p) => p.text).join(" ");
    expect(userTextCombined).toContain("visible construction and markings support the selected seeded product variant");
    expect(userTextCombined).not.toContain("Construction differences alone do not establish device identity");
  });
});
