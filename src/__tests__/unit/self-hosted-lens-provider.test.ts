import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getVisualRecognitionProvider,
  SelfHostedLensProvider,
} from "@/lib/recognition/lens";

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Bad Request",
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe("SelfHostedLensProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("selects the self-hosted provider only when both API settings are present", () => {
    vi.stubEnv("LENS_API_KEY", "self-hosted-test-key");
    vi.stubEnv("LENS_API_BASE_URL", "http://lens.internal/api");

    const provider = getVisualRecognitionProvider("self_hosted_lens");
    expect(provider).toBeInstanceOf(SelfHostedLensProvider);
    expect(provider.name).toBe("self_hosted_lens");

    vi.stubEnv("LENS_API_KEY", "");
    expect(() => getVisualRecognitionProvider("self_hosted_lens")).toThrow(/LENS_API_KEY is required/i);

    vi.stubEnv("LENS_API_KEY", "self-hosted-test-key");
    vi.stubEnv("LENS_API_BASE_URL", "");
    expect(() => getVisualRecognitionProvider("self_hosted_lens")).toThrow(/LENS_API_BASE_URL is required/i);
  });

  it("uploads an image, searches by image_id, and maps normalized visual_matches", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "must-not-be-used");

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: url.toString(), init });
      if (url.toString().endsWith("/upload")) {
        return jsonResponse({ image_id: "uploaded-image-42" });
      }
      return jsonResponse({
        visual_matches: [
          {
            title: "Samsung Galaxy A15 Replacement Display",
            link: "https://example.test/a15",
            thumbnail: "https://example.test/a15.jpg",
            price: { extracted: 29.99, currency: "USD" },
          },
        ],
      });
    }));

    const provider = new SelfHostedLensProvider({
      apiKey: "self-hosted-test-key",
      baseUrl: "http://lens.internal/api",
    });
    const result = await provider.identifyDisplay(Buffer.from("image-bytes"), {
      filename: "display.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.error).toBeUndefined();
    expect(result.provider).toBe("self_hosted_lens");
    expect(result.candidates).toEqual([
      {
        title: "Samsung Galaxy A15 Replacement Display",
        sourceUrl: "https://example.test/a15",
        thumbnailUrl: "https://example.test/a15.jpg",
        price: "USD 29.99",
        rank: 1,
      },
    ]);
    expect(result.normalizedManufacturer).toBe("Samsung");
    expect(result.normalizedModel).toBe("Galaxy A15");
    expect(calls).toHaveLength(2);

    const uploadCall = calls[0];
    expect(uploadCall.url).toBe("http://lens.internal/api/upload");
    expect(uploadCall.init?.method).toBe("POST");
    expect(uploadCall.init?.headers).toMatchObject({
      Authorization: "Bearer self-hosted-test-key",
      "X-API-Key": "self-hosted-test-key",
    });
    expect(uploadCall.init?.body).toBeInstanceOf(FormData);
    expect((uploadCall.init?.body as FormData).get("image")).toBeInstanceOf(Blob);

    const searchUrl = new URL(calls[1].url);
    expect(searchUrl.pathname).toBe("/api/search");
    expect(searchUrl.searchParams.get("image_id")).toBe("uploaded-image-42");
    expect(searchUrl.searchParams.has("q")).toBe(false);
    expect(calls[1].init?.method).toBe("GET");
    expect(calls[1].init?.headers).toMatchObject({
      Authorization: "Bearer self-hosted-test-key",
      "X-API-Key": "self-hosted-test-key",
    });
  });

  it("supports a direct search endpoint without an upload request", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: url.toString(), init });
      return jsonResponse({
        visual_matches: [{ title: "Apple iPhone 13 Pro OLED Display", link: "https://example.test/iphone" }],
      });
    }));

    const provider = new SelfHostedLensProvider({
      apiKey: "direct-test-key",
      baseUrl: "http://lens.internal/api/search",
      mode: "direct",
    });
    const result = await provider.identifyDisplay(Buffer.from("image-bytes"));

    expect(result.error).toBeUndefined();
    expect(result.normalizedManufacturer).toBe("Apple");
    expect(result.normalizedModel).toBeUndefined();
    expect(result.cleanDecision?.model).toBeNull();
    expect(result.cleanDecision?.confidence).toBeLessThan(0.5);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://lens.internal/api/search");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBeInstanceOf(FormData);
    expect((calls[0].init?.body as FormData).get("image")).toBeInstanceOf(Blob);
  });

  it("polls a queued direct response until the normalized result is ready", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      calls.push(url.toString());
      if (url.toString().endsWith("/v1/search")) {
        return jsonResponse({
          id: "job-42",
          status: "queued",
          status_url: "/v1/jobs/job-42",
        });
      }
      return jsonResponse({
        id: "job-42",
        status: "succeeded",
        result: {
          visual_matches: [{ title: "Xiaomi Redmi Note 12 Display", link: "https://example.test/redmi" }],
        },
      });
    }));

    const provider = new SelfHostedLensProvider({
      apiKey: "queued-test-key",
      baseUrl: "http://lens.internal/v1/search",
      mode: "direct",
      pollIntervalMs: 1,
    });
    const result = await provider.identifyDisplay(Buffer.from("image-bytes"));

    expect(result.error).toBeUndefined();
    expect(result.normalizedManufacturer).toBe("Xiaomi");
    expect(result.normalizedModel).toBe("redmi note 12");
    expect(calls).toEqual([
      "http://lens.internal/v1/search",
      "http://lens.internal/v1/jobs/job-42",
    ]);
  });

  it("returns provider errors with the service status and body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "invalid api key",
    }) as Response));

    const provider = new SelfHostedLensProvider({
      apiKey: "bad-key",
      baseUrl: "http://lens.internal/api",
    });
    const result = await provider.identifyDisplay(Buffer.from("image-bytes"));

    expect(result.error).toMatch(/Self-hosted Lens image upload error \[401\]: invalid api key/);
    expect(result.candidates).toEqual([]);
    expect(result.rawResponse).toMatchObject({ error: result.error });
  });

  it("returns the same timeout-style failure shape when the service does not respond", async () => {
    vi.stubEnv("LENS_TIMEOUT_MS", "1000");
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL, init?: RequestInit) => new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }))
    );

    const provider = new SelfHostedLensProvider({
      apiKey: "slow-key",
      baseUrl: "http://lens.internal/api",
    });
    const result = await provider.identifyDisplay(Buffer.from("image-bytes"));

    expect(result.error).toMatch(/timed out after 1 second during image upload/i);
    expect(result.candidates).toEqual([]);
  });
});
