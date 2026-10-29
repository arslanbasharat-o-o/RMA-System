import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getVisualRecognitionProvider,
  SelfHostedLensProvider,
} from "@/lib/recognition/lens";
import { optimizeImageForVisualSearch } from "@/lib/recognition/lens/self-hosted";

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
  it("honors the configured request deadline through the application provider factory", async () => {
    vi.stubEnv("LENS_API_KEY", "unit-key");
    vi.stubEnv("LENS_API_BASE_URL", "http://lens.internal");
    vi.stubEnv("LENS_TIMEOUT_MS", "1000");
    vi.stubGlobal("fetch", vi.fn((_url: string | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));
    const result = await getVisualRecognitionProvider("self_hosted_lens").identifyDisplay(Buffer.from("photo"));
    expect(result.error).toContain("timed out after 1 second");
    expect(result.durationMs).toBeLessThan(2500);
  });

  it.each(["succeeded", "queued"])("follows an asynchronous %s receipt to its actual result payload", async (status) => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      requests.push(url.toString());
      if (url.toString().endsWith("/upload")) return jsonResponse({ image_id: "photo" });
      if (new URL(url).pathname === "/search") return jsonResponse({
        job_id: "cached-job", status, status_url: "/v1/jobs/cached-job",
        ...(status === "queued" ? { visual_matches: [] } : {}),
      });
      return jsonResponse({ status: "succeeded", result: { visual_matches: [{
        title: "Samsung Galaxy A15 display assembly", link: "https://source.test/a15",
      }] } });
    }));
    const result = await new SelfHostedLensProvider({ apiKey: "unit-key", baseUrl: "http://lens.internal",
      pollIntervalMs: 100 }).identifyDisplay(Buffer.from("photo"));
    expect(result.error).toBeUndefined();
    expect(result.candidates).toHaveLength(1);
    expect(requests.at(-1)).toBe("http://lens.internal/v1/jobs/cached-job");
    expect(result.normalizedModel).toBe("Galaxy A15");
  });

  it("cancels its own abandoned upstream job after its deadline", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const calls: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: url.toString(), method: init?.method });
      return url.toString().endsWith("/upload") ? jsonResponse({ image_id: "photo" })
        : jsonResponse({ status: "queued", status_url: "/v1/jobs/owned-job" });
    }));
    const result = await new SelfHostedLensProvider({ apiKey: "unit-key", baseUrl: "http://lens.internal",
      timeoutMs: 1000, pollIntervalMs: 100 }).identifyDisplay(Buffer.from("photo"));
    expect(result.error).toContain("timed out");
    expect(new URL(calls.find(c => new URL(c.url).pathname === "/search")!.url).searchParams.get("async")).toBe("true");
    expect(calls.filter(c => c.method === "DELETE")).toEqual([
      { url: "http://lens.internal/v1/jobs/owned-job", method: "DELETE" },
    ]);
  });

  it("never sends credentials to a foreign status URL", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      requests.push(url.toString());
      return jsonResponse({ status: "queued", status_url: "https://foreign.test/v1/jobs/owned-job" });
    }));
    const result = await new SelfHostedLensProvider({ apiKey: "unit-key", baseUrl: "http://lens.internal/search",
      mode: "direct" }).identifyDisplay(Buffer.from("photo"));
    expect(result.error).toContain("untrusted");
    expect(requests).toEqual(["http://lens.internal/search"]);
  });
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
    expect(searchUrl.searchParams.has("no_cache")).toBe(false);
    expect(calls[1].init?.method).toBe("GET");
    expect(calls[1].init?.headers).toMatchObject({
      Authorization: "Bearer self-hosted-test-key",
      "X-API-Key": "self-hosted-test-key",
    });
  });

  it("bypasses cached Lens results for an explicit fresh recognition", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: url.toString(), init });
      return url.toString().endsWith("/upload")
        ? jsonResponse({ image_id: "fresh-image-42" })
        : jsonResponse({ visual_matches: [{ title: "Apple iPhone 14 Plus OLED display", link: "https://parts.example.test/14-plus" }] });
    }));

    const provider = new SelfHostedLensProvider({
      apiKey: "self-hosted-test-key",
      baseUrl: "http://lens.internal/api",
    });
    const result = await provider.identifyDisplay(Buffer.from("same-image-bytes"), {
      filename: "same-image.jpg",
      mimeType: "image/jpeg",
      noCache: true,
    });

    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1].url).searchParams.get("no_cache")).toBe("true");
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

  it("keeps a visible AI Overview separate and maps up to 30 listing candidates", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "");
    const visual_matches = Array.from({ length: 35 }, (_, index) => ({
      title: `iPhone 14 Plus display panel listing ${index + 1}`,
      link: `https://parts-${index + 1}.example/display`,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      ai_overview: "This is an iPhone 14 Plus replacement display.",
      visual_matches,
    })));

    const provider = new SelfHostedLensProvider({
      apiKey: "overview-test-key",
      baseUrl: "http://lens.internal/api/search",
      mode: "direct",
    });
    const result = await provider.identifyDisplay(Buffer.from("image-bytes"));

    expect(result.error).toBeUndefined();
    expect(result.aiOverview).toBe("This is an iPhone 14 Plus replacement display.");
    expect(result.candidates).toHaveLength(30);
    expect(result.cleanDecision?.model).toBe("iPhone 14 Plus");
    expect(result.cleanDecision?.reasoning).toContain("AI Overview names the same exact model");
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

  it("compresses large images to progressive JPEG with max 1280x1280 dimensions", async () => {
    // 1x1 png test pixel
    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    const optimized = await optimizeImageForVisualSearch(pixel, "image/png");
    expect(optimized).toHaveProperty("buffer");
    expect(optimized).toHaveProperty("mime");
    expect(optimized).toHaveProperty("ext");
    expect(optimized.buffer.length).toBeGreaterThan(0);
  });

  it("passes prompt parameter and maps ai_mode alongside visual_matches", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: url.toString(), init });
      return url.toString().endsWith("/upload")
        ? jsonResponse({ image_id: "prompt-img-1" })
        : jsonResponse({
            visual_matches: [{ title: "iPhone 14 Pro Max Screen Replacement", link: "https://example.com/item" }],
            ai_mode: {
              text: "The display has a Dynamic Island cutout and SQ9-S aftermarket IC chip, identifying it as an iPhone 14 Pro Max.",
              sources: [{ title: "Phone Display Guide", link: "https://example.com/guide" }],
            },
          });
    }));

    const provider = new SelfHostedLensProvider({
      apiKey: "self-hosted-test-key",
      baseUrl: "http://lens.internal/api",
    });

    const result = await provider.identifyDisplay(Buffer.from("image-bytes"), {
      prompt: "Identify exact phone display screen model. Inspect notch vs Dynamic Island",
    });

    expect(calls).toHaveLength(2);
    const searchUrl = new URL(calls[1].url);
    expect(searchUrl.searchParams.get("prompt")).toBe("Identify exact phone display screen model. Inspect notch vs Dynamic Island");
    expect(searchUrl.searchParams.get("q")).toBe("Identify exact phone display screen model. Inspect notch vs Dynamic Island");

    expect(result.candidates).toHaveLength(1);
    expect(result.aiMode).toBeDefined();
    expect(result.aiMode?.text).toContain("Dynamic Island");
    expect(result.aiMode?.sources?.[0]?.link).toBe("https://example.com/guide");
    expect(result.aiOverview).toContain("Dynamic Island");
  });

  it("uses process.env.LENS_SEARCH_PROMPT when configured in environment", async () => {
    vi.stubEnv("LENS_SEARCH_PROMPT", "Custom prompt from env");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: url.toString(), init });
      return url.toString().endsWith("/upload")
        ? jsonResponse({ image_id: "prompt-img-env" })
        : jsonResponse({ visual_matches: [] });
    }));

    const provider = new SelfHostedLensProvider({
      apiKey: "self-hosted-test-key",
      baseUrl: "http://lens.internal/api",
    });

    await provider.identifyDisplay(Buffer.from("image-bytes"));

    expect(calls).toHaveLength(2);
    const searchUrl = new URL(calls[1].url);
    expect(searchUrl.searchParams.get("prompt")).toBe("Custom prompt from env");
    expect(searchUrl.searchParams.get("q")).toBe("Custom prompt from env");
  });
});
