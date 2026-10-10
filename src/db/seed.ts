import fs from "node:fs";
import path from "node:path";
import { pool, db } from "./index";
import { appSettings, displayCatalog, returnReasons, users } from "./schema";
import { hashPassword } from "../lib/auth/password";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  const isProduction = process.env.NODE_ENV === "production";
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase().trim();
  if (!initialAdminEmail) {
    throw new Error("Set INITIAL_ADMIN_EMAIL before database seeding.");
  }
  if (isProduction && !process.env.LENS_PROVIDER) {
    throw new Error("Set LENS_PROVIDER before production seeding.");
  }

  const catalogPath = path.resolve("data/catalog.xlsx");
  console.log("Seeding configured administrator, standard return reasons, catalog, and settings...");

  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, initialAdminEmail));

  let adminId: string;
  if (!existingAdmin) {
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!initialPassword || initialPassword.length < 16) {
      throw new Error("Set INITIAL_ADMIN_PASSWORD to a unique password with at least 16 characters before creating an administrator.");
    }

    const [admin] = await db
      .insert(users)
      .values({
        email: initialAdminEmail,
        name: process.env.INITIAL_ADMIN_NAME || "System Administrator",
        passwordHash: await hashPassword(initialPassword),
        role: "admin",
        active: true,
      })
      .returning({ id: users.id });
    adminId = admin.id;
    console.log("Created the configured administrator.");
  } else {
    adminId = existingAdmin.id;
    console.log("Configured administrator already exists.");
  }

  const reasonsData = [
    { code: "DEFECTIVE", label: "Defective display", description: "Display panel does not meet OEM quality standards", sortOrder: 1 },
    { code: "TOUCH_ISSUE", label: "Touch issue / Unresponsive", description: "Touch digitizer unresponsive, ghost touch or jitter", sortOrder: 2 },
    { code: "NO_DISPLAY", label: "No display / Black screen", description: "Backlight or OLED panel fails to illuminate", sortOrder: 3 },
    { code: "FLICKERING", label: "Display flickering / Lines", description: "Horizontal or vertical lines, strobe flickering", sortOrder: 4 },
    { code: "PHYSICAL_DAMAGE", label: "Physical damage", description: "Cracked glass, damaged flex cable, connector bent", sortOrder: 5 },
    { code: "WRONG_ITEM", label: "Wrong item sent", description: "Incorrect model or specification received", sortOrder: 6 },
    { code: "COMPATIBILITY", label: "Compatibility issue", description: "Screen revision incompatible with board firmware", sortOrder: 7 },
    { code: "OTHER", label: "Other", description: "Other return reason (specify in notes)", sortOrder: 8 },
  ];

  for (const reason of reasonsData) {
    const [existing] = await db
      .select({ id: returnReasons.id })
      .from(returnReasons)
      .where(eq(returnReasons.code, reason.code));
    if (!existing) await db.insert(returnReasons).values(reason);
  }

  if (fs.existsSync(catalogPath)) {
    const { parseCatalogWorkbook } = await import("../lib/catalog/excelParser");
    const items = await parseCatalogWorkbook(catalogPath);
    const existingRows = await db
      .select({ normalizedModelIdentifier: displayCatalog.normalizedModelIdentifier })
      .from(displayCatalog);
    const existingIdentifiers = new Set(existingRows.map((row) => row.normalizedModelIdentifier));
    const missingItems = items.filter((item) => !existingIdentifiers.has(item.normalizedModelIdentifier));

    for (let offset = 0; offset < missingItems.length; offset += 100) {
      await db.insert(displayCatalog).values(missingItems.slice(offset, offset + 100));
    }
    console.log(`Catalog workbook verified (${items.length} products).`);
  } else {
    console.log("No private catalog workbook supplied; import a catalog from the admin interface when ready.");
  }

  const defaultSettings = [
    {
      key: "LENS_PROVIDER",
      value: process.env.LENS_PROVIDER || "mock",
      description: "Active visual recognition provider adapter",
    },
    {
      key: "OPENAI_VISION_MODEL",
      value: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      description: "OpenAI model used for structured vision OCR",
    },
    {
      key: "BUSINESS_TIMEZONE",
      value: process.env.BUSINESS_TIMEZONE || "UTC",
      description: "Default display timezone for timestamps",
    },
    {
      key: "MIN_VERIFICATION_CONFIDENCE",
      value: 0.9,
      description: "Threshold for automatic high-confidence suggestions",
    },
    {
      key: "STORAGE_DRIVER",
      value: process.env.STORAGE_DRIVER || "local",
      description: "Private storage driver implementation",
    },
  ];

  for (const setting of defaultSettings) {
    const [existing] = await db
      .select({ key: appSettings.key })
      .from(appSettings)
      .where(eq(appSettings.key, setting.key));
    if (!existing) {
      await db.insert(appSettings).values({
        ...setting,
        updatedByUserId: adminId,
      });
    }
  }

  console.log("Database seeding completed successfully.");
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes("seed")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Seeding failed:", error);
      process.exit(1);
    });
}
