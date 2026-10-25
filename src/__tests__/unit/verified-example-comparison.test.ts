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
});
