import { pool } from "./index";

export async function runMigrations() {
  console.log("Applying database schema migrations...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN;");

    // 1. Extensions & Sequences
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE SEQUENCE IF NOT EXISTS rma_number_seq START 1;
    `);

    // 2. Users & Sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
    `);

    // 3. Customers & Return Reasons
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        notes TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (name);
      CREATE INDEX IF NOT EXISTS customers_active_idx ON customers (active);

      CREATE TABLE IF NOT EXISTS return_reasons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS return_reasons_order_idx ON return_reasons (sort_order);
    `);

    // 4. RMAs & Items
    await client.query(`
      CREATE TABLE IF NOT EXISTS rmas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_number TEXT NOT NULL UNIQUE,
        customer_id UUID NOT NULL REFERENCES customers (id),
        return_reason_id UUID NOT NULL REFERENCES return_reasons (id),
        return_reason_notes TEXT,
        external_rma_number TEXT,
        tracking_number TEXT,
        expected_display_count INTEGER,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'receiving',
        created_by_user_id UUID REFERENCES users (id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS rmas_customer_idx ON rmas (customer_id);
      CREATE INDEX IF NOT EXISTS rmas_status_idx ON rmas (status);
      CREATE INDEX IF NOT EXISTS rmas_created_at_idx ON rmas (created_at);
      CREATE INDEX IF NOT EXISTS rmas_tracking_number_idx ON rmas (tracking_number);

      CREATE TABLE IF NOT EXISTS rma_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_id UUID NOT NULL REFERENCES rmas (id) ON DELETE CASCADE,
        item_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_upload',
        predicted_manufacturer TEXT,
        predicted_model TEXT,
        predicted_display_assembly TEXT,
        catalog_display_id UUID,
        identified_vendor_id UUID,
        identified_vendor_variant_id UUID,
        match_status TEXT NOT NULL DEFAULT 'unknown',
        model_confidence_score REAL,
        vendor_confidence_score REAL,
        visual_status TEXT NOT NULL DEFAULT 'pending',
        visual_error TEXT,
        vendor_ocr_status TEXT NOT NULL DEFAULT 'pending',
        vendor_ocr_error TEXT,
        extracted_text_summary TEXT,
        matched_codes_summary TEXT,
        review_notes TEXT,
        verified_by_user_id UUID REFERENCES users (id),
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS rma_items_rma_item_idx ON rma_items (rma_id, item_number);
      CREATE INDEX IF NOT EXISTS rma_items_status_idx ON rma_items (status);
      CREATE INDEX IF NOT EXISTS rma_items_match_status_idx ON rma_items (match_status);
      CREATE INDEX IF NOT EXISTS rma_items_catalog_display_idx ON rma_items (catalog_display_id);
      CREATE INDEX IF NOT EXISTS rma_items_vendor_idx ON rma_items (identified_vendor_id);
    `);
    await client.query(`ALTER TABLE rma_items ADD COLUMN IF NOT EXISTS recognition_revision INTEGER NOT NULL DEFAULT 0;`);

    // 5. Item Images
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_item_id UUID NOT NULL REFERENCES rma_items (id) ON DELETE CASCADE,
        image_type TEXT NOT NULL DEFAULT 'general',
        storage_path TEXT NOT NULL,
        thumbnail_path TEXT,
        preview_path TEXT,
        original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        checksum_sha256 TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS item_images_item_idx ON item_images (rma_item_id);
      CREATE INDEX IF NOT EXISTS item_images_checksum_idx ON item_images (checksum_sha256);
    `);

    // 6. Display Catalog & Vendors
    await client.query(`
      CREATE TABLE IF NOT EXISTS display_catalog (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        manufacturer TEXT NOT NULL,
        model_name TEXT NOT NULL,
        normalized_model_identifier TEXT NOT NULL UNIQUE,
        aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
        internal_sku TEXT,
        known_part_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
        display_technology TEXT,
        compatible_device_models JSONB NOT NULL DEFAULT '[]'::jsonb,
        reference_image_path TEXT,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS display_catalog_mfg_idx ON display_catalog (manufacturer);
      CREATE INDEX IF NOT EXISTS display_catalog_norm_idx ON display_catalog (normalized_model_identifier);
      CREATE INDEX IF NOT EXISTS display_catalog_model_name_idx ON display_catalog (model_name);

      CREATE TABLE IF NOT EXISTS seeded_display_products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_key TEXT NOT NULL UNIQUE,
        manufacturer TEXT NOT NULL,
        model_name TEXT NOT NULL,
        variant_name TEXT NOT NULL,
        printed_title TEXT NOT NULL,
        barcode_value TEXT,
        barcode_format TEXT,
        barcode_symbology TEXT,
        supplier_sku TEXT,
        other_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS seeded_display_products_model_idx ON seeded_display_products (manufacturer, model_name);
      CREATE INDEX IF NOT EXISTS seeded_display_products_barcode_idx ON seeded_display_products (barcode_value);
      CREATE INDEX IF NOT EXISTS seeded_display_products_active_idx ON seeded_display_products (is_active);

      CREATE TABLE IF NOT EXISTS seeded_display_references (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES seeded_display_products (id) ON DELETE CASCADE,
        source_display_id TEXT NOT NULL UNIQUE,
        source_image_id TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        checksum_sha256 TEXT NOT NULL,
        crop_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        readable_markings JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_matchable BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS seeded_display_references_product_idx ON seeded_display_references (product_id);
      CREATE INDEX IF NOT EXISTS seeded_display_references_checksum_idx ON seeded_display_references (checksum_sha256);

      ALTER TABLE rma_items ADD COLUMN IF NOT EXISTS seeded_display_product_id UUID;
      ALTER TABLE rma_items ADD COLUMN IF NOT EXISTS inventory_match_confidence REAL;
      ALTER TABLE rma_items ADD COLUMN IF NOT EXISTS inventory_match_evidence JSONB;
      CREATE INDEX IF NOT EXISTS rma_items_seeded_display_product_idx ON rma_items (seeded_display_product_id);

      CREATE TABLE IF NOT EXISTS vendors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        code TEXT NOT NULL UNIQUE,
        description TEXT,
        aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS vendors_code_idx ON vendors (code);

      CREATE TABLE IF NOT EXISTS vendor_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
        display_technology TEXT,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS vendor_variants_vendor_idx ON vendor_variants (vendor_id);
      CREATE UNIQUE INDEX IF NOT EXISTS vendor_variants_unique_code_idx ON vendor_variants (vendor_id, code);

      CREATE TABLE IF NOT EXISTS vendor_recognition_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id UUID NOT NULL REFERENCES vendors (id) ON DELETE CASCADE,
        vendor_variant_id UUID REFERENCES vendor_variants (id) ON DELETE SET NULL,
        rule_type TEXT NOT NULL DEFAULT 'exact_code',
        pattern TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 100,
        confidence_weight REAL NOT NULL DEFAULT 1.0,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS vendor_rules_priority_idx ON vendor_recognition_rules (priority);
      CREATE INDEX IF NOT EXISTS vendor_rules_vendor_idx ON vendor_recognition_rules (vendor_id);
    `);

    // 7. Recognition Runs & Candidates
    await client.query(`
      CREATE TABLE IF NOT EXISTS recognition_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_item_id UUID NOT NULL REFERENCES rma_items (id) ON DELETE CASCADE,
        pipeline_type TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        status TEXT NOT NULL,
        raw_request JSONB,
        raw_response JSONB,
        duration_ms INTEGER,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS recog_runs_item_idx ON recognition_runs (rma_item_id);

      CREATE TABLE IF NOT EXISTS ocr_extractions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recognition_run_id UUID NOT NULL REFERENCES recognition_runs (id) ON DELETE CASCADE,
        rma_item_id UUID NOT NULL REFERENCES rma_items (id) ON DELETE CASCADE,
        raw_text JSONB NOT NULL DEFAULT '[]'::jsonb,
        detected_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
        part_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
        vendor_markings JSONB NOT NULL DEFAULT '[]'::jsonb,
        technology_markings JSONB NOT NULL DEFAULT '[]'::jsonb,
        possible_vendor_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
        unreadable_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
        extraction_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ocr_extractions_item_idx ON ocr_extractions (rma_item_id);

      CREATE TABLE IF NOT EXISTS recognition_candidates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recognition_run_id UUID NOT NULL REFERENCES recognition_runs (id) ON DELETE CASCADE,
        rma_item_id UUID NOT NULL REFERENCES rma_items (id) ON DELETE CASCADE,
        candidate_type TEXT NOT NULL,
        candidate_title TEXT NOT NULL,
        catalog_id UUID,
        variant_id UUID,
        score REAL NOT NULL DEFAULT 0,
        source_evidence TEXT,
        rank INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS candidates_item_idx ON recognition_candidates (rma_item_id);
    `);
    await client.query(`ALTER TABLE recognition_runs ADD COLUMN IF NOT EXISTS recognition_revision INTEGER NOT NULL DEFAULT 0;`);

    // 8. Review Actions, Audit Logs & System Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS review_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rma_item_id UUID NOT NULL REFERENCES rma_items (id) ON DELETE CASCADE,
        user_id UUID REFERENCES users (id),
        action_type TEXT NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS review_actions_item_idx ON review_actions (rma_item_id);
      CREATE INDEX IF NOT EXISTS review_actions_user_idx ON review_actions (user_id);
      CREATE INDEX IF NOT EXISTS review_actions_created_at_idx ON review_actions (created_at);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users (id),
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details JSONB,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_by_user_id UUID REFERENCES users (id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 9. Foreign Keys on rma_items for catalog and vendors (with ON DELETE SET NULL)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'rma_items_catalog_display_fk'
        ) THEN
          ALTER TABLE rma_items ADD CONSTRAINT rma_items_catalog_display_fk
            FOREIGN KEY (catalog_display_id) REFERENCES display_catalog (id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'rma_items_seeded_display_product_fk'
        ) THEN
          ALTER TABLE rma_items ADD CONSTRAINT rma_items_seeded_display_product_fk
            FOREIGN KEY (seeded_display_product_id) REFERENCES seeded_display_products (id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'rma_items_vendor_fk'
        ) THEN
          ALTER TABLE rma_items ADD CONSTRAINT rma_items_vendor_fk
            FOREIGN KEY (identified_vendor_id) REFERENCES vendors (id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'rma_items_vendor_variant_fk'
        ) THEN
          ALTER TABLE rma_items ADD CONSTRAINT rma_items_vendor_variant_fk
            FOREIGN KEY (identified_vendor_variant_id) REFERENCES vendor_variants (id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query("COMMIT;");
    console.log("Database schema migrations applied successfully.");
  } catch (error) {
    await client.query("ROLLBACK;");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Allow direct execution: tsx src/db/migrate.ts
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes("migrate")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
