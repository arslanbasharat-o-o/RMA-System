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
    /\b(?:Screen Replacement|LCD Screen|Touch Screen|Display Assembly|Digitizer Assembly|Digitizer|Front Glass|OLED Assembly|Replacement Panel|Full Assembly|Panel Repair|Complete LCD Display Assembly|Complete Button Assembly|Top Case Assembly|with Frame|without Frame|no Frame|W\/F)\b/gi,
    ""
  );
  cleaned = cleaned.replace(
    /\b(?:eBay|Amazon|AliExpress|Walmart|Free Shipping|Tools Included|with Tools|Opening Tools|Tools|Repair Kit|Kit|Adhesive)\b/gi,
    ""
  );
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, ""); // Remove parentheticals like (Black), (6.1 inch), (Service Pack)
  cleaned = cleaned.replace(
    /\b(?:All Colors|Black|White|Gold|Blue|Purple|Space Gray|Silver|Gray|Red|Pink|Yellow|Coral|Turquoise|Lavender|Green|Cream|Graphite|Lime|Starlight)\b/gi,
    ""
  );
  cleaned = cleaned.replace(/["'”’]/g, "");
  cleaned = cleaned.replace(/\s*[-–—]+\s*$/, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}
