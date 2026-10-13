import {
  DisplayVisualRecognitionProvider,
  DisplayVisualRecognitionContext,
  VisualIdentificationResult,
} from "./types";

export class MockLensProvider implements DisplayVisualRecognitionProvider {
  public name = "mock_lens";

  public async identifyDisplay(
    _imageBuffer: Buffer,
    context?: DisplayVisualRecognitionContext
  ): Promise<VisualIdentificationResult> {
    const startTime = Date.now();
    const filename = (context?.filename || "").toLowerCase();

    // Deterministic simulation based on filename if provided, otherwise default to iPhone 13 Pro
    let manufacturer = "Apple";
    let model = "iPhone 13 Pro";
    let candidates: import("./types").VisualCandidate[] = [
      {
        title: "OEM Apple iPhone 13 Pro OLED Screen Replacement Display Assembly",
        sourceUrl: "https://example.com/item/iphone-13-pro-screen",
        rank: 1,
      },
      {
        title: "Apple iPhone 13 Pro Display Panel",
        sourceUrl: "https://example.com/item/iphone-13-pro-panel",
        rank: 2,
      },
      {
        title: "iPhone 13 Pro OLED Screen",
        sourceUrl: "https://example.com/item/iphone-13-pro-oled",
        rank: 3,
      },
    ];

    if (filename.includes("a15") || filename.includes("samsung")) {
      manufacturer = "Samsung";
      model = "Galaxy A15";
      candidates = [
        {
          title: "Samsung Galaxy A15 4G / 5G Super AMOLED Screen Replacement",
          sourceUrl: "https://example.com/item/samsung-a15-screen",
          rank: 1,
        },
        {
          title: "Samsung Galaxy A25 Screen Display Complete",
          sourceUrl: "https://example.com/item/samsung-a25-screen",
          rank: 2,
        },
      ];
    } else if (filename.includes("redmi") || filename.includes("xiaomi")) {
      manufacturer = "Xiaomi";
      model = "Redmi Note 12";
      candidates = [
        {
          title: "Xiaomi Redmi Note 12 AMOLED Replacement Display Screen",
          sourceUrl: "https://example.com/item/redmi-note-12-screen",
          rank: 1,
        },
      ];
    } else if (filename.includes("unknown")) {
      manufacturer = "";
      model = "";
      candidates = [
        {
          title: "Generic Mobile Phone Replacement Part",
          rank: 1,
        },
      ];
    }

    const { cleanVisualCandidatesHeuristic, cleanRawCandidateTitle } = await import("./decision");
    const cleanDecision = cleanVisualCandidatesHeuristic(candidates, { filename });
    const cleanedCandidateList = candidates.map((c, idx) => ({
      ...c,
      title: cleanDecision.cleanedCandidates[idx] || cleanRawCandidateTitle(c.title) || c.title,
    }));

    const resolvedManufacturer = cleanDecision.manufacturer || manufacturer || undefined;
    const resolvedModel = cleanDecision.model || model || undefined;

    return {
      provider: this.name,
      candidates: cleanedCandidateList,
      cleanDecision,
      normalizedManufacturer: resolvedManufacturer,
      normalizedModel: resolvedModel,
      detectedDisplayAssembly:
        cleanDecision.displayName || (resolvedModel ? `${resolvedManufacturer} ${resolvedModel} Display` : undefined),
      durationMs: Date.now() - startTime,
      rawResponse: {
        mock_mode: true,
        detected_candidates_count: candidates.length,
      },
    };
  }
}
