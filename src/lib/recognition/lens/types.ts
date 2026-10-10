export interface VisualCandidate {
  title: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  price?: string;
  rank: number;
}

export interface VisualIdentificationResult {
  provider: string;
  candidates: VisualCandidate[];
  normalizedModel?: string;
  normalizedManufacturer?: string;
  detectedDisplayAssembly?: string;
  cleanDecision?: import("./decision").CleanDisplayDecision;
  rawResponse: Record<string, unknown>;
  durationMs: number;
  error?: string;
  usedQuery?: string;
}

export interface DisplayVisualRecognitionContext {
  mimeType?: string;
  filename?: string;
  q?: string; // Query filter (the 'q' parameter in Google Lens / SerpApi)
}

export interface DisplayVisualRecognitionProvider {
  name: string;
  identifyDisplay(
    imageBuffer: Buffer,
    context?: DisplayVisualRecognitionContext
  ): Promise<VisualIdentificationResult>;
}
