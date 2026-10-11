import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { customers, displayCatalog, users, vendorRecognitionRules, vendors, vendorVariants } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

if (process.env.NODE_ENV !== "test") {
  throw new Error("Test fixtures may only be loaded when NODE_ENV=test.");
}

async function ensureFixtures() {
  const e2ePassword = process.env.E2E_TEST_PASSWORD || "e2e-test-only-password-change-me-123";
  const passwordHash = await hashPassword(e2ePassword);
  for (const user of [
    { email: "operator@rma-system.internal", name: "E2E Operator", role: "operator" as const },
    { email: "viewer@rma-system.internal", name: "E2E Viewer", role: "viewer" as const },
  ]) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, user.email));
    if (existing) {
      await db.update(users).set({ name: user.name, role: user.role, passwordHash, active: true }).where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({ ...user, passwordHash, active: true });
    }
  }

  const [fixtureCustomer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, "e2e-fixture@rma-system.internal"));
  if (!fixtureCustomer) {
    await db.insert(customers).values({
      name: "E2E Fixture Customer",
      contactName: "Test Contact",
      email: "e2e-fixture@rma-system.internal",
      notes: "Synthetic test fixture; do not use outside disposable test databases.",
    });
  }

  const catalogRows = [
    {
      manufacturer: "Apple",
      modelName: "iPhone 13 Pro",
      normalizedModelIdentifier: "test-apple-iphone-13-pro",
      aliases: ["iPhone 13 Pro", "13 Pro"],
      knownPartNumbers: [],
      compatibleDeviceModels: [],
      displayTechnology: "OLED",
      notes: "Synthetic integration-test fixture.",
    },
    {
      manufacturer: "Samsung",
      modelName: "Galaxy A15",
      normalizedModelIdentifier: "test-samsung-galaxy-a15",
      aliases: ["Galaxy A15", "A15"],
      knownPartNumbers: [],
      compatibleDeviceModels: [],
      displayTechnology: "AMOLED",
      notes: "Synthetic integration-test fixture.",
    },
  ];
  for (const row of catalogRows) {
    await db.insert(displayCatalog).values(row).onConflictDoNothing();
  }

  await db.insert(vendors).values({
    name: "Test Vendor AMI",
    code: "TEST-AMI",
    aliases: ["AMI"],
    description: "Synthetic integration-test fixture.",
  }).onConflictDoNothing();
  const [vendor] = await db.select().from(vendors).where(eq(vendors.code, "TEST-AMI"));
  if (!vendor) throw new Error("Could not create test vendor fixture.");

  await db.insert(vendorVariants).values({
    vendorId: vendor.id,
    name: "Test Variant AMI/A",
    code: "TEST-AMI-A",
    aliases: ["AMI/A"],
    description: "Synthetic integration-test fixture.",
  }).onConflictDoNothing();
  const [variant] = await db.select().from(vendorVariants).where(eq(vendorVariants.vendorId, vendor.id));
  if (!variant) throw new Error("Could not create test vendor variant fixture.");

  const [existingRule] = await db.select().from(vendorRecognitionRules).where(eq(vendorRecognitionRules.pattern, "AMI/A"));
  if (!existingRule) {
    await db.insert(vendorRecognitionRules).values({
      vendorId: vendor.id,
      vendorVariantId: variant.id,
      ruleType: "exact_code",
      pattern: "AMI/A",
      priority: 200,
      confidenceWeight: 1,
      description: "Synthetic integration-test fixture.",
    });
  }
}

ensureFixtures()
  .then(() => console.log("Synthetic test fixtures are ready."))
  .catch((error) => {
    console.error("Failed to prepare test fixtures.", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => { await pool.end(); });
