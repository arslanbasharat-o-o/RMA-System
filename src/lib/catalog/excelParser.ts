import ExcelJS from "exceljs";
import path from "path";

export interface ParsedCatalogItem {
  manufacturer: string;
  modelName: string;
  normalizedModelIdentifier: string;
  aliases: string[];
  internalSku: string | null;
  knownPartNumbers: string[];
  displayTechnology: string;
  compatibleDeviceModels: string[];
  notes: string;
  isActive: boolean;
}

export function parseCatalogRow(
  rawName: string,
  rawSku: string,
  rowIndex: number,
  seenSlugs: Set<string>
): ParsedCatalogItem | null {
  const name = (rawName || "").trim();
  const sku = (rawSku || "").trim();
  if (!name && !sku) return null;

  const cleanSku = (sku || "").replace(/^L\s*/i, "").trim();
  const combined = `${name} ${cleanSku}`;

  // 1. Determine manufacturer
  let mfg = "Generic";
  if (
    /\b(?:iphone|ipad|ipod|iwatch|apple|macbook|mac\s*air|mac\s*pro|watch\s*series)\b/i.test(combined)
  ) {
    mfg = "Apple";
  } else if (
    /\b(?:samsung|galaxy|sm-[a-z0-9]+|gt-[a-z0-9]+|perx|prime|core)\b/i.test(combined)
  ) {
    mfg = "Samsung";
  } else if (
    /\b(?:one\s*plus|oneplus|nord)\b/i.test(combined)
  ) {
    mfg = "OnePlus";
  } else if (
    /\b(?:pixel|google|nexus)\b/i.test(combined) && !/\basus\b/i.test(combined)
  ) {
    mfg = "Google";
  } else if (
    /\b(?:moto|motorola|xt\s*-?\s*\d+|razr|edge)\b/i.test(combined)
  ) {
    mfg = "Motorola";
  } else if (
    /\b(?:huawei|honor|nova|p\d{2}\s*lite|p\d{2}e|p\d{2}\s*pro|mate\s*\d+|y\d[a-z]?)\b/i.test(combined)
  ) {
    mfg = "Huawei";
  } else if (
    /\b(?:xiaomi|redmi|poco|mi\s*\d+|mi\s*max|mi\s*a\d+)\b/i.test(combined)
  ) {
    mfg = "Xiaomi";
  } else if (
    /\b(?:oppo|reno|find\s*x|f\d{1,2}\s*pro|f\d{1,2}|k\d{1,2}[a-z]?)\b/i.test(combined)
  ) {
    mfg = "Oppo";
  } else if (
    /\b(?:realme|narzo)\b/i.test(combined)
  ) {
    mfg = "Realme";
  } else if (
    /\b(?:vivo|nex|iqoo)\b/i.test(combined)
  ) {
    mfg = "Vivo";
  } else if (
    /\b(?:lg|lm-[a-z0-9]+|stylo|velvet|thinq)\b/i.test(combined)
  ) {
    mfg = "LG";
  } else if (
    /\b(?:blade|zte|axon|nubia)\b/i.test(combined)
  ) {
    mfg = "ZTE";
  } else if (
    /\b(?:surface|microsoft|lumia)\b/i.test(combined)
  ) {
    mfg = "Microsoft";
  } else if (
    /\b(?:nokia)\b/i.test(combined)
  ) {
    mfg = "Nokia";
  } else if (
    /\b(?:asus|zenfone|zenpad|rog)\b/i.test(combined)
  ) {
    mfg = "Asus";
  } else if (
    /\b(?:coolpad|legacy)\b/i.test(combined)
  ) {
    mfg = "Coolpad";
  } else if (
    /\b(?:alcatel|onetouch|idol)\b/i.test(combined)
  ) {
    mfg = "Alcatel";
  } else if (
    /\b(?:tcl)\b/i.test(combined)
  ) {
    mfg = "TCL";
  } else if (
    /\b(?:amazon|fire)\b/i.test(combined)
  ) {
    mfg = "Amazon";
  } else if (
    /\b(?:sony|xperia)\b/i.test(combined)
  ) {
    mfg = "Sony";
  } else if (
    /\b(?:nothing\s*phone|nothing)\b/i.test(combined)
  ) {
    mfg = "Nothing";
  } else if (
    /\b(?:switch|nintendo)\b/i.test(combined)
  ) {
    mfg = "Nintendo";
  } else if (
    /\b(?:dell|chromebook)\b/i.test(combined)
  ) {
    mfg = "Dell";
  } else if (
    /\b(?:kyocera|duraforce)\b/i.test(combined)
  ) {
    mfg = "Kyocera";
  } else if (
    /\b(?:cat|caterpillar)\b/i.test(combined)
  ) {
    mfg = "CAT";
  } else if (
    /\b(?:blu|bold)\b/i.test(combined)
  ) {
    mfg = "BLU";
  } else if (
    /\b(?:lenovo|yoga|tab\s*p\d+|tab\s*m\d+)\b/i.test(combined)
  ) {
    mfg = "Lenovo";
  } else if (
    /\b(?:wiko)\b/i.test(combined)
  ) {
    mfg = "Wiko";
  } else if (
    /\b(?:tecno|spark|camon)\b/i.test(combined)
  ) {
    mfg = "Tecno";
  } else if (
    /\b(?:oukitel)\b/i.test(combined)
  ) {
    mfg = "Oukitel";
  } else if (
    /\b(?:essential|ph-1)\b/i.test(combined)
  ) {
    mfg = "Essential";
  } else if (
    /\b(?:zebra|tc\s*\d+)\b/i.test(combined)
  ) {
    mfg = "Zebra";
  } else if (
    /\b(?:at&t|radiant|fusion|motivate|maestro)\b/i.test(combined)
  ) {
    mfg = "AT&T";
  } else if (
    /\b(?:boost|celero)\b/i.test(combined)
  ) {
    mfg = "Boost Mobile";
  } else if (
    /\b(?:cricket)\b/i.test(combined)
  ) {
    mfg = "Cricket";
  } else if (
    /\b(?:revvl|revvlry)\b/i.test(combined)
  ) {
    mfg = "T-Mobile";
  }

  // 2. Display Technology
  let tech = "LCD";
  if (/\b(?:super\s*amoled|dynamic\s*amoled)\b/i.test(name)) {
    tech = "Super AMOLED";
  } else if (/\bamoled\b/i.test(name)) {
    tech = "AMOLED";
  } else if (/\boled\b/i.test(name)) {
    tech = "OLED";
  } else if (/\b(?:incell|in-cell)\b/i.test(name) || /\bincell\b/i.test(sku)) {
    tech = "In-cell LCD";
  } else if (/\bfog\b/i.test(name)) {
    tech = "FOG LCD";
  } else if (/\bcof\b/i.test(name)) {
    tech = "COF LCD";
  } else if (/\btft\b/i.test(name)) {
    tech = "TFT LCD";
  } else if (/\bips\b/i.test(name)) {
    tech = "IPS LCD";
  }

  // 3. Clean Model Name
  let cleaned = name;
  cleaned = cleaned.replace(
    /^(?:LCD\s*Assembly|Premium\s*Assembly|Premium\s*Soft\s*Assembly|Touch\s*Screen|Screen\s*Assembly|Assembly|Digitizer|Complete\s*(?:Button\s*)?Assembly|Complete\s*LCD\s*Display\s*Assembly)\s*(?:for|with|without)?\s*(?:frame\s*for|digitizer\s*for)?\s*/i,
    ""
  );
  cleaned = cleaned.replace(
    /\s*\((?:Refurbished|Reburbished|Incell|In-cell|FOG Quality|Premium Plus|Premium|Original|OEM|Service Pack|COF(?:\s*120hz)?|120hz|Late \d{4}|Mid \d{4}|Early \d{4}|UK Keyboard|All Colors|Black|White|Gold|Blue|Purple|Space Gray|Silver|Gray|Red|Pink|Yellow|Coral|Turquoise|Lavender|Green|Cream|Graphite|Lime|Starlight)[^)]*\)/gi,
    ""
  );
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, "");
  cleaned = cleaned.replace(/\s*(?:without\s*frame|with\s*frame|W\/F|no\s*frame)\b/gi, "");
  cleaned = cleaned.replace(/\s*(?:Refurbished|Reburbished|Refurb)\b/gi, "");
  cleaned = cleaned.replace(/\s*[-–—]?\s*(?:Service Pack|Aftermarket|S\/P|AM)\b/gi, "");
  cleaned = cleaned.replace(
    /\s*(?:All Colors|Black|White|Gold|Blue|Purple|Space Gray|Silver|Gray|Red|Pink|Yellow|Coral|Turquoise|Lavender|Green|Cream|Graphite|Lime|Starlight)\b/gi,
    ""
  );
  cleaned = cleaned.replace(/\s*[-–—]+\s*$/, "");
  cleaned = cleaned.replace(/[()]/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (!cleaned) cleaned = name;

  // 4. Extracted Model Codes / Part Numbers
  const codes: string[] = [];
  const codeRegex = /\b((?:SM|GT|XT|LM|A|N)\s*-?\s*[0-9]{3,5}[A-Z0-9]*)\b/gi;
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = codeRegex.exec(name)) !== null) {
    const formatted = codeMatch[1].replace(/\s+/g, "");
    if (!codes.includes(formatted)) codes.push(formatted);
  }
  const lpRegex = /\b(LP[0-9]{3}[A-Z0-9]+)\b/gi;
  while ((codeMatch = lpRegex.exec(name)) !== null) {
    if (!codes.includes(codeMatch[1])) codes.push(codeMatch[1]);
  }

  // 5. Unique Normalized Model Identifier (Slug)
  const slugPrefix = mfg !== "Generic" && !cleaned.toLowerCase().startsWith(mfg.toLowerCase())
    ? `${mfg} ${cleaned}`
    : cleaned;
  const baseSlugSource = cleanSku ? `${slugPrefix} ${cleanSku}` : slugPrefix;
  const baseSlug = baseSlugSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `item-${rowIndex}`;

  let uniqueSlug = baseSlug;
  let counter = 1;
  while (seenSlugs.has(uniqueSlug)) {
    uniqueSlug = `${baseSlug}-${counter++}`;
  }
  seenSlugs.add(uniqueSlug);

  // 6. Rich Aliases
  const aliases: string[] = [];
  const addAlias = (val: string) => {
    const trimmed = (val || "").trim();
    if (trimmed && !aliases.includes(trimmed)) {
      aliases.push(trimmed);
    }
  };

  addAlias(name);
  addAlias(cleaned);
  if (mfg !== "Generic") {
    addAlias(`${mfg} ${cleaned}`);
  }
  if (sku) addAlias(sku);
  if (cleanSku) addAlias(cleanSku);

  // Handle common variations (OnePlus vs One Plus)
  if (cleaned.includes("One Plus")) {
    addAlias(cleaned.replace(/One Plus/g, "OnePlus"));
  } else if (cleaned.includes("OnePlus")) {
    addAlias(cleaned.replace(/OnePlus/g, "One Plus"));
  }

  // Base model without 5G/4G suffix
  if (/\b(?:5G|4G|LTE)\b/i.test(cleaned)) {
    const baseModel = cleaned.replace(/\s*\b(?:5G|4G|LTE)\b/gi, "").trim();
    if (baseModel) {
      addAlias(baseModel);
      if (mfg !== "Generic") addAlias(`${mfg} ${baseModel}`);
    }
  }

  for (const c of codes) {
    addAlias(c);
  }

  return {
    manufacturer: mfg,
    modelName: cleaned,
    normalizedModelIdentifier: uniqueSlug,
    aliases,
    internalSku: sku || null,
    knownPartNumbers: codes,
    displayTechnology: tech,
    compatibleDeviceModels: [cleaned, `${mfg} ${cleaned}`.trim()],
    notes: `Catalog Product: ${name}`,
    isActive: true,
  };
}

export async function parseCatalogWorkbook(filePath: string): Promise<ParsedCatalogItem[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(filePath));
  const sheet = wb.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return [];

  const seenSlugs = new Set<string>();
  const items: ParsedCatalogItem[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = (row.getCell(1).text || "").trim();
    const sku = (row.getCell(2).text || "").trim();
    const item = parseCatalogRow(name, sku, r, seenSlugs);
    if (item) {
      items.push(item);
    }
  }

  return items;
}
