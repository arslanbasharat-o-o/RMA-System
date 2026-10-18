export interface VisualCandidate {
  title: string;
  sourceUrl?: string;
  /** Google Lens' displayed publisher label when its link is a Google redirect. */
  sourceName?: string;
  thumbnailUrl?: string;
  price?: string;
  rank: number;
}

export interface VisualIdentificationResult {
  provider: string;
  candidates: VisualCandidate[];
  /** Optional visible Google AI Overview text; never treated as verified by itself. */
  aiOverview?: string;
  normalizedModel?: string;
  normalizedManufacturer?: string;
  detectedDisplayAssembly?: string;
  cleanDecision?: import("./decision").CleanDisplayDecision;
  rawResponse: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

export interface DisplayVisualRecognitionContext {
  mimeType?: string;
  filename?: string;
  noCache?: boolean;
}

export interface DisplayVisualRecognitionProvider {
  name: string;
  identifyDisplay(
    imageBuffer: Buffer,
    context?: DisplayVisualRecognitionContext
  ): Promise<VisualIdentificationResult>;
}
