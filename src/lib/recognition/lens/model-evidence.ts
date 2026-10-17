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
  const firstSpecific = candidates.find((candidate) => extractAppleModels(candidate.title).length || otherDevice.test(candidate.title));
  if (firstSpecific && !extractAppleModels(firstSpecific.title).length) return null;
  const scores = new Map<string, number>();
  let mixedListing = false;
  let unconfirmedListing = false;
  for (const candidate of candidates) {
    const models = extractAppleModels(candidate.title);
    if (models.length > 1) mixedListing = true;
    if (models.length !== 1 || otherDevice.test(candidate.title)) unconfirmedListing = true;
    // A multi-device listing cannot identify one physical assembly.
    if (models.length !== 1) continue;
    scores.set(models[0], (scores.get(models[0]) || 0) + 1 / Math.max(1, candidate.rank));
  }
  if (!scores.size) return mixedListing ? {
    model: null,
    confidence: 0.45,
    reasoning: "The source listing names multiple devices and requires review.",
  } : null;
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const conflicting = ranked.length > 1 || mixedListing || unconfirmedListing;
  return {
    model: ranked[0][0],
    confidence: conflicting ? 0.45 : 0.88,
    reasoning: conflicting
      ? `Visual matches include different devices (${ranked.map(([model]) => model).join(", ")}). The leading ranked suggestion requires review.`
      : `Source titles identify ${ranked[0][0]}.`,
  };
}
