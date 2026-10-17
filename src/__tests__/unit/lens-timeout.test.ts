import { afterEach, describe, expect, it, vi } from "vitest";
import { SerpApiLensProvider } from "@/lib/recognition/lens/serpapi";

vi.mock("@/lib/recognition/lens/decision", () => ({
  cleanVisualCandidatesWithOpenAi: vi.fn(async () => ({ manufacturer: "Apple", model: "iPhone 16 Pro", displayName: "Apple iPhone 16 Pro Display", confidence: 0.9 })),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function mockSearch(delayMs: number) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith("/image")) return Response.json({ image_id: "offline-image" });
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json({ visual_matches: [{ title: "Apple iPhone 16 Pro screen", link: "https://example.test/part" }] })), delayMs);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("bounded visual recognition during provider slowdowns", () => {
  it("accepts a successful response after the previous 15-second cutoff", async () => {
    vi.useFakeTimers();
    const fetchMock = mockSearch(20000);
    const pending = new SerpApiLensProvider("offline-key").identifyDisplay(Buffer.from("synthetic"));
    await vi.advanceTimersByTimeAsync(20000);
    const result = await pending;
    expect(result.error).toBeUndefined();
    expect(result.normalizedModel).toBe("iPhone 16 Pro");
    expect(result.durationMs).toBe(20000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops a stalled search at the deadline with a useful error and no repeated search", async () => {
    vi.useFakeTimers();
    const fetchMock = mockSearch(120000);
    const pending = new SerpApiLensProvider("offline-key").identifyDisplay(Buffer.from("synthetic"));
    await vi.advanceTimersByTimeAsync(60000);
    const result = await pending;
    expect(result.error).toMatch(/timed out after 60 seconds during visual search/i);
    expect(result.candidates).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a bounded configured deadline and falls back safely for invalid configuration", async () => {
    vi.useFakeTimers();
    vi.stubEnv("LENS_TIMEOUT_MS", "1000");
    mockSearch(120000);
    const pending = new SerpApiLensProvider("offline-key").identifyDisplay(Buffer.from("synthetic"));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).error).toMatch(/after 1 second\b/);
    vi.stubEnv("LENS_TIMEOUT_MS", "invalid");
    mockSearch(20000);
    const next = new SerpApiLensProvider("offline-key").identifyDisplay(Buffer.from("synthetic"));
    await vi.advanceTimersByTimeAsync(20000);
    expect((await next).error).toBeUndefined();
  });

  it("records provider error responses as failures instead of successful empty identifications", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => String(url).endsWith("/image")
      ? Response.json({ image_id: "offline-image" })
      : Response.json({ error: "Service temporarily unavailable" })));
    const result = await new SerpApiLensProvider("offline-key").identifyDisplay(Buffer.from("synthetic"));
    expect(result.error).toContain("Service temporarily unavailable");
    expect(result.candidates).toEqual([]);
  });
});
