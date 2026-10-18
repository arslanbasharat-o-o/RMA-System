/**
 * Pure client-safe string cleaner for visual candidate titles.
 * Removes marketplace, e-commerce, packaging, and accessory noise from raw titles.
 */
export function cleanRawCandidateTitle(title: string): string {
  if (!title) return "";
  let cleaned = title;
  // Remove HTML entities or URLs
  cleaned = cleaned.replace(/&amp;/g, "&").replace(/https?:\/\/\S+/g, "");

  // Remove common listing noise prefixes / suffixes
  cleaned = cleaned.replace(
    /\b(?:OEM|Genuine|Original|Brand New|Refurbished|Refurb|Grade A\+?|High Quality|Premium Plus|Premium|Aftermarket|Service Pack|S\/P|AM)\b/gi,
    ""
  );
  cleaned = cleaned.replace(
    /\b(?:Screen Replacement|LCD Screen|Touch Screen|Display Assembly|Digitizer Assembly|Digitizer|Front Glass|OLED Assembly|Replacement Panel|Full Assembly|Panel Repair|Complete LCD Display Assembly|Complete Button Assembly|Top Case Assembly|with Frame|without Frame|no Frame|out Frame|W\/F|w\/frame|in Frame|with Bezel|with Housing)\b/gi,
    ""
  );
  cleaned = cleaned.replace(
    /\b(?:eBay|Amazon|AliExpress|Walmart|Temu|iFixit|Supplier|PhoneRemedies|Free Shipping|Tools Included|with Tools|Opening Tools|Tools|Repair Kit|Kit|Adhesive)\b/gi,
    ""
  );
  // Remove stock status and rating snippets from Google Lens cards
  cleaned = cleaned.replace(/\b(?:In stock|Out of stock|In-stock)\b/gi, "");
  cleaned = cleaned.replace(/(?:·|\s)\s*\d\.\d\s*(?:·|\s|$)/g, " ");
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, ""); // Remove parentheticals like (Black), (6.1 inch), (Service Pack)
  cleaned = cleaned.replace(
    /\b(?:All Colors|Black|White|Gold|Blue|Purple|Space Gray|Silver|Gray|Red|Pink|Yellow|Coral|Turquoise|Lavender|Green|Cream|Graphite|Lime|Starlight)\b/gi,
    ""
  );
  cleaned = cleaned.replace(/["'”’|]/g, "");
  cleaned = cleaned.replace(/\s*[-–—]+\s*$/, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

/**
 * Strips distributor packaging prefixes and frame tags from catalog model names.
 * e.g. "out Frame for Samsung Galaxy S26 Ultra 5G" -> "Galaxy S26 Ultra 5G"
 */
export function cleanCatalogModelName(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^(?:out\s*frame\s*(?:for)?|without\s*frame\s*(?:for)?|with\s*frame\s*(?:for)?|w\/\s*frame\s*(?:for)?|lcd\s*assembly\s*(?:for)?)\s*/gi, "")
    .replace(/\s*(?:with\s*frame|without\s*frame|out\s*frame|w\/\s*frame|with\s*digitizer|refurbished|aftermarket)$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

const KNOWN_OLED_MODELS = /\b(?:iphone\s*(?:x|xs|11\s*pro|12|13|14|15|16)|galaxy\s*(?:s\d{1,2}|note\s*\d{1,2}|z\s*(?:fold|flip))|pixel\s*[6-9]|oneplus\s*(?:[7-9]|1[0-5]))\b/i;

/**
 * Sanitizes display technology tag to prevent flagships from incorrectly displaying as LCD.
 */
export function sanitizeDisplayTechnology(modelName: string, technology?: string | null): string | null {
  if (!technology) return null;
  const techTrimmed = technology.trim();
  if (KNOWN_OLED_MODELS.test(modelName) && /\blcd\b/i.test(techTrimmed)) {
    // Flagship OLED devices should never show an LCD badge from a mislabeled catalog row
    return null;
  }
  return techTrimmed;
}
