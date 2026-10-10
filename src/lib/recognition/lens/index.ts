import { DisplayVisualRecognitionProvider } from "./types";
import { MockLensProvider } from "./mock";
import { SerpApiLensProvider } from "./serpapi";

export * from "./types";
export * from "./mock";
export * from "./serpapi";
export * from "./decision";

export function getVisualRecognitionProvider(
  providerName?: string,
  apiKey?: string,
  defaultQuery?: string
): DisplayVisualRecognitionProvider {
  const configured = providerName || process.env.LENS_PROVIDER;
  const selected = (configured || (process.env.NODE_ENV === "production" ? "" : "mock")).toLowerCase();

  if (!selected) {
    throw new Error("LENS_PROVIDER must be configured in production; mock recognition is disabled.");
  }

  switch (selected) {
    case "serpapi_lens":
    case "serpapi":
      if (apiKey || process.env.SERPAPI_API_KEY) {
        return new SerpApiLensProvider(apiKey, undefined, defaultQuery);
      }
      throw new Error("SERPAPI_API_KEY is required when LENS_PROVIDER is configured for SerpApi.");
    case "mock":
      if (process.env.NODE_ENV === "production") {
        throw new Error("Mock visual recognition is disabled in production.");
      }
      return new MockLensProvider();
    default:
      throw new Error(`Unsupported LENS_PROVIDER: ${selected}`);
  }
}
