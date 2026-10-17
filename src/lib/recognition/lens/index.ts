import { DisplayVisualRecognitionProvider } from "./types";
import { MockLensProvider } from "./mock";
import { SerpApiLensProvider } from "./serpapi";
import { SelfHostedLensProvider } from "./self-hosted";

export * from "./types";
export * from "./mock";
export * from "./serpapi";
export * from "./self-hosted";
export * from "./decision";

export function getVisualRecognitionProvider(
  providerName?: string,
  apiKey?: string,
  defaultQuery?: string,
  baseUrl?: string
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
    case "self_hosted_lens":
    case "self-hosted-lens":
    case "self_hosted": {
      const selfHostedApiKey = apiKey || process.env.LENS_API_KEY;
      const selfHostedBaseUrl = baseUrl || process.env.LENS_API_BASE_URL;
      if (!selfHostedApiKey) {
        throw new Error("LENS_API_KEY is required when LENS_PROVIDER is configured for self-hosted Lens.");
      }
      if (!selfHostedBaseUrl) {
        throw new Error(
          "LENS_API_BASE_URL is required when LENS_PROVIDER is configured for self-hosted Lens."
        );
      }
      return new SelfHostedLensProvider({
        apiKey: selfHostedApiKey,
        baseUrl: selfHostedBaseUrl,
      });
    }
    case "mock":
      if (process.env.NODE_ENV === "production") {
        throw new Error("Mock visual recognition is disabled in production.");
      }
      return new MockLensProvider();
    default:
      throw new Error(`Unsupported LENS_PROVIDER: ${selected}`);
  }
}
