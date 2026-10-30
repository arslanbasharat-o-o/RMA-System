import { db } from "@/db";
import { vendorRecognitionRules, vendors, vendorVariants } from "@/db/schema";
import { and, eq } from "drizzle-orm";

interface DesiredRule {
  vendorId: string;
  vendorVariantId: string | null;
  ruleType: "exact_code" | "alias" | "regex" | "normalized_text" | "stamp_pattern";
  pattern: string;
  priority: number;
  confidenceWeight: number;
  description: string;
}

/**
 * Automatically synchronizes recognition rules for a vendor and its variants.
 * This relieves users from having to manually manage regex and rule priorities.
 */
export async function syncVendorRecognitionRules(vendorId: string): Promise<number> {
  const [vendor] = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, vendorId));

  if (!vendor || !vendor.isActive) {
    // If vendor is deleted or inactive, deactivate all associated rules
    await db
      .update(vendorRecognitionRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vendorRecognitionRules.vendorId, vendorId));
    return 0;
  }

  const variants = await db
    .select()
    .from(vendorVariants)
    .where(
      and(
        eq(vendorVariants.vendorId, vendorId),
        eq(vendorVariants.isActive, true)
      )
    );

  const desiredRules: DesiredRule[] = [];

  // 1. Vendor Primary Code Rules
  const cleanCode = vendor.code.trim().toUpperCase();
  if (cleanCode) {
    desiredRules.push({
      vendorId: vendor.id,
      vendorVariantId: null,
      ruleType: "exact_code",
      pattern: cleanCode,
      priority: 200,
      confidenceWeight: 1.0,
      description: `Auto-generated exact code rule for vendor ${vendor.name}`,
    });

    desiredRules.push({
      vendorId: vendor.id,
      vendorVariantId: null,
      ruleType: "stamp_pattern",
      pattern: cleanCode,
      priority: 180,
      confidenceWeight: 0.95,
      description: `Auto-generated stamp pattern rule for vendor ${vendor.name}`,
    });
  }

  // 2. Vendor Aliases (e.g. additional stock / stamp codes like TXP08, TXP10)
  const aliases = (vendor.aliases || [])
    .map((a) => a.trim().toUpperCase())
    .filter((a) => a && a !== cleanCode);

  for (const alias of aliases) {
    desiredRules.push({
      vendorId: vendor.id,
      vendorVariantId: null,
      ruleType: "exact_code",
      pattern: alias,
      priority: 195,
      confidenceWeight: 1.0,
      description: `Auto-generated code alias rule for vendor ${vendor.name} (${alias})`,
    });

    desiredRules.push({
      vendorId: vendor.id,
      vendorVariantId: null,
      ruleType: "stamp_pattern",
      pattern: alias,
      priority: 175,
      confidenceWeight: 0.95,
      description: `Auto-generated stamp alias rule for vendor ${vendor.name} (${alias})`,
    });
  }

  // 3. Vendor Name (if different from code and not an alias)
  const cleanName = vendor.name.trim().toUpperCase();
  if (cleanName && cleanName !== cleanCode && !aliases.includes(cleanName)) {
    desiredRules.push({
      vendorId: vendor.id,
      vendorVariantId: null,
      ruleType: "alias",
      pattern: cleanName,
      priority: 160,
      confidenceWeight: 0.9,
      description: `Auto-generated name alias rule for vendor ${vendor.name}`,
    });
  }

  // 4. Child Variants
  for (const variant of variants) {
    const vCode = variant.code.trim().toUpperCase();
    if (vCode) {
      desiredRules.push({
        vendorId: vendor.id,
        vendorVariantId: variant.id,
        ruleType: "exact_code",
        pattern: vCode,
        priority: 210,
        confidenceWeight: 1.0,
        description: `Auto-generated exact code for variant ${variant.name}`,
      });

      desiredRules.push({
        vendorId: vendor.id,
        vendorVariantId: variant.id,
        ruleType: "stamp_pattern",
        pattern: vCode,
        priority: 190,
        confidenceWeight: 0.95,
        description: `Auto-generated stamp rule for variant ${variant.name}`,
      });
    }

    const vAliases = (variant.aliases || [])
      .map((a) => a.trim().toUpperCase())
      .filter((a) => a && a !== vCode);

    for (const vAlias of vAliases) {
      desiredRules.push({
        vendorId: vendor.id,
        vendorVariantId: variant.id,
        ruleType: "exact_code",
        pattern: vAlias,
        priority: 185,
        confidenceWeight: 0.95,
        description: `Auto-generated variant alias for ${variant.name} (${vAlias})`,
      });
    }
  }

  // Fetch existing rules for this vendor
  const existingRules = await db
    .select()
    .from(vendorRecognitionRules)
    .where(eq(vendorRecognitionRules.vendorId, vendorId));

  let syncedCount = 0;

  for (const desired of desiredRules) {
    const match = existingRules.find(
      (r) =>
        r.ruleType === desired.ruleType &&
        r.pattern.toUpperCase() === desired.pattern.toUpperCase() &&
        (r.vendorVariantId || null) === (desired.vendorVariantId || null)
    );

    if (match) {
      if (!match.isActive || match.priority !== desired.priority) {
        await db
          .update(vendorRecognitionRules)
          .set({
            isActive: true,
            priority: desired.priority,
            confidenceWeight: desired.confidenceWeight,
            updatedAt: new Date(),
          })
          .where(eq(vendorRecognitionRules.id, match.id));
        syncedCount++;
      }
    } else {
      await db.insert(vendorRecognitionRules).values({
        vendorId: desired.vendorId,
        vendorVariantId: desired.vendorVariantId,
        ruleType: desired.ruleType,
        pattern: desired.pattern,
        priority: desired.priority,
        confidenceWeight: desired.confidenceWeight,
        description: desired.description,
        isActive: true,
      });
      syncedCount++;
    }
  }

  // Deactivate rules that are no longer part of desired auto rules
  for (const existing of existingRules) {
    if (
      existing.description?.startsWith("Auto-generated") &&
      !desiredRules.some(
        (d) =>
          d.ruleType === existing.ruleType &&
          d.pattern.toUpperCase() === existing.pattern.toUpperCase() &&
          (d.vendorVariantId || null) === (existing.vendorVariantId || null)
      )
    ) {
      await db
        .update(vendorRecognitionRules)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(vendorRecognitionRules.id, existing.id));
    }
  }

  return syncedCount;
}

/**
 * Synchronizes all active vendors across the system.
 */
export async function syncAllVendorsRecognitionRules(): Promise<{ totalVendors: number; rulesSynced: number }> {
  const allVendors = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.isActive, true));

  let totalSynced = 0;
  for (const v of allVendors) {
    totalSynced += await syncVendorRecognitionRules(v.id);
  }

  return { totalVendors: allVendors.length, rulesSynced: totalSynced };
}
