import {
  DisplayVisualRecognitionProvider,
  DisplayVisualRecognitionContext,
  VisualIdentificationResult,
  VisualCandidate,
} from "./types";
import { cleanVisualCandidatesWithOpenAi } from "./decision";

export class SerpApiLensProvider implements DisplayVisualRecognitionProvider {
  public name = "serpapi_lens";
  private apiKey: string;
  private timeoutMs: number;
  private defaultQuery?: string;

  constructor(apiKey?: string, timeoutMs = 15000, defaultQuery?: string) {
    this.apiKey = apiKey || process.env.SERPAPI_API_KEY || "";
    this.timeoutMs = timeoutMs;
    this.defaultQuery = defaultQuery || process.env.LENS_FILTER_QUERY;
  }

  public async identifyDisplay(
    imageBuffer: Buffer,
    context?: DisplayVisualRecognitionContext
  ): Promise<VisualIdentificationResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      throw new Error(
        "SerpApi API Key is not configured. Set SERPAPI_API_KEY in environment or settings."
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Step 1: Optimize buffer if needed (SerpApi /image upload max size is 500 KB)
      let uploadBuffer = imageBuffer;
      let uploadMime = context?.mimeType || "image/jpeg";
      if (uploadBuffer.length > 450 * 1024) {
        try {
          const sharp = (await import("sharp")).default;
          uploadBuffer = await sharp(imageBuffer)
            .resize({ width: 800, height: 800, fit: "inside" })
            .jpeg({ quality: 80 })
            .toBuffer();
          uploadMime = "image/jpeg";
        } catch {
          // Keep original buffer if sharp fails
        }
      }

      // Step 2: Upload to SerpApi Image API to get image_id
      const uploadFormData = new FormData();
      const blob = new Blob([new Uint8Array(uploadBuffer)], { type: uploadMime });
      uploadFormData.append("image", blob, context?.filename || "display.jpg");
      uploadFormData.append("api_key", this.apiKey);

      const uploadResponse = await fetch("https://serpapi.com/image", {
        method: "POST",
        body: uploadFormData,
        signal: controller.signal,
      });

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`SerpApi image upload error [${uploadResponse.status}]: ${errText}`);
      }

      const uploadData = (await uploadResponse.json()) as { image_id?: string; error?: string };
      if (!uploadData.image_id) {
        throw new Error(uploadData.error || "SerpApi image upload failed to return an image_id");
      }

      // Step 3: Query Google Lens with image_id and q filter parameter
      const targetQuery =
        context?.q !== undefined
          ? context.q
          : this.defaultQuery || process.env.LENS_FILTER_QUERY || "";

      const executeLensQuery = async (queryFilter?: string) => {
        const searchUrl = new URL("https://serpapi.com/search");
        searchUrl.searchParams.set("engine", "google_lens");
        searchUrl.searchParams.set("image_id", uploadData.image_id!);
        searchUrl.searchParams.set("type", "all");
        searchUrl.searchParams.set("no_cache", "true");
        searchUrl.searchParams.set("safe", "off");
        searchUrl.searchParams.set("api_key", this.apiKey);
        searchUrl.searchParams.set("hl", "en");

        if (queryFilter && queryFilter.trim().length > 0) {
          searchUrl.searchParams.set("q", queryFilter.trim());
        }

        const res = await fetch(searchUrl.toString(), {
          method: "GET",
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`SerpApi Google Lens error [${res.status}]: ${errorText}`);
        }

        return (await res.json()) as {
          visual_matches?: Array<{
            title?: string;
            link?: string;
            thumbnail?: string;
            price?: { extracted?: number; currency?: string };
          }>;
          error?: string;
        };
      };

      let queryUsed = targetQuery;
      let data = await executeLensQuery(targetQuery);

      // Graceful fallback: If filtered query returned 0 matches, retry without filter
      // to ensure visual search never drops matches due to overly narrow queries
      if (
        (!data.visual_matches || data.visual_matches.length === 0) &&
        targetQuery &&
        targetQuery.trim().length > 0
      ) {
        console.warn(
          `[SerpApi] Filter q='${targetQuery}' returned no matches (${data.error || "0 matches"}). Retrying visual search without query filter...`
        );
        data = await executeLensQuery(undefined);
        queryUsed = "";
      }

      clearTimeout(timeout);

      const candidates: VisualCandidate[] = (data.visual_matches || [])
        .slice(0, 10)
        .map((match, idx) => ({
          title: match.title || "Unknown Display Assembly",
          sourceUrl: match.link,
          thumbnailUrl: match.thumbnail,
          rank: idx + 1,
        }));

      // Extract manufacturer and model from top candidate titles as heuristic baseline
      const extracted = this.extractModelFromCandidates(candidates);

      // Clean noisy candidates and determine single authoritative decision via OpenAI / fast cleaner
      const cleanDecision = await cleanVisualCandidatesWithOpenAi(candidates, {
        filename: context?.filename,
      });

      const finalManufacturer = cleanDecision.manufacturer || extracted.manufacturer;
      const finalModel = cleanDecision.model || extracted.model;

      return {
        provider: this.name,
        candidates,
        cleanDecision,
        normalizedManufacturer: finalManufacturer,
        normalizedModel: finalModel,
        detectedDisplayAssembly:
          cleanDecision.displayName ||
          (finalModel ? `${finalManufacturer} ${finalModel} Display` : undefined),
        usedQuery: queryUsed || undefined,
        rawResponse: data as Record<string, unknown>,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider: this.name,
        candidates: [],
        rawResponse: { error: message },
        durationMs: Date.now() - startTime,
        error: message,
      };
    }
  }

  public extractModelFromCandidates(candidates: VisualCandidate[]): {
    manufacturer?: string;
    model?: string;
  } {
    for (const c of candidates) {
      const text = c.title;
      const appleModel = text.match(/\biphone\s*(14|13|12|11)\s*(pro\s*max|pro|max|plus|mini)?\b/i);
      if (appleModel) {
        const generation = appleModel[1];
        const suffix = (appleModel[2] || "").toLowerCase().replace(/\s+/g, " ").trim();
        const knownModels: Record<string, string> = {
          "14:pro": "iPhone 14 Pro",
          "13:pro": "iPhone 13 Pro",
          "12:": "iPhone 12",
          "11:": "iPhone 11",
        };
        const exact = knownModels[`${generation}:${suffix}`];
        if (exact) return { manufacturer: "Apple", model: exact };
        continue;
      }

      // A15 4G/5G panels share one catalog model; similarly named families do not.
      if (/\bgalaxy\s*a15(?:\s*(?:4g|5g))?\b/i.test(text) || /\bsm-a15[56][a-z0-9]*\b/i.test(text)) {
        return { manufacturer: "Samsung", model: "Galaxy A15" };
      }
      if (/\bgalaxy\s*s23\b/i.test(text) && !/\b(?:ultra|fe|plus)\b/i.test(text) || /\bsm-s911[a-z0-9]*\b/i.test(text)) {
        return { manufacturer: "Samsung", model: "Galaxy S23" };
      }

      // Xiaomi detection
      if (/\bredmi\s*note\s*12\b/i.test(text)) {
        return { manufacturer: "Xiaomi", model: "Redmi Note 12" };
      }
    }

    return {};
  }
}
