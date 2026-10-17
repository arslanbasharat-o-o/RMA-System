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
}

export interface DisplayVisualRecognitionProvider {
  name: string;
  identifyDisplay(
    imageBuffer: Buffer,
    context?: DisplayVisualRecognitionContext
  ): Promise<VisualIdentificationResult>;
}
