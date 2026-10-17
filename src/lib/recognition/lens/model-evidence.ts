import type { VisualCandidate } from "./types";

/** Read device names from each source title, retaining Pro/Max/Plus variants. */
export function extractAppleModels(title: string): string[] {
  const models = new Set<string>();
  const modelPattern = "(\\d{1,2}|se|xr|xs|x)\\s*(pro\\s*max|pro|plus|mini|max)?";
  const add = (generation: string, suffix = "") => {
    const variant = suffix.toLowerCase().replace(/pro\s*max/g, "pro max").replace(/\s+/g, " ").trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    models.add(`iPhone ${generation.toUpperCase()}${variant ? ` ${variant}` : ""}`);
  };
  for (const match of title.matchAll(/\biphone\s*(\d{1,2}|se|xr|xs|x)\s*(pro\s*max|pro|plus|mini|max)?\b/gi)) {
    add(match[1], match[2]);
  }
  // Compatibility listings often omit a repeated "iPhone", e.g. "iPhone 12 / 12 Mini".
  const repeatedGeneration = new RegExp(`\\biphone\\s*${modelPattern}\\s*(?:/|\\bor\\b|&)\\s*(?:iphone\\s*)?${modelPattern}\\b`, "gi");
  for (const match of title.matchAll(repeatedGeneration)) {
    add(match[1], match[2]);
    add(match[3], match[4]);
  }
  // Other listings abbreviate the second option to only its variant: "iPhone 16 Pro / Pro Max".
  const repeatedVariant = /\biphone\s*(\d{1,2}|se|xr|xs|x)\s*(pro\s*max|pro|plus|mini|max)?\s*(?:\/|\bor\b|&)\s*(pro\s*max|pro|plus|mini|max)\b/gi;
  for (const match of title.matchAll(repeatedVariant)) {
    add(match[1], match[2]);
    add(match[1], match[3]);
  }
  // Repair listings commonly abbreviate the model as "16Pro bad lcd".
  if (!models.size && /\b(?:lcd|oled|screen|display)\b/i.test(title) &&
      !/\b(?:pixel|google|galaxy|samsung|oneplus|one\s+plus|xiaomi|redmi|poco|oppo|realme|vivo|huawei|honor|motorola)\b/i.test(title)) {
    for (const match of title.matchAll(/\b(\d{1,2})\s*(pro\s*max|pro|plus|mini)\b/gi)) {
      add(match[1], match[2]);
    }
  }
  return [...models];
}

export function appleVisualEvidence(candidates: VisualCandidate[]) {
  const otherDevice = /\b(?:galaxy|samsung|pixel|google|oneplus|one\s+plus|xiaomi|redmi|poco|oppo|realme|vivo|huawei|honor|motorola)\b/i;
  const displayListing = /\b(?:screen|display|lcd|oled|amoled|digitizer|touch\s*screen|panel|assembly|replacement)\b/i;
  const accessory = /\b(?:case|cover|screen\s*protector|protector|tempered\s*glass|camera\s*lens|lens\s*protector|charger|cable|battery|adhesive|glue|tools?|repair\s*kit)\b/i;
  const rankedCandidates = [...candidates]
    .filter((candidate) => Number.isFinite(candidate.rank) && candidate.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 20);
  const firstSpecific = rankedCandidates.find((candidate) => extractAppleModels(candidate.title).length || otherDevice.test(candidate.title));
  if (firstSpecific && !extractAppleModels(firstSpecific.title).length) return null;

  const scores = new Map<string, { score: number; sources: Set<string> }>();
  const seenSources = new Set<string>();
  let mixedListings = 0;
  let accessoryListings = 0;
  let irrelevantListings = 0;
  let unattributedListings = 0;
  let appleModelMentions = 0;
  let corroboratedListings = 0;

  for (const candidate of rankedCandidates) {
    const models = extractAppleModels(candidate.title);
    if (models.length) appleModelMentions += 1;
    if (models.length > 1 || (models.length && otherDevice.test(candidate.title))) {
      mixedListings += 1;
      continue;
    }
    if (models.length !== 1 || otherDevice.test(candidate.title)) {
      irrelevantListings += 1;
      continue;
    }
    if (accessory.test(candidate.title)) {
      accessoryListings += 1;
      continue;
    }
    if (!displayListing.test(candidate.title)) {
      irrelevantListings += 1;
      continue;
    }

    const source = independentSource(candidate.sourceUrl, candidate.sourceName);
    if (!source) {
      // Titles alone are not independent sources. Keep these results in review
      // when neither a publisher URL nor a publisher label is attributable.
      unattributedListings += 1;
      continue;
    }
    if (seenSources.has(source)) continue;
    seenSources.add(source);

    const entry = scores.get(models[0]) || { score: 0, sources: new Set<string>() };
    entry.score += 1 / Math.log2(candidate.rank + 1);
    entry.sources.add(source);
    scores.set(models[0], entry);
    corroboratedListings += 1;
  }

  const detail = `${corroboratedListings} independent display listings; ${mixedListings} mixed-model, ${accessoryListings} accessory, ${irrelevantListings} unrelated or non-display, ${unattributedListings} unattributed results ignored`;
  if (!scores.size) return mixedListings || appleModelMentions ? {
    model: null,
    confidence: 0.45,
    reasoning: `No attributable single-device display listing was decisive across the top ${rankedCandidates.length} results (${detail}). Manual review is required.`,
  } : null;

  const ranked = [...scores].sort((a, b) => b[1].score - a[1].score);
  const [winner, runner] = ranked;
  const ratio = runner ? winner[1].score / runner[1].score : Number.POSITIVE_INFINITY;
  const decisive = winner[1].sources.size >= 3 && ratio >= 1.8;
  if (!decisive && runner) {
    return {
      model: null,
      confidence: 0.45,
      reasoning: `The top ${rankedCandidates.length} results split between ${winner[0]} and ${runner[0]} without a decisive margin (${detail}). Manual review is required.`,
    };
  }

  if (!decisive) {
    return {
      model: null,
      confidence: 0.45,
      reasoning: `${winner[0]} is only a leading suggestion with ${winner[1].sources.size} independent display source(s) (${detail}). Manual review is required.`,
    };
  }

  return {
    model: winner[0],
    confidence: 0.88,
    reasoning: `${winner[0]} leads with ${winner[1].sources.size} independent display sources in the top ${rankedCandidates.length} results (${detail}). This is a suggestion, not a confirmed identification.`,
  };
}

function independentSource(sourceUrl?: string, sourceName?: string): string | undefined {
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        if (host && !/(?:^|\.)(?:google|googleusercontent|gstatic)\.com$/.test(host)) return host;
      }
    } catch {
      // Google Lens sometimes provides a publisher label instead of a direct URL.
    }
  }

  const label = sourceName?.trim().toLowerCase().replace(/^www\./, "").replace(/[.,:;]+$/g, "");
  if (!label || /^google(?:\b|\.)/i.test(label) || /^(?:unknown|visual match)$/i.test(label)) {
    return undefined;
  }

  // Collapse country-specific marketplace labels such as Amazon.com/Amazon.ae
  // so one publisher cannot count as multiple independent sources.
  const domainLabel = label.match(/^([a-z0-9-]+)\.(?:com|net|org|co|ae|uk|de|fr|it|es|nl|se|no|dk|ca|us|au|nz|jp|cn|in)$/i);
  return (domainLabel?.[1] ?? label).replace(/\s+/g, " ");
}
