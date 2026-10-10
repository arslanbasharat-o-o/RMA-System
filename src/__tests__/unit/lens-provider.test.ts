import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getVisualRecognitionProvider,
  MockLensProvider,
  SerpApiLensProvider,
} from "@/lib/recognition/lens";

describe("Lens Visual Recognition Provider & Q Query Section", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should instantiate MockLensProvider and return candidates with q context", async () => {
    const provider = getVisualRecognitionProvider("mock");
    expect(provider.name).toBe("mock_lens");

    const dummyBuffer = Buffer.from("dummy");
    const res = await provider.identifyDisplay(dummyBuffer, {
      filename: "iphone13pro.jpg",
      q: "iphone 13 pro display",
    });

    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.normalizedManufacturer).toBe("Apple");
    expect(res.normalizedModel).toBe("iPhone 13 Pro");
  });

  it("should instantiate SerpApiLensProvider with configured defaultQuery", () => {
    const provider = getVisualRecognitionProvider(
      "serpapi_lens",
      "test_key",
      "display screen"
    );
    expect(provider.name).toBe("serpapi_lens");
  });

  it("keeps Pro Max and Ultra variants unresolved instead of collapsing to a base model", () => {
    const provider = new SerpApiLensProvider("test_key");
    expect(provider.extractModelFromCandidates([{ title: "Apple iPhone 13 Pro Max display", rank: 1 }])).toEqual({});
    expect(provider.extractModelFromCandidates([{ title: "Samsung Galaxy S23 Ultra screen", rank: 1 }])).toEqual({});
    expect(provider.extractModelFromCandidates([{ title: "Apple iPhone 13 Pro display", rank: 1 }])).toEqual({ manufacturer: "Apple", model: "iPhone 13 Pro" });
  });

  it("does not silently use mock recognition in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LENS_PROVIDER", "");
    expect(() => getVisualRecognitionProvider()).toThrow(/must be configured in production/i);
    expect(() => getVisualRecognitionProvider("mock")).toThrow(/disabled in production/i);
    expect(() => getVisualRecognitionProvider("serpapi_lens")).toThrow(/SERPAPI_API_KEY is required/i);
  });

  it("should send type=all, no_cache=true, safe=off, and q parameter to SerpApi", async () => {
    const provider = new SerpApiLensProvider("dummy_key", 10000, "display screen");

    const requestedUrls: string[] = [];

    // Mock global fetch to intercept SerpApi calls
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (urlStr.includes("serpapi.com/image")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              message: "Image uploaded successfully.",
              image_id: "mock_image_id_12345",
            }),
          };
        }

        if (urlStr.includes("serpapi.com/search")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              visual_matches: [
                {
                  title: "Apple iPhone 13 Pro Display Assembly OLED",
                  link: "https://example.com/item/1",
                  thumbnail: "https://example.com/thumb.jpg",
                },
              ],
            }),
          };
        }

        return {
          ok: false,
          status: 404,
          text: async () => "Not found",
        };
      })
    );

    const dummyBuffer = Buffer.from("fake-image-bytes");
    const result = await provider.identifyDisplay(dummyBuffer, {
      filename: "test_screen.jpg",
      q: "identidydisplay",
    });

    expect(result.error).toBeUndefined();
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].title).toBe("Apple iPhone 13 Pro Display Assembly OLED");
    expect(result.normalizedManufacturer).toBe("Apple");
    expect(result.normalizedModel).toBe("iPhone 13 Pro");
    expect(result.usedQuery).toBe("identidydisplay");

    // Inspect search URL query parameters
    const searchUrlCall = requestedUrls.find((u) => u.includes("serpapi.com/search"));
    expect(searchUrlCall).toBeDefined();

    const parsedSearchUrl = new URL(searchUrlCall!);
    expect(parsedSearchUrl.searchParams.get("engine")).toBe("google_lens");
    expect(parsedSearchUrl.searchParams.get("image_id")).toBe("mock_image_id_12345");
    expect(parsedSearchUrl.searchParams.get("type")).toBe("all");
    expect(parsedSearchUrl.searchParams.get("no_cache")).toBe("true");
    expect(parsedSearchUrl.searchParams.get("safe")).toBe("off");
    expect(parsedSearchUrl.searchParams.get("q")).toBe("identidydisplay");
    expect(parsedSearchUrl.searchParams.get("api_key")).toBe("dummy_key");
  });

  it("should gracefully retry without q filter if a restrictive query yields 0 results", async () => {
    const provider = new SerpApiLensProvider("dummy_key", 10000);
    const requestedUrls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = url.toString();
        requestedUrls.push(urlStr);

        if (urlStr.includes("serpapi.com/image")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ image_id: "test_img_999" }),
          };
        }

        if (urlStr.includes("serpapi.com/search")) {
          const parsed = new URL(urlStr);
          // First attempt has q filter -> return 0 results
          if (parsed.searchParams.has("q")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                error: "Google Lens hasn't returned any results for this query.",
              }),
            };
          }
          // Retry attempt without q -> return matches
          return {
            ok: true,
            status: 200,
            json: async () => ({
              visual_matches: [
                {
                  title: "Samsung Galaxy A15 Replacement Screen Display",
                  link: "https://example.com/item/a15",
                },
              ],
            }),
          };
        }

        return { ok: false, status: 500 };
      })
    );

    const dummyBuffer = Buffer.from("fake-bytes");
    const result = await provider.identifyDisplay(dummyBuffer, {
      q: "nonexistent_rare_typo_query",
    });

    expect(result.error).toBeUndefined();
    expect(result.candidates.length).toBe(1);
    expect(result.normalizedModel).toBe("Galaxy A15");
    // Verify 2 search requests occurred: 1 with q, 1 fallback without q
    const searchCalls = requestedUrls.filter((u) => u.includes("serpapi.com/search"));
    expect(searchCalls.length).toBe(2);
    expect(new URL(searchCalls[0]).searchParams.get("q")).toBe("nonexistent_rare_typo_query");
    expect(new URL(searchCalls[1]).searchParams.has("q")).toBe(false);
  });
});
