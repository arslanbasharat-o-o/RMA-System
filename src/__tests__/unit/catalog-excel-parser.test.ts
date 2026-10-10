import { describe, it, expect } from "vitest";
import { parseCatalogRow, parseCatalogWorkbook } from "@/lib/catalog/excelParser";
import fs from "fs";
import path from "path";

describe("Catalog Excel Parser & Normalization Engine", () => {
  it("should parse an iPhone row and extract technology, manufacturer, and aliases", () => {
    const seen = new Set<string>();
    const item = parseCatalogRow(
      "LCD Assembly for iPhone XR (Incell)",
      "Liphone XR Incell",
      2,
      seen
    );

    expect(item).not.toBeNull();
    expect(item?.manufacturer).toBe("Apple");
    expect(item?.modelName).toBe("iPhone XR");
    expect(item?.displayTechnology).toBe("In-cell LCD");
    expect(item?.internalSku).toBe("Liphone XR Incell");
    expect(item?.aliases).toContain("iPhone XR");
    expect(item?.aliases).toContain("Liphone XR Incell");
  });

  it("should parse a OnePlus row correctly", () => {
    const seen = new Set<string>();
    const item = parseCatalogRow(
      "LCD Assembly For One Plus 5T Without Frame (Refurbished)",
      "LOnePlus 5T LCD",
      3,
      seen
    );

    expect(item).not.toBeNull();
    expect(item?.manufacturer).toBe("OnePlus");
    expect(item?.modelName).toBe("One Plus 5T");
    expect(item?.internalSku).toBe("LOnePlus 5T LCD");
  });

  it("should parse a Samsung Note 9 row correctly", () => {
    const seen = new Set<string>();
    const item = parseCatalogRow(
      "Premium Assembly for Samsung Galaxy Note 9 Blue (Refurbished)",
      "LNote 9 Blue",
      4,
      seen
    );

    expect(item).not.toBeNull();
    expect(item?.manufacturer).toBe("Samsung");
    expect(item?.modelName).toBe("Samsung Galaxy Note 9");
  });

  it("should parse Motorola and extract XT model codes", () => {
    const seen = new Set<string>();
    const item = parseCatalogRow(
      "LCD Assembly For G POWER XT2117 without frame (Refurbished)",
      "LMoto XT-2117 LCD",
      5,
      seen
    );

    expect(item).not.toBeNull();
    expect(item?.manufacturer).toBe("Motorola");
    expect(item?.knownPartNumbers).toContain("XT2117");
  });

  it("should generate collision-free slugs across duplicate names", () => {
    const seen = new Set<string>();
    const item1 = parseCatalogRow("Generic Screen", "SKU-1", 1, seen);
    const item2 = parseCatalogRow("Generic Screen", "SKU-1", 2, seen);

    expect(item1?.normalizedModelIdentifier).toBe("generic-screen-sku-1");
    expect(item2?.normalizedModelIdentifier).toBe("generic-screen-sku-1-1");
  });

  it("should parse the actual catalog.xlsx file if present and verify product records", async () => {
    const catalogPath = path.resolve("data/catalog.xlsx");
    if (fs.existsSync(catalogPath)) {
      const items = await parseCatalogWorkbook(catalogPath);
      expect(items.length).toBeGreaterThan(2400);
      expect(items.some((it) => it.manufacturer === "Apple")).toBe(true);
      expect(items.some((it) => it.manufacturer === "Samsung")).toBe(true);
      expect(items.some((it) => it.manufacturer === "OnePlus")).toBe(true);
      expect(items.some((it) => it.manufacturer === "Motorola")).toBe(true);
    }
  });
});
