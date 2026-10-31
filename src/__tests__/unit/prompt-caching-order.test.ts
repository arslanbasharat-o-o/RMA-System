import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAiVisionOcrService } from "@/lib/recognition/openai/vision";

describe("Prompt Caching Construction Order", () => {
  const mockCreate = vi.fn();
  const originalTestLiveAi = process.env.TEST_LIVE_AI;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEST_LIVE_AI = "true";
  });

  afterEach(() => {
    if (originalTestLiveAi === undefined) {
      delete process.env.TEST_LIVE_AI;
    } else {
      process.env.TEST_LIVE_AI = originalTestLiveAi;
    }
  });

  // 1x1 transparent PNG buffer
  const syntheticImage = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  it("places deterministic reference catalog prefix before the target image in prefix mode", async () => {
    const service = new OpenAiVisionOcrService("mock-key", "gpt-6.1-sol");
    (service as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: mockCreate.mockResolvedValue({
            id: "chatcmpl-test-123",
            model: "gpt-6.1-sol",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selected_catalog_display_id: "prod-1",
                    confidence: 0.98,
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 1500, completion_tokens: 50 },
          }),
        },
      },
    };

    const targetImages = [{ imageBuffer: syntheticImage, imageType: "back" }];
    const references = [
      {
        itemId: "item-b",
        catalogDisplayId: "prod-2",
        label: "iPhone 16 Plus (DSP-002)",
        images: [{ imageBuffer: syntheticImage, imageType: "back" }],
      },
      {
        itemId: "item-a",
        catalogDisplayId: "prod-1",
        label: "iPhone 16 Pro (DSP-001)",
        images: [{ imageBuffer: syntheticImage, imageType: "back" }],
      },
    ];

    await service.compareToVerifiedExamples(targetImages, references, [], {
      mode: "discovery",
      promptCachingOrder: "prefix",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage).toBeDefined();

    const textParts = userMessage.content
      .filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text);

    // In prefix mode, the static reference library text must appear before "New display to identify:"
    const refIndex = textParts.findIndex((t: string) => t.includes("Human-verified reference") || t.includes("prod-1"));
    const targetIndex = textParts.findIndex((t: string) => t.includes("New display to identify:"));

    expect(refIndex).toBeGreaterThanOrEqual(0);
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    expect(refIndex).toBeLessThan(targetIndex);

    // References must be deterministically sorted (prod-1 before prod-2)
    const prod1Index = textParts.findIndex((t: string) => t.includes("prod-1"));
    const prod2Index = textParts.findIndex((t: string) => t.includes("prod-2"));
    expect(prod1Index).toBeLessThan(prod2Index);

    // Explicit breakpoint must be attached at the end of the reference library
    const breakpointPart = userMessage.content.find(
      (p: Record<string, unknown>) => p.prompt_cache_breakpoint !== undefined
    );
    expect(breakpointPart).toBeDefined();
    expect((breakpointPart as Record<string, unknown>).prompt_cache_breakpoint).toEqual({ mode: "explicit" });

    // Payload includes derived prompt_cache_key and prompt_cache_options
    expect(callArgs.prompt_cache_key).toMatch(/^rma-seeded-[a-f0-9]{12}-v1\.1$/);
    expect(callArgs.prompt_cache_options).toEqual({ mode: "explicit", ttl: "30m" });
  });

  it("strips explicit prompt caching parameters when falling back to legacy GPT-4o", async () => {
    const service = new OpenAiVisionOcrService("mock-key", "gpt-4o");
    (service as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: mockCreate.mockResolvedValue({
            id: "chatcmpl-test-4o",
            model: "gpt-4o",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selected_catalog_display_id: "prod-1",
                    confidence: 0.98,
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 1500, completion_tokens: 50 },
          }),
        },
      },
    };

    const targetImages = [{ imageBuffer: syntheticImage, imageType: "back" }];
    const references = [
      {
        itemId: "item-a",
        catalogDisplayId: "prod-1",
        label: "iPhone 16 Pro (DSP-001)",
        images: [{ imageBuffer: syntheticImage, imageType: "back" }],
      },
      {
        itemId: "item-b",
        catalogDisplayId: "prod-2",
        label: "iPhone 16 Plus (DSP-002)",
        images: [{ imageBuffer: syntheticImage, imageType: "back" }],
      },
    ];

    await service.compareToVerifiedExamples(targetImages, references, [], {
      mode: "discovery",
      promptCachingOrder: "prefix",
      model: "gpt-4o",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];

    // For GPT-4o, prompt_cache_key and prompt_cache_options MUST be omitted to avoid schema rejection
    expect(callArgs.prompt_cache_key).toBeUndefined();
    expect(callArgs.prompt_cache_options).toBeUndefined();

    // prompt_cache_breakpoint MUST be stripped from content parts
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    const hasBreakpoint = userMessage.content.some(
      (p: Record<string, unknown>) => "prompt_cache_breakpoint" in p
    );
    expect(hasBreakpoint).toBe(false);
  });

  it("supports legacy ordering when promptCachingOrder is 'legacy'", async () => {
    const service = new OpenAiVisionOcrService("mock-key", "gpt-6.1-sol");
    (service as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: mockCreate.mockResolvedValue({
            id: "chatcmpl-test-456",
            model: "gpt-6.1-sol",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selected_catalog_display_id: "prod-1",
                    confidence: 0.98,
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 1500, completion_tokens: 50 },
          }),
        },
      },
    };

    const targetImages = [{ imageBuffer: syntheticImage, imageType: "back" }];
    const references = [
      {
        itemId: "item-a",
        catalogDisplayId: "prod-1",
        label: "iPhone 16 Pro (DSP-001)",
        images: [{ imageBuffer: syntheticImage, imageType: "back" }],
      },
      {
        itemId: "item-b",
        catalogDisplayId: "prod-2",
        label: "iPhone 16 Plus (DSP-002)",
        images: [{ imageBuffer: syntheticImage, imageType: "back" }],
      },
    ];

    await service.compareToVerifiedExamples(targetImages, references, [], {
      mode: "discovery",
      promptCachingOrder: "legacy",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    const textParts = userMessage.content
      .filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text);

    // In legacy mode, target image appears before reference catalog
    const targetIndex = textParts.findIndex((t: string) => t.includes("New display to identify:"));
    const refIndex = textParts.findIndex((t: string) => t.includes("prod-1"));

    expect(targetIndex).toBeLessThan(refIndex);
  });
});
