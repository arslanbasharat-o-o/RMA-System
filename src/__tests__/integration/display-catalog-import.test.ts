import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { displayCatalog, sessions, users } from "@/db/schema";
import { createSessionToken } from "@/lib/auth/session";
import { POST } from "@/app/api/display-catalog/import/route";
import { eq, inArray } from "drizzle-orm";

describe("Display catalog XLSX import API", () => {
  const identifierPrefix = `qa-import-${Date.now()}`;
  const email = `${identifierPrefix}@rma.internal`;
  let userId = "";
  let sessionToken = "";

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      email,
      name: "Catalog Import QA",
      role: "admin",
      passwordHash: "unused-test-hash",
      active: true,
    }).returning({ id: users.id });
    userId = user.id;
    sessionToken = await createSessionToken({ userId, email, name: "Catalog Import QA", role: "admin" });
  });

  afterAll(async () => {
    await db.delete(displayCatalog).where(inArray(displayCatalog.normalizedModelIdentifier, [
      `${identifierPrefix}-one`, `${identifierPrefix}-formula`,
    ]));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  async function workbookWithRows(
    rows: Array<Array<string | { formula: string; result: string }>>,
    headers = ["Manufacturer", "Model Name", "Normalized Model Identifier", "Known Part Numbers", "Aliases"]
  ) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Catalog");
    sheet.addRow(headers);
    for (const values of rows) {
      const row = sheet.addRow([]);
      values.forEach((value, index) => {
        row.getCell(index + 1).value = value as ExcelJS.CellValue;
      });
    }
    const bytes = await workbook.xlsx.writeBuffer();
    return new File([new Uint8Array(bytes)], "catalog.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async function importFile(file: File) {
    const form = new FormData();
    form.set("file", file);
    const request = new NextRequest("http://localhost/api/display-catalog/import", {
      method: "POST",
      headers: { cookie: `rma_session=${sessionToken}` },
      body: form,
    });
    return POST(request);
  }

  it("imports plain-text identifiers and list cells, then rejects existing identifiers", async () => {
    const file = await workbookWithRows([[
      "QA Manufacturer", "Model One", `${identifierPrefix}-one`, "00123, AB-9", "One; ModelOne",
    ]]);
    const response = await importFile(file);
    expect(response.status).toBe(200);
    expect((await response.json()).importedCount).toBe(1);

    const [stored] = await db.select().from(displayCatalog)
      .where(eq(displayCatalog.normalizedModelIdentifier, `${identifierPrefix}-one`));
    expect(stored.knownPartNumbers).toEqual(["00123", "AB-9"]);
    expect(stored.aliases).toEqual(["One", "ModelOne"]);

    const duplicate = await importFile(file);
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).rowErrors[0].row).toBe(2);
  });

  it("rejects formula cells without importing otherwise valid rows", async () => {
    const file = await workbookWithRows([
      ["QA Manufacturer", "Model Formula", `${identifierPrefix}-formula`, "", ""],
      ["Other Maker", "Model With Formula", { formula: '"ignored"', result: "ignored" }, "", ""],
    ]);
    const response = await importFile(file);
    expect(response.status).toBe(400);
    expect((await response.json()).rowErrors[0].row).toBe(3);
    const stored = await db.select().from(displayCatalog)
      .where(eq(displayCatalog.normalizedModelIdentifier, `${identifierPrefix}-formula`));
    expect(stored).toHaveLength(0);
  });
});
