import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { displayCatalog } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { inArray } from "drizzle-orm";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DATA_ROWS = 10000;
const MAX_COLUMNS = 30;

const HEADER_ALIASES: Record<string, string[]> = {
  manufacturer: ["manufacturer", "brand"],
  modelName: ["model name", "model", "device model", "product name", "product", "item name"],
  normalizedModelIdentifier: ["normalized model identifier", "normalized identifier", "identifier"],
  internalSku: ["internal sku", "sku", "product sku", "item sku"],
  aliases: ["aliases", "model aliases"],
  knownPartNumbers: ["known part numbers", "part numbers", "part numbers / codes"],
  displayTechnology: ["display technology", "technology"],
  compatibleDeviceModels: ["compatible device models", "compatible models"],
  notes: ["notes"],
  isActive: ["is active", "active"],
};

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) {
    throw new Error("Formula cells are not supported; replace formulas with plain text values.");
  }
  return cell.text.trim();
}

function splitList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
      throw new Error("List JSON must contain only strings.");
    }
    return parsed.map((entry) => entry.trim()).filter(Boolean);
  }
  return trimmed.split(/[,;|\n]/).map((entry) => entry.trim()).filter(Boolean);
}

function identifierFor(manufacturer: string, modelName: string) {
  return `${manufacturer}-${modelName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Display Catalog");
  sheet.addRow([
    "Manufacturer", "Model Name", "Normalized Model Identifier", "Internal SKU", "Aliases",
    "Known Part Numbers", "Display Technology", "Compatible Device Models", "Notes", "Is Active",
  ]);
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=display-catalog-template.xlsx",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an .xlsx workbook to import." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Upload a non-empty .xlsx file no larger than 5 MB." }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    const workbookBytes = Buffer.from(await file.arrayBuffer());
    await workbook.xlsx.load(workbookBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      return NextResponse.json({ error: "The workbook needs a header row and at least one data row." }, { status: 400 });
    }
    if (sheet.rowCount - 1 > MAX_DATA_ROWS || sheet.columnCount > MAX_COLUMNS) {
      return NextResponse.json({ error: `The first sheet can contain at most ${MAX_DATA_ROWS} data rows and ${MAX_COLUMNS} columns.` }, { status: 400 });
    }

    const headers = new Map<string, number>();
    const headerRow = sheet.getRow(1);
    for (let column = 1; column <= sheet.columnCount; column++) {
      const header = cellText(headerRow.getCell(column)).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
      if (!header) continue;
      const field = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(header))?.[0];
      if (!field) continue;
      if (headers.has(field)) {
        return NextResponse.json({ error: `The header "${header}" is mapped more than once.` }, { status: 400 });
      }
      headers.set(field, column);
    }
    if (!headers.has("manufacturer") && !headers.has("modelName")) {
      return NextResponse.json({ error: "Required columns: Manufacturer and Model Name (or Product Name). Use the downloadable template for all supported columns." }, { status: 400 });
    }

    const errors: Array<{ row: number; column: string; message: string }> = [];
    const rows: Array<typeof displayCatalog.$inferInsert> = [];
    const firstRowByIdentifier = new Map<string, number>();
    const { parseCatalogRow } = await import("@/lib/catalog/excelParser");

    const seenSlugs = new Set<string>();

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      try {
        const read = (field: string) => {
          const column = headers.get(field);
          return column ? cellText(row.getCell(column)) : "";
        };
        let manufacturer = read("manufacturer");
        let modelName = read("modelName");
        const internalSku = read("internalSku");
        let displayTech = read("displayTechnology");
        const rawIdentifier = read("normalizedModelIdentifier");

        const parsedItem = (!manufacturer && modelName) || !rawIdentifier
          ? parseCatalogRow(modelName, internalSku, rowNumber, seenSlugs)
          : null;

        if (parsedItem) {
          if (!manufacturer) manufacturer = parsedItem.manufacturer;
          if (!modelName) modelName = parsedItem.modelName;
          if (!displayTech) displayTech = parsedItem.displayTechnology;
        }

        if (!manufacturer || !modelName) {
          if (Array.from({ length: sheet.columnCount }, (_, index) => row.getCell(index + 1).value).every((value) => value == null || value === "")) continue;
          errors.push({ row: rowNumber, column: !manufacturer ? "Manufacturer" : "Model Name", message: "This field is required." });
          continue;
        }
        if (manufacturer.length > 160 || modelName.length > 200) {
          errors.push({ row: rowNumber, column: "Manufacturer / Model Name", message: "Manufacturer and model name must be 160 and 200 characters or fewer." });
          continue;
        }
        const identifier = (rawIdentifier || parsedItem?.normalizedModelIdentifier || identifierFor(manufacturer, modelName)).toLowerCase().trim();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifier)) {
          errors.push({ row: rowNumber, column: "Normalized Model Identifier", message: "Use lowercase letters, numbers, and single hyphens only." });
          continue;
        }
        if (rawIdentifier) {
          const priorRow = firstRowByIdentifier.get(identifier);
          if (priorRow) {
            errors.push({ row: rowNumber, column: "Normalized Model Identifier", message: `Duplicates row ${priorRow} in this workbook.` });
            continue;
          }
        }
        firstRowByIdentifier.set(identifier, rowNumber);

        const boolValue = read("isActive").toLowerCase();
        let isActive: boolean | undefined;
        if (boolValue) {
          if (["true", "yes", "1", "active"].includes(boolValue)) isActive = true;
          else if (["false", "no", "0", "inactive"].includes(boolValue)) isActive = false;
          else {
            errors.push({ row: rowNumber, column: "Is Active", message: "Use true/false, yes/no, 1/0, or active/inactive." });
            continue;
          }
        }
        const aliases = splitList(read("aliases"));
        if (!aliases.length && parsedItem?.aliases) {
          aliases.push(...parsedItem.aliases);
        }
        const knownPartNumbers = splitList(read("knownPartNumbers"));
        if (!knownPartNumbers.length && parsedItem?.knownPartNumbers) {
          knownPartNumbers.push(...parsedItem.knownPartNumbers);
        }
        const compatibleDeviceModels = splitList(read("compatibleDeviceModels"));
        if (!compatibleDeviceModels.length && parsedItem?.compatibleDeviceModels) {
          compatibleDeviceModels.push(...parsedItem.compatibleDeviceModels);
        }
        if ([aliases, knownPartNumbers, compatibleDeviceModels].some((list) => list.length > 100)) {
          errors.push({ row: rowNumber, column: "Aliases / Part Numbers / Compatible Models", message: "Each list may contain at most 100 entries." });
          continue;
        }
        rows.push({
          manufacturer,
          modelName,
          normalizedModelIdentifier: identifier,
          internalSku: read("internalSku") || null,
          aliases,
          knownPartNumbers,
          displayTechnology: displayTech || read("displayTechnology") || null,
          compatibleDeviceModels,
          notes: read("notes") || (parsedItem?.notes || null),
          isActive: isActive ?? true,
        });
      } catch (error) {
        errors.push({ row: rowNumber, column: "Workbook values", message: error instanceof Error ? error.message : "Invalid cell value." });
      }
    }

    if (errors.length) return NextResponse.json({ error: "Fix the workbook rows and import again.", rowErrors: errors }, { status: 400 });
    if (!rows.length) return NextResponse.json({ error: "No catalog rows were found to import." }, { status: 400 });

    const identifiers = rows.map((row) => row.normalizedModelIdentifier!);
    const existing = await db
      .select({ normalizedModelIdentifier: displayCatalog.normalizedModelIdentifier })
      .from(displayCatalog)
      .where(inArray(displayCatalog.normalizedModelIdentifier, identifiers));
    if (existing.length) {
      const existingSet = new Set(existing.map((row) => row.normalizedModelIdentifier));
      const rowErrors = rows.flatMap((row) => existingSet.has(row.normalizedModelIdentifier!)
        ? [{ row: firstRowByIdentifier.get(row.normalizedModelIdentifier!) || 0, column: "Normalized Model Identifier", message: "This identifier already exists in the catalog." }]
        : []);
      return NextResponse.json({ error: "The workbook contains products that already exist.", rowErrors }, { status: 409 });
    }

    const inserted = await db.transaction(async (tx) => tx.insert(displayCatalog).values(rows).returning({ id: displayCatalog.id }));
    return NextResponse.json({ success: true, importedCount: inserted.length });
  } catch (error) {
    console.error("Display catalog XLSX import failed:", error);
    return NextResponse.json({ error: "The workbook could not be read or saved. Check that it is a valid .xlsx file." }, { status: 400 });
  }
}
