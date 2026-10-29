import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// 1. Users & Authentication
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "operator", "viewer"] })
      .notNull()
      .default("operator"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("users_role_idx").on(table.role)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // Session token / JTI
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expires_idx").on(table.expiresAt),
  ]
);

// ---------------------------------------------------------------------------
// 2. Customers & Return Reasons
// ---------------------------------------------------------------------------
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("customers_name_idx").on(table.name),
    index("customers_active_idx").on(table.active),
  ]
);

export const returnReasons = pgTable(
  "return_reasons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull().unique(),
    label: text("label").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("return_reasons_order_idx").on(table.sortOrder)]
);

// ---------------------------------------------------------------------------
// 3. RMAs & Physical Displays (RMA Items)
// ---------------------------------------------------------------------------
export const rmas = pgTable(
  "rmas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rmaNumber: text("rma_number").notNull().unique(), // e.g. RMA-2026-000001
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    returnReasonId: uuid("return_reason_id")
      .notNull()
      .references(() => returnReasons.id),
    returnReasonNotes: text("return_reason_notes"),
    externalRmaNumber: text("external_rma_number"),
    trackingNumber: text("tracking_number"),
    expectedDisplayCount: integer("expected_display_count"),
    notes: text("notes"),
    status: text("status", {
      enum: [
        "draft",
        "receiving",
        "processing",
        "review_required",
        "completed",
        "archived",
      ],
    })
      .notNull()
      .default("receiving"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("rmas_customer_idx").on(table.customerId),
    index("rmas_status_idx").on(table.status),
    index("rmas_created_at_idx").on(table.createdAt),
    index("rmas_tracking_number_idx").on(table.trackingNumber),
  ]
);

// Exact seeded product variants are separate from the phone-model catalog.
export const seededDisplayProducts = pgTable(
  "seeded_display_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceKey: text("source_key").notNull().unique(),
    manufacturer: text("manufacturer").notNull(),
    modelName: text("model_name").notNull(),
    variantName: text("variant_name").notNull(),
    printedTitle: text("printed_title").notNull(),
    barcodeValue: text("barcode_value"),
    barcodeFormat: text("barcode_format"),
    barcodeSymbology: text("barcode_symbology"),
    supplierSku: text("supplier_sku"),
    otherCodes: jsonb("other_codes").$type<Array<{ value: string; source: string; category: string }>>().default([]).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("seeded_display_products_model_idx").on(table.manufacturer, table.modelName),
    index("seeded_display_products_barcode_idx").on(table.barcodeValue),
    index("seeded_display_products_active_idx").on(table.isActive),
  ]
);

export const seededDisplayReferences = pgTable(
  "seeded_display_references",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull().references(() => seededDisplayProducts.id, { onDelete: "cascade" }),
    sourceDisplayId: text("source_display_id").notNull().unique(),
    sourceImageId: text("source_image_id").notNull(),
    storagePath: text("storage_path").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    cropMetadata: jsonb("crop_metadata").$type<Record<string, string | number>>().default({}).notNull(),
    readableMarkings: jsonb("readable_markings").$type<Array<{ text: string; type: string; location: string; confidence: string }>>().default([]).notNull(),
    isMatchable: boolean("is_matchable").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("seeded_display_references_product_idx").on(table.productId),
    index("seeded_display_references_checksum_idx").on(table.checksumSha256),
  ]
);

export const rmaItems = pgTable(
  "rma_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rmaId: uuid("rma_id")
      .notNull()
      .references(() => rmas.id, { onDelete: "cascade" }),
    itemNumber: integer("item_number").notNull(), // 1, 2, 3... per RMA
    status: text("status", {
      enum: [
        "pending_upload",
        "uploaded",
        "queued",
        "processing",
        "suggested_match",
        "review_required",
        "verified",
        "failed",
      ],
    })
      .notNull()
      .default("pending_upload"),
    // Predicted Device Model (Task A)
    predictedManufacturer: text("predicted_manufacturer"),
    predictedModel: text("predicted_model"),
    predictedDisplayAssembly: text("predicted_display_assembly"),
    catalogDisplayId: uuid("catalog_display_id"),
    seededDisplayProductId: uuid("seeded_display_product_id").references(() => seededDisplayProducts.id, { onDelete: "set null" }),
    inventoryMatchConfidence: real("inventory_match_confidence"),
    inventoryMatchEvidence: jsonb("inventory_match_evidence").$type<{
      matchingCues: string[];
      conflictingCues: string[];
      unresolvedAlternatives: string[];
    } | null>(),
    // Identified Vendor (Task B)
    identifiedVendorId: uuid("identified_vendor_id"),
    identifiedVendorVariantId: uuid("identified_vendor_variant_id"),
    // Unified Status
    matchStatus: text("match_status", {
      enum: [
        "exact_match",
        "strong_candidate",
        "possible_candidate",
        "ambiguous",
        "unknown",
        "manually_verified",
      ],
    })
      .notNull()
      .default("unknown"),
    modelConfidenceScore: real("model_confidence_score"),
    vendorConfidenceScore: real("vendor_confidence_score"),
    // Provider specific sub-statuses
    visualStatus: text("visual_status", {
      enum: ["pending", "success", "failed", "skipped"],
    })
      .notNull()
      .default("pending"),
    visualError: text("visual_error"),
    vendorOcrStatus: text("vendor_ocr_status", {
      enum: ["pending", "success", "failed", "skipped"],
    })
      .notNull()
      .default("pending"),
    vendorOcrError: text("vendor_ocr_error"),
    // Summarized OCR text
    extractedTextSummary: text("extracted_text_summary"),
    matchedCodesSummary: text("matched_codes_summary"),
    reviewNotes: text("review_notes"),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    recognitionRevision: integer("recognition_revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("rma_items_rma_item_idx").on(table.rmaId, table.itemNumber),
    index("rma_items_status_idx").on(table.status),
    index("rma_items_match_status_idx").on(table.matchStatus),
    index("rma_items_catalog_display_idx").on(table.catalogDisplayId),
    index("rma_items_seeded_display_product_idx").on(table.seededDisplayProductId),
    index("rma_items_vendor_idx").on(table.identifiedVendorId),
  ]
);

// ---------------------------------------------------------------------------
// 4. Physical Display Images (Item Images)
// ---------------------------------------------------------------------------
export const itemImages = pgTable(
  "item_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rmaItemId: uuid("rma_item_id")
      .notNull()
      .references(() => rmaItems.id, { onDelete: "cascade" }),
    imageType: text("image_type", {
      enum: [
        "primary",
        "front",
        "back",
        "stamp_closeup",
        "sticker_closeup",
        "flex_cable",
        "general",
      ],
    })
      .notNull()
      .default("general"),
    storagePath: text("storage_path").notNull(),
    thumbnailPath: text("thumbnail_path"),
    previewPath: text("preview_path"),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("item_images_item_idx").on(table.rmaItemId),
    index("item_images_checksum_idx").on(table.checksumSha256),
  ]
);

// ---------------------------------------------------------------------------
// 5. Display Model Catalog (Task A Authoritative Data)
// ---------------------------------------------------------------------------
export const displayCatalog = pgTable(
  "display_catalog",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    manufacturer: text("manufacturer").notNull(), // Apple, Samsung, Google, Xiaomi
    modelName: text("model_name").notNull(), // iPhone 13 Pro, Galaxy A15
    normalizedModelIdentifier: text("normalized_model_identifier").notNull().unique(), // apple-iphone-13-pro
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(), // ["iPhone13Pro", "13 Pro", "A2638"]
    internalSku: text("internal_sku"),
    knownPartNumbers: jsonb("known_part_numbers").$type<string[]>().default([]).notNull(),
    displayTechnology: text("display_technology"), // OLED, In-cell LCD, Super AMOLED
    compatibleDeviceModels: jsonb("compatible_device_models").$type<string[]>().default([]).notNull(),
    referenceImagePath: text("reference_image_path"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("display_catalog_mfg_idx").on(table.manufacturer),
    index("display_catalog_norm_idx").on(table.normalizedModelIdentifier),
    index("display_catalog_model_name_idx").on(table.modelName),
  ]
);

// ---------------------------------------------------------------------------
// 6. Vendor Catalog & Variants (Task B Authoritative Data)
// ---------------------------------------------------------------------------
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(), // e.g. "AMI", "JK", "GX", "ZY"
    code: text("code").notNull().unique(), // e.g. "AMI"
    description: text("description"),
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(), // ["AM-I", "AMI Electronics"]
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("vendors_code_idx").on(table.code)]
);

export const vendorVariants = pgTable(
  "vendor_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "AMI/A", "AMI In-cell", "AMI Aftermarket"
    code: text("code").notNull(), // e.g. "AMI/A", "AMI-INCELL"
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
    displayTechnology: text("display_technology"), // "In-cell", "OLED", "Aftermarket"
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("vendor_variants_vendor_idx").on(table.vendorId),
    uniqueIndex("vendor_variants_unique_code_idx").on(table.vendorId, table.code),
  ]
);

export const vendorRecognitionRules = pgTable(
  "vendor_recognition_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    vendorVariantId: uuid("vendor_variant_id").references(
      () => vendorVariants.id,
      { onDelete: "set null" }
    ),
    ruleType: text("rule_type", {
      enum: ["exact_code", "alias", "regex", "normalized_text", "stamp_pattern"],
    })
      .notNull()
      .default("exact_code"),
    pattern: text("pattern").notNull(), // e.g. "AMI/A" or "^AMI[\\/\\-]A$"
    priority: integer("priority").notNull().default(100), // Higher runs first
    confidenceWeight: real("confidence_weight").notNull().default(1.0),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("vendor_rules_priority_idx").on(table.priority),
    index("vendor_rules_vendor_idx").on(table.vendorId),
  ]
);

// ---------------------------------------------------------------------------
// 7. Recognition Runs & Evidence Storage
// ---------------------------------------------------------------------------
export const recognitionRuns = pgTable(
  "recognition_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rmaItemId: uuid("rma_item_id")
      .notNull()
      .references(() => rmaItems.id, { onDelete: "cascade" }),
    pipelineType: text("pipeline_type", {
      enum: ["visual", "vendor_ocr", "unified", "inventory_catalog"],
    }).notNull(),
    providerName: text("provider_name").notNull(),
    status: text("status", { enum: ["started", "completed", "failed"] }).notNull(),
    rawRequest: jsonb("raw_request"),
    rawResponse: jsonb("raw_response"),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    recognitionRevision: integer("recognition_revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("recog_runs_item_idx").on(table.rmaItemId)]
);

export const ocrExtractions = pgTable(
  "ocr_extractions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recognitionRunId: uuid("recognition_run_id")
      .notNull()
      .references(() => recognitionRuns.id, { onDelete: "cascade" }),
    rmaItemId: uuid("rma_item_id")
      .notNull()
      .references(() => rmaItems.id, { onDelete: "cascade" }),
    rawText: jsonb("raw_text").$type<string[]>().default([]).notNull(),
    detectedCodes: jsonb("detected_codes").$type<string[]>().default([]).notNull(),
    partNumbers: jsonb("part_numbers").$type<string[]>().default([]).notNull(),
    vendorMarkings: jsonb("vendor_markings").$type<string[]>().default([]).notNull(),
    technologyMarkings: jsonb("technology_markings").$type<string[]>().default([]).notNull(),
    possibleVendorAliases: jsonb("possible_vendor_aliases").$type<string[]>().default([]).notNull(),
    unreadableRegions: jsonb("unreadable_regions").$type<string[]>().default([]).notNull(),
    extractionNotes: jsonb("extraction_notes").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("ocr_extractions_item_idx").on(table.rmaItemId)]
);

export const recognitionCandidates = pgTable(
  "recognition_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recognitionRunId: uuid("recognition_run_id")
      .notNull()
      .references(() => recognitionRuns.id, { onDelete: "cascade" }),
    rmaItemId: uuid("rma_item_id")
      .notNull()
      .references(() => rmaItems.id, { onDelete: "cascade" }),
    candidateType: text("candidate_type", {
      enum: ["display_model", "vendor"],
    }).notNull(),
    candidateTitle: text("candidate_title").notNull(),
    catalogId: uuid("catalog_id"),
    variantId: uuid("variant_id"),
    score: real("score").notNull().default(0),
    sourceEvidence: text("source_evidence"),
    rank: integer("rank").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("candidates_item_idx").on(table.rmaItemId)]
);

// ---------------------------------------------------------------------------
// 8. Review Actions, Audit Logs & System Settings
// ---------------------------------------------------------------------------
export const reviewActions = pgTable(
  "review_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rmaItemId: uuid("rma_item_id")
      .notNull()
      .references(() => rmaItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    actionType: text("action_type").notNull(), // accept_suggestion, change_model, change_vendor, mark_unknown, etc.
    previousState: jsonb("previous_state"),
    newState: jsonb("new_state"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("review_actions_item_idx").on(table.rmaItemId),
    index("review_actions_user_idx").on(table.userId),
    index("review_actions_created_at_idx").on(table.createdAt),
  ]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    details: jsonb("details"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ]
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
