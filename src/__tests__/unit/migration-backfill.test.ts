import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "@/db/migrate";

describe("Blocker 4: Real Database Migration Verification against Disposable PostgreSQL Database", () => {
  let adminPool: Pool;
  let testPool: Pool;
  const disposableDbName = `rma_migration_disposable_test_${Date.now()}`;
  const baseDbUrl = process.env.DATABASE_URL || "postgresql://arslanbasharat@localhost:5432/rma_system_public_dev_20261010";

  // Allowlisted test-database identity check
  function assertAllowlistedTestDb(dbName: string, host: string) {
    if (!/test|disposable/i.test(dbName)) {
      throw new Error(`Refusing test execution: database name "${dbName}" is not an allowlisted test database.`);
    }
    if (/prod|production/i.test(dbName)) {
      throw new Error(`Refusing test execution: database name "${dbName}" looks like production!`);
    }
    if (host !== "localhost" && host !== "127.0.0.1") {
      throw new Error(`Refusing test execution: host "${host}" is not local.`);
    }
  }

  // IDs for inserted test entities
  let userId: string;
  let custId: string;
  let rmaId: string;
  let prodAId: string;
  let prodBId: string;

  beforeAll(async () => {
    const parsedUrl = new URL(baseDbUrl);
    assertAllowlistedTestDb(disposableDbName, parsedUrl.hostname);

    // Connect to admin postgres database to create the disposable test database
    const adminUrl = new URL(baseDbUrl);
    adminUrl.pathname = "/postgres";
    adminPool = new Pool({ connectionString: adminUrl.toString(), max: 2 });

    await adminPool.query(`CREATE DATABASE "${disposableDbName}";`);

    // Connect to the disposable database
    const testDbUrl = new URL(baseDbUrl);
    testDbUrl.pathname = `/${disposableDbName}`;
    testPool = new Pool({ connectionString: testDbUrl.toString(), max: 5 });

    // 1. Run the real migration on the disposable database
    await runMigrations(testPool);

    // 2. Set up base test data
    const userRes = await testPool.query(`
      INSERT INTO users (email, name, password_hash, role)
      VALUES ($1, 'Migration Operator', 'hash', 'operator')
      RETURNING id;
    `, [`operator-${Date.now()}@test.local`]);
    userId = userRes.rows[0].id;

    const custRes = await testPool.query(`
      INSERT INTO customers (name) VALUES ('Test Customer') RETURNING id;
    `);
    custId = custRes.rows[0].id;

    const reasonRes = await testPool.query(`
      INSERT INTO return_reasons (code, label) VALUES ('DEFECTIVE', 'Defective') RETURNING id;
    `);
    const reasonId = reasonRes.rows[0].id;

    const rmaRes = await testPool.query(`
      INSERT INTO rmas (rma_number, customer_id, return_reason_id) VALUES ('RMA-MIG-001', $1, $2) RETURNING id;
    `, [custId, reasonId]);
    rmaId = rmaRes.rows[0].id;

    const prodARes = await testPool.query(`
      INSERT INTO seeded_display_products (source_key, manufacturer, model_name, variant_name, printed_title)
      VALUES ('PROD-A', 'Apple', 'iPhone 13', 'Standard', 'Apple iPhone 13') RETURNING id;
    `);
    prodAId = prodARes.rows[0].id;

    const prodBRes = await testPool.query(`
      INSERT INTO seeded_display_products (source_key, manufacturer, model_name, variant_name, printed_title)
      VALUES ('PROD-B', 'Apple', 'iPhone 13 Pro', 'OLED', 'Apple iPhone 13 Pro OLED') RETURNING id;
    `);
    prodBId = prodBRes.rows[0].id;
  }, 30000);

  afterAll(async () => {
    try {
      if (testPool) {
        await testPool.end();
      }
      if (adminPool) {
        // Terminate any remaining connections to the disposable DB
        await adminPool.query(`
          SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid();
        `, [disposableDbName]);
        await adminPool.query(`DROP DATABASE IF EXISTS "${disposableDbName}";`);
        await adminPool.end();
      }
    } catch (err) {
      console.error("Cleanup error in disposable database test:", err);
    }
  }, 30000);

  it("verifies all 10 historical migration requirements against real migration execution", async () => {
    // Insert test records simulating each historical case with inventory_match_status = 'not_evaluated'
    
    // Case 1: Operator confirmed exact product via review action
    const item1 = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_status)
      VALUES ($1, 1, 'verified', $2, 'not_evaluated') RETURNING id;
    `, [rmaId, prodAId])).rows[0].id;

    await testPool.query(`
      INSERT INTO review_actions (rma_item_id, user_id, action_type, new_state)
      VALUES ($1, $2, 'confirm_inventory', $3);
    `, [item1, userId, JSON.stringify({ confirmedProductId: prodAId })]);

    // Case 2: Legacy verified item with model confirmation ONLY (status = verified, but no product-specific confirmation)
    const item2 = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, verified_by_user_id, seeded_display_product_id, inventory_match_status)
      VALUES ($1, 2, 'verified', $2, $3, 'not_evaluated') RETURNING id;
    `, [rmaId, userId, prodAId])).rows[0].id;

    await testPool.query(`
      INSERT INTO review_actions (rma_item_id, user_id, action_type, new_state)
      VALUES ($1, $2, 'manual_verify', $3);
    `, [item2, userId, JSON.stringify({ predictedModel: 'iPhone 13' })]);

    // Case 3: Previously suggested product (automated suggestion awaiting review, no confirmation)
    const item3 = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_confidence, inventory_match_status)
      VALUES ($1, 3, 'review_required', $2, 0.70, 'not_evaluated') RETURNING id;
    `, [rmaId, prodAId])).rows[0].id;

    // Case 4: High-confidence physical evidence (confidence >= 0.90, >= 2 matching cues, 0 conflicting, 0 unresolved)
    const item4 = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_confidence, inventory_match_evidence, inventory_match_status)
      VALUES ($1, 4, 'review_required', $2, 0.96, $3, 'not_evaluated') RETURNING id;
    `, [rmaId, prodAId, JSON.stringify({
      matchingCues: ["Exact connector pitch", "Identical shielding pattern"],
      conflictingCues: [],
      unresolvedAlternatives: [],
    })])).rows[0].id;

    // Case 5: Conflicting physical cues
    const item5 = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_confidence, inventory_match_evidence, inventory_match_status)
      VALUES ($1, 5, 'review_required', $2, 0.95, $3, 'not_evaluated') RETURNING id;
    `, [rmaId, prodAId, JSON.stringify({
      matchingCues: ["Exact connector pitch", "Identical shielding pattern"],
      conflictingCues: ["Flex bracket geometry differs"],
      unresolvedAlternatives: [],
    })])).rows[0].id;

    // Case 6: Unresolved alternatives
    const item6 = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_confidence, inventory_match_evidence, inventory_match_status)
      VALUES ($1, 6, 'review_required', $2, 0.95, $3, 'not_evaluated') RETURNING id;
    `, [rmaId, prodAId, JSON.stringify({
      matchingCues: ["Exact connector pitch", "Identical shielding pattern"],
      conflictingCues: [],
      unresolvedAlternatives: [prodBId],
    })])).rows[0].id;

    // Case 7: Missing evidence (null evidence)
    const item7 = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_confidence, inventory_match_evidence, inventory_match_status)
      VALUES ($1, 7, 'review_required', $2, 0.95, NULL, 'not_evaluated') RETURNING id;
    `, [rmaId, prodAId])).rows[0].id;

    // Case 8: Invalid JSON structure (string instead of JSON object)
    const item8 = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_confidence, inventory_match_evidence, inventory_match_status)
      VALUES ($1, 8, 'review_required', $2, 0.95, '"invalid-json-string"', 'not_evaluated') RETURNING id;
    `, [rmaId, prodAId])).rows[0].id;

    // Case 9: Already populated statuses (must NEVER be overwritten)
    const item9a = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_status)
      VALUES ($1, 9, 'review_required', $2, 'no_verified_match') RETURNING id;
    `, [rmaId, null])).rows[0].id;

    const item9b = (await testPool.query(`
      INSERT INTO rma_items (rma_id, item_number, status, seeded_display_product_id, inventory_match_status)
      VALUES ($1, 10, 'failed', $2, 'error') RETURNING id;
    `, [rmaId, null])).rows[0].id;

    // Execute the REAL migration on the disposable database
    await runMigrations(testPool);

    // Verify Case 1: Operator confirmed exact product -> matched
    const r1 = (await testPool.query('SELECT inventory_match_status, seeded_display_product_id FROM rma_items WHERE id = $1', [item1])).rows[0];
    expect(r1.inventory_match_status).toBe('matched');
    expect(r1.seeded_display_product_id).toBe(prodAId);

    // Verify Case 2: Legacy verified item with model confirmation ONLY -> review_required (NOT matched!)
    const r2 = (await testPool.query('SELECT inventory_match_status, seeded_display_product_id FROM rma_items WHERE id = $1', [item2])).rows[0];
    expect(r2.inventory_match_status).toBe('review_required');
    expect(r2.seeded_display_product_id).toBe(prodAId); // Preserved historical record

    // Verify Case 3: Previously suggested product -> review_required
    const r3 = (await testPool.query('SELECT inventory_match_status, seeded_display_product_id FROM rma_items WHERE id = $1', [item3])).rows[0];
    expect(r3.inventory_match_status).toBe('review_required');
    expect(r3.seeded_display_product_id).toBe(prodAId);

    // Verify Case 4: High-confidence physical evidence -> matched
    const r4 = (await testPool.query('SELECT inventory_match_status, seeded_display_product_id FROM rma_items WHERE id = $1', [item4])).rows[0];
    expect(r4.inventory_match_status).toBe('matched');
    expect(r4.seeded_display_product_id).toBe(prodAId);

    // Verify Case 5: Conflicting physical cues -> review_required
    const r5 = (await testPool.query('SELECT inventory_match_status, seeded_display_product_id FROM rma_items WHERE id = $1', [item5])).rows[0];
    expect(r5.inventory_match_status).toBe('review_required');

    // Verify Case 6: Unresolved alternatives -> review_required
    const r6 = (await testPool.query('SELECT inventory_match_status, seeded_display_product_id FROM rma_items WHERE id = $1', [item6])).rows[0];
    expect(r6.inventory_match_status).toBe('review_required');

    // Verify Case 7: Missing evidence -> review_required
    const r7 = (await testPool.query('SELECT inventory_match_status, seeded_display_product_id FROM rma_items WHERE id = $1', [item7])).rows[0];
    expect(r7.inventory_match_status).toBe('review_required');

    // Verify Case 8: Invalid JSON structure -> review_required
    const r8 = (await testPool.query('SELECT inventory_match_status, seeded_display_product_id FROM rma_items WHERE id = $1', [item8])).rows[0];
    expect(r8.inventory_match_status).toBe('review_required');

    // Verify Case 9: Already populated statuses preserved
    const r9a = (await testPool.query('SELECT inventory_match_status FROM rma_items WHERE id = $1', [item9a])).rows[0];
    expect(r9a.inventory_match_status).toBe('no_verified_match');
    const r9b = (await testPool.query('SELECT inventory_match_status FROM rma_items WHERE id = $1', [item9b])).rows[0];
    expect(r9b.inventory_match_status).toBe('error');

    // Verify Case 10: Repeated migration execution (idempotency)
    await expect(runMigrations(testPool)).resolves.not.toThrow();

    // Verify all statuses remain identical after repeated execution
    const r1Second = (await testPool.query('SELECT inventory_match_status FROM rma_items WHERE id = $1', [item1])).rows[0];
    expect(r1Second.inventory_match_status).toBe('matched');
    const r2Second = (await testPool.query('SELECT inventory_match_status FROM rma_items WHERE id = $1', [item2])).rows[0];
    expect(r2Second.inventory_match_status).toBe('review_required');
    const r4Second = (await testPool.query('SELECT inventory_match_status FROM rma_items WHERE id = $1', [item4])).rows[0];
    expect(r4Second.inventory_match_status).toBe('matched');
  });
});
