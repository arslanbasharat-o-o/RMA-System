import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  seededDisplayProducts,
  seededDisplayReferences,
  rmas,
  rmaItems,
  customers,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { eq, asc, desc, sql, ilike, or } from "drizzle-orm";
import { seedDisplayInventory } from "@/db/seed-display-inventory";
import fs from "node:fs/promises";
import path from "node:path";

function isDisposableTestRecord(record: {
  rmaNumber?: string | null;
  customerName?: string | null;
  notes?: string | null;
}) {
  const notes = (record.notes || "").toLowerCase();
  const rmaNum = (record.rmaNumber || "").toLowerCase();
  // Require explicit disposable metadata tag or known disposable test RMA, never customer name alone
  return (
    notes.includes("disposable-test") ||
    notes.includes("test-fixture") ||
    notes.includes("e2e-test") ||
    rmaNum === "rma-2026-000085"
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const products = await db
      .select()
      .from(seededDisplayProducts)
      .orderBy(asc(seededDisplayProducts.modelName), asc(seededDisplayProducts.variantName));

    const references = await db
      .select()
      .from(seededDisplayReferences)
      .orderBy(asc(seededDisplayReferences.sourceDisplayId));

    const refMap = new Map<string, typeof references>();
    for (const ref of references) {
      const list = refMap.get(ref.productId) || [];
      list.push(ref);
      refMap.set(ref.productId, list);
    }

    const productsWithRefs = products.map((prod) => ({
      ...prod,
      references: refMap.get(prod.id) || [],
    }));

    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.isActive).length;
    const totalReferences = references.length;
    const matchableReferences = references.filter((r) => r.isMatchable).length;

    // Check seed package file availability
    const seedDir = path.resolve(/*turbopackIgnore: true*/ process.env.DISPLAY_INVENTORY_SEED_DIR || ".local/display-inventory-seed");
    let seedPackageAvailable = false;
    let manifestVersion = 0;
    let excludedCount = 0;

    try {
      const manifestPath = path.join(seedDir, "manifest.json");
      const manifestRaw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(manifestRaw);
      seedPackageAvailable = true;
      manifestVersion = manifest.version || 1;
      excludedCount = manifest.excludedSamples?.length || 0;
    } catch {
      seedPackageAvailable = false;
    }

    return NextResponse.json({
      stats: {
        totalProducts,
        activeProducts,
        totalReferences,
        matchableReferences,
        excludedReferences: excludedCount,
        seedPackageAvailable,
        manifestVersion,
        seedDirectory: seedDir,
        environment: process.env.NODE_ENV || "development",
      },
      products: productsWithRefs,
    });
  } catch (error) {
    console.error("Failed to fetch display inventory:", error);
    return NextResponse.json(
      { error: "Failed to load display inventory catalog." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { type, id, value } = body;

    if (!id || typeof value !== "boolean") {
      return NextResponse.json({ error: "Invalid request parameters." }, { status: 400 });
    }

    if (type === "product") {
      await db
        .update(seededDisplayProducts)
        .set({ isActive: value, updatedAt: new Date() })
        .where(eq(seededDisplayProducts.id, id));
      return NextResponse.json({ success: true, type, id, isActive: value });
    }

    if (type === "reference") {
      await db
        .update(seededDisplayReferences)
        .set({ isMatchable: value })
        .where(eq(seededDisplayReferences.id, id));
      return NextResponse.json({ success: true, type, id, isMatchable: value });
    }

    return NextResponse.json({ error: "Unknown entity type." }, { status: 400 });
  } catch (error) {
    console.error("Failed to update display inventory entity:", error);
    return NextResponse.json(
      { error: "Failed to update inventory status." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { action, targetRmaId } = body;

    if (action === "preview_sync") {
      const seedDir = path.resolve(/*turbopackIgnore: true*/ process.env.DISPLAY_INVENTORY_SEED_DIR || ".local/display-inventory-seed");
      const manifestPath = path.join(seedDir, "manifest.json");
      const manifestRaw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(manifestRaw);

      const existingProducts = await db.select().from(seededDisplayProducts);
      const existingRefs = await db.select().from(seededDisplayReferences);

      const existingProductMap = new Map(existingProducts.map((p) => [p.sourceKey, p]));
      const existingRefMap = new Map(existingRefs.map((r) => [r.sourceDisplayId, r]));

      let createProds = 0;
      let updateProds = 0;
      let unchangedProds = 0;
      for (const p of manifest.products) {
        const existing = existingProductMap.get(p.sourceKey);
        if (!existing) {
          createProds++;
        } else {
          const willChange =
            existing.modelName !== p.modelName ||
            existing.variantName !== p.variantName ||
            existing.printedTitle !== p.printedTitle ||
            existing.barcodeValue !== (p.barcodeValue || null) ||
            existing.supplierSku !== (p.supplierSku || null) ||
            !existing.isActive;
          if (willChange) updateProds++;
          else unchangedProds++;
        }
      }

      let createRefs = 0;
      let updateRefs = 0;
      let unchangedRefs = 0;
      for (const p of manifest.products) {
        for (const r of p.references) {
          const existing = existingRefMap.get(r.displayId);
          if (!existing) {
            createRefs++;
          } else {
            const willChange = !existing.isMatchable;
            if (willChange) updateRefs++;
            else unchangedRefs++;
          }
        }
      }

      return NextResponse.json({
        mode: "dry-run",
        manifestProducts: manifest.products.length,
        createProducts: createProds,
        updateProducts: updateProds,
        unchangedProducts: unchangedProds,
        createReferences: createRefs,
        updateReferences: updateRefs,
        unchangedReferences: unchangedRefs,
        excludedSamples: manifest.excludedSamples?.length || 0,
      });
    }

    if (action === "apply_sync") {
      await seedDisplayInventory(["--apply", "--allow-remote"]);
      return NextResponse.json({
        success: true,
        message: "Display inventory seeded and synchronized successfully.",
      });
    }

    if (action === "preview_test_cleanup") {
      // Find candidate disposable test RMAs using explicit metadata markers
      const candidateRmas = await db
        .select({
          id: rmas.id,
          rmaNumber: rmas.rmaNumber,
          customerName: customers.name,
          status: rmas.status,
          createdAt: rmas.createdAt,
          itemCount: sql<number>`count(${rmaItems.id})::int`,
        })
        .from(rmas)
        .leftJoin(customers, eq(rmas.customerId, customers.id))
        .leftJoin(rmaItems, eq(rmaItems.rmaId, rmas.id))
        .where(
          or(
            ilike(rmas.notes, "%disposable-test%"),
            ilike(rmas.notes, "%test-fixture%"),
            ilike(rmas.notes, "%e2e-test%"),
            eq(rmas.rmaNumber, "RMA-2026-000085")
          )
        )
        .groupBy(rmas.id, rmas.rmaNumber, customers.name, rmas.status, rmas.createdAt)
        .orderBy(desc(rmas.createdAt));

      return NextResponse.json({
        candidates: candidateRmas,
      });
    }

    if (action === "execute_test_cleanup") {
      if (!targetRmaId) {
        return NextResponse.json({ error: "Target RMA ID is required for cleanup." }, { status: 400 });
      }

      if (body.confirm !== true) {
        return NextResponse.json({ error: "Explicit confirmation is required to delete test records." }, { status: 400 });
      }

      // Verify RMA is indeed a test/demo record before deleting
      const [target] = await db
        .select({
          id: rmas.id,
          rmaNumber: rmas.rmaNumber,
          customerName: customers.name,
          notes: rmas.notes,
        })
        .from(rmas)
        .leftJoin(customers, eq(rmas.customerId, customers.id))
        .where(eq(rmas.id, targetRmaId));

      if (!target) {
        return NextResponse.json({ error: "Target RMA record not found." }, { status: 404 });
      }

      if (!isDisposableTestRecord(target)) {
        return NextResponse.json(
          { error: "Refusing to delete non-test RMA record without safety approval." },
          { status: 403 }
        );
      }

      // Cascades to items and image rows
      await db.delete(rmas).where(eq(rmas.id, targetRmaId));

      return NextResponse.json({
        success: true,
        message: `Successfully cleaned test record ${target.rmaNumber}.`,
        deletedRmaId: targetRmaId,
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("Display inventory action failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: 500 }
    );
  }
}
