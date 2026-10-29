import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "./index";
import { seededDisplayProducts, seededDisplayReferences } from "./schema";
import { storage } from "../lib/storage";

const SeedManifestSchema = z.object({
  version: z.literal(1),
  excludedSamples: z.array(z.object({
    displayId: z.string(), imageId: z.string(), reason: z.string(),
  })).default([]),
  products: z.array(z.object({
    sourceKey: z.string().min(1),
    manufacturer: z.string().min(1),
    modelName: z.string().min(1),
    variantName: z.string().min(1),
    printedTitle: z.string().min(1),
    barcodeValue: z.string().nullable(),
    barcodeFormat: z.string().nullable(),
    barcodeSymbology: z.string().nullable(),
    supplierSku: z.string().nullable(),
    otherCodes: z.array(z.object({ value: z.string(), source: z.string(), category: z.string() })),
    references: z.array(z.object({
      displayId: z.string().min(1),
      imageId: z.string().min(1),
      imagePath: z.string().min(1),
      crop: z.record(z.string(), z.union([z.string(), z.number()])),
      readableMarkings: z.array(z.object({
        text: z.string(), type: z.string(), location: z.string(), confidence: z.string(),
      })),
    })),
  })),
});

type SeedProduct = z.infer<typeof SeedManifestSchema>["products"][number];

function parseArguments(args: string[]) {
  return {
    apply: args.includes("--apply"),
    allowRemote: args.includes("--allow-remote"),
    seedDir: path.resolve(/*turbopackIgnore: true*/ process.env.DISPLAY_INVENTORY_SEED_DIR || ".local/display-inventory-seed"),
  };
}

function ensureLocalDatabase(allowRemote: boolean) {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL must be configured before seeding the display inventory.");
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!allowRemote && !localHosts.has(hostname)) {
    throw new Error("Refusing to seed a remote database. Use --allow-remote only for an intentionally approved environment.");
  }
}

function resolveSeedFile(seedDir: string, imagePath: string) {
  const resolved = path.resolve(seedDir, imagePath);
  const relative = path.relative(seedDir, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`Seed image path escapes the seed directory: ${imagePath}`);
  }
  return resolved;
}

function productValues(product: SeedProduct) {
  return {
    sourceKey: product.sourceKey,
    manufacturer: product.manufacturer,
    modelName: product.modelName,
    variantName: product.variantName,
    printedTitle: product.printedTitle,
    barcodeValue: product.barcodeValue,
    barcodeFormat: product.barcodeFormat,
    barcodeSymbology: product.barcodeSymbology,
    supplierSku: product.supplierSku,
    otherCodes: product.otherCodes,
    updatedAt: new Date(),
  };
}

function productMatchesSeed(existing: typeof seededDisplayProducts.$inferSelect, product: SeedProduct) {
  return existing.manufacturer === product.manufacturer &&
    existing.modelName === product.modelName &&
    existing.variantName === product.variantName &&
    existing.printedTitle === product.printedTitle &&
    existing.barcodeValue === product.barcodeValue &&
    existing.barcodeFormat === product.barcodeFormat &&
    existing.barcodeSymbology === product.barcodeSymbology &&
    existing.supplierSku === product.supplierSku &&
    JSON.stringify(existing.otherCodes) === JSON.stringify(product.otherCodes);
}

export async function seedDisplayInventory(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  ensureLocalDatabase(options.allowRemote);

  const manifestPath = path.join(options.seedDir, "manifest.json");
  const manifest = SeedManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")));
  const productKeys = new Set<string>();
  const displayIds = new Set<string>();
  const checksums = new Map<string, string>();

  for (const product of manifest.products) {
    if (productKeys.has(product.sourceKey)) throw new Error(`Duplicate product source key: ${product.sourceKey}`);
    productKeys.add(product.sourceKey);
    if (!product.barcodeValue && !product.supplierSku && product.otherCodes.length === 0) {
      throw new Error(`Product ${product.printedTitle} has no seeded identifier.`);
    }
    for (const reference of product.references) {
      if (displayIds.has(reference.displayId)) throw new Error(`Duplicate sample ID: ${reference.displayId}`);
      displayIds.add(reference.displayId);
      const buffer = await fs.readFile(/*turbopackIgnore: true*/ resolveSeedFile(options.seedDir, reference.imagePath));
      checksums.set(reference.displayId, createHash("sha256").update(buffer).digest("hex"));
    }
  }

  const excludedDisplayIds = new Set<string>();
  for (const excluded of manifest.excludedSamples) {
    if (displayIds.has(excluded.displayId)) {
      throw new Error(`Sample ID ${excluded.displayId} is both included in products and marked as excluded.`);
    }
    if (excludedDisplayIds.has(excluded.displayId)) {
      throw new Error(`Duplicate excluded sample ID: ${excluded.displayId}`);
    }
    excludedDisplayIds.add(excluded.displayId);
  }

  const existingProducts = await db.select().from(seededDisplayProducts);
  const existingReferences = await db.select().from(seededDisplayReferences);
  const existingProductByKey = new Map(existingProducts.map((product) => [product.sourceKey, product]));
  const existingReferenceBySample = new Map(existingReferences.map((reference) => [reference.sourceDisplayId, reference]));
  const productCounts = { create: 0, update: 0, unchanged: 0 };
  const referenceCounts = { create: 0, update: 0, unchanged: 0 };
  const replacedPaths: string[] = [];
  const newlyStoredPaths: string[] = [];

  for (const product of manifest.products) {
    const existing = existingProductByKey.get(product.sourceKey);
    if (!existing) productCounts.create++;
    else if (!productMatchesSeed(existing, product)) productCounts.update++;
    else productCounts.unchanged++;

    for (const reference of product.references) {
      const old = existingReferenceBySample.get(reference.displayId);
      if (!old) referenceCounts.create++;
      else if (old.checksumSha256 !== checksums.get(reference.displayId) || old.sourceImageId !== reference.imageId) referenceCounts.update++;
      else referenceCounts.unchanged++;
    }
  }

  const deactivatedReferences = existingReferences.filter(
    (reference) => excludedDisplayIds.has(reference.sourceDisplayId) && reference.isMatchable
  );

  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    products: { total: manifest.products.length, ...productCounts },
    references: { total: displayIds.size, ...referenceCounts },
    excludedSamples: manifest.excludedSamples.length,
    deactivatedSamples: deactivatedReferences.length,
  }, null, 2));
  if (!options.apply) return;

  try {
    await db.transaction(async (tx) => {
      if (excludedDisplayIds.size > 0) {
        await tx.update(seededDisplayReferences)
          .set({ isMatchable: false })
          .where(and(
            inArray(seededDisplayReferences.sourceDisplayId, Array.from(excludedDisplayIds)),
            eq(seededDisplayReferences.isMatchable, true)
          ));
      }

      for (const product of manifest.products) {
        const values = productValues(product);
        const [savedProduct] = await tx.insert(seededDisplayProducts)
          .values(values)
          .onConflictDoUpdate({ target: seededDisplayProducts.sourceKey, set: values })
          .returning({ id: seededDisplayProducts.id });

        for (const reference of product.references) {
          const prior = existingReferenceBySample.get(reference.displayId);
          const checksumSha256 = checksums.get(reference.displayId)!;
          let imagePath = prior?.storagePath;
          if (!prior || prior.checksumSha256 !== checksumSha256) {
            const source = await fs.readFile(/*turbopackIgnore: true*/ resolveSeedFile(options.seedDir, reference.imagePath));
            const stored = await storage.saveImage(source, path.basename(reference.imagePath), "image/jpeg", "seeded-display-catalog");
            imagePath = stored.storagePath;
            newlyStoredPaths.push(stored.storagePath);
            if (prior) replacedPaths.push(prior.storagePath);
          }

          await tx.insert(seededDisplayReferences).values({
            productId: savedProduct.id,
            sourceDisplayId: reference.displayId,
            sourceImageId: reference.imageId,
            storagePath: imagePath!,
            checksumSha256,
            cropMetadata: reference.crop,
            readableMarkings: reference.readableMarkings,
            isMatchable: true,
          }).onConflictDoUpdate({
            target: seededDisplayReferences.sourceDisplayId,
            set: {
              productId: savedProduct.id,
              sourceImageId: reference.imageId,
              storagePath: imagePath!,
              checksumSha256,
              cropMetadata: reference.crop,
              readableMarkings: reference.readableMarkings,
              isMatchable: true,
            },
          });
        }
      }
    });
  } catch (error) {
    await Promise.allSettled(newlyStoredPaths.map((imagePath) => storage.deleteImage(imagePath)));
    throw error;
  }

  await Promise.allSettled(replacedPaths.map((imagePath) => storage.deleteImage(imagePath)));
  console.log("Seeded display inventory successfully. Existing RMA records and phone-model catalog were not modified.");
}

if (process.argv[1]?.endsWith("seed-display-inventory.ts")) {
  seedDisplayInventory().then(() => pool.end()).catch(async (error) => {
    console.error("Display inventory seeding failed:", error instanceof Error ? error.message : String(error));
    await pool.end();
    process.exitCode = 1;
  });
}
