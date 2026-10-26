import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems, reviewActions, displayCatalog, vendors, vendorVariants } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

const ReviewActionSchema = z.object({
  action: z.enum([
    "accept_suggestion",
    "change_model",
    "change_vendor",
    "mark_unknown",
    "manual_verify",
  ]),
  catalogDisplayId: z.string().uuid().optional().nullable(),
  predictedManufacturer: z.string().optional().nullable(),
  predictedModel: z.string().optional().nullable(),
  selectedCandidateTitle: z.string().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  vendorVariantId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  const { id: itemId } = await params;

  const [item] = await db
    .select()
    .from(rmaItems)
    .where(eq(rmaItems.id, itemId));

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const body = await req.json();
  const parsed = ReviewActionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { action, catalogDisplayId, predictedManufacturer, predictedModel, vendorId, vendorVariantId, notes } = parsed.data;

  if (action === "accept_suggestion" &&
    (!(["suggested_match", "review_required"].includes(item.status)) ||
      !(item.predictedModel || item.identifiedVendorId))) {
    return NextResponse.json({ error: "This item has no eligible suggestion to accept." }, { status: 409 });
  }
  if (action === "change_model" && !catalogDisplayId && !predictedModel) {
    return NextResponse.json({ error: "Choose or enter a display model before saving this action." }, { status: 400 });
  }
  if (action === "change_vendor" && !vendorId) {
    return NextResponse.json({ error: "Choose a vendor before saving this action." }, { status: 400 });
  }
  if (vendorVariantId && !vendorId) {
    return NextResponse.json({ error: "A vendor is required when choosing a variant." }, { status: 400 });
  }
  if (action === "manual_verify" && !(
    catalogDisplayId || predictedModel || vendorId || item.predictedModel || item.identifiedVendorId || notes
  )) {
    return NextResponse.json({ error: "Add a model, vendor identification, or verification notes before manual verification." }, { status: 400 });
  }

  const previousState = {
    status: item.status,
    matchStatus: item.matchStatus,
    predictedModel: item.predictedModel,
    predictedManufacturer: item.predictedManufacturer,
    identifiedVendorId: item.identifiedVendorId,
    identifiedVendorVariantId: item.identifiedVendorVariantId,
  };

  const updatePayload: Partial<typeof rmaItems.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (action === "accept_suggestion") {
    updatePayload.status = "verified";
    updatePayload.matchStatus = "manually_verified";
    updatePayload.verifiedByUserId = auth.user.userId;
    updatePayload.verifiedAt = new Date();
    if (notes) updatePayload.reviewNotes = notes;
  } else if (
    action === "manual_verify" ||
    action === "change_model" ||
    action === "change_vendor"
  ) {
    updatePayload.status = "verified";
    updatePayload.matchStatus = "manually_verified";
    updatePayload.verifiedByUserId = auth.user.userId;
    updatePayload.verifiedAt = new Date();
    if (notes) updatePayload.reviewNotes = notes;

    // Apply model override if provided via catalog ID or direct model name (from search candidates)
    if (catalogDisplayId) {
      const [cat] = await db
        .select()
        .from(displayCatalog)
        .where(and(eq(displayCatalog.id, catalogDisplayId), eq(displayCatalog.isActive, true)));

      if (!cat) return NextResponse.json({ error: "The selected display model is missing or inactive." }, { status: 400 });
      updatePayload.catalogDisplayId = cat.id;
      updatePayload.predictedManufacturer = cat.manufacturer;
      const cleanCatModel =
        cat.manufacturer !== "OnePlus" &&
        cat.modelName.toLowerCase().startsWith(cat.manufacturer.toLowerCase())
          ? cat.modelName.slice(cat.manufacturer.length).trim()
          : cat.modelName;
      updatePayload.predictedModel = cleanCatModel || cat.modelName;
      const displayLabel = cat.modelName.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith(cat.manufacturer.toLowerCase().replace(/[^a-z0-9]/g, ""))
        ? cat.modelName
        : `${cat.manufacturer} ${cat.modelName}`;
      updatePayload.predictedDisplayAssembly = `${displayLabel} (${cat.displayTechnology || "Display"})`;
    } else if (predictedModel) {
      const cleanModel = predictedModel.trim();
      const manufacturer = predictedManufacturer?.trim() || item.predictedManufacturer || "Unspecified";
      updatePayload.predictedManufacturer = manufacturer;
      updatePayload.predictedModel = cleanModel;
      updatePayload.predictedDisplayAssembly = `${manufacturer} ${cleanModel} Display`;
      updatePayload.catalogDisplayId = null;
    }

    // Apply vendor override if provided
    if (vendorId) {
      const [selectedVendor] = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.id, vendorId), eq(vendors.isActive, true)));
      if (!selectedVendor) return NextResponse.json({ error: "The selected vendor is missing or inactive." }, { status: 400 });
      if (vendorVariantId) {
        const [selectedVariant] = await db
          .select({ id: vendorVariants.id })
          .from(vendorVariants)
          .where(and(
            eq(vendorVariants.id, vendorVariantId),
            eq(vendorVariants.vendorId, vendorId),
            eq(vendorVariants.isActive, true)
          ));
        if (!selectedVariant) return NextResponse.json({ error: "The selected variant does not belong to this active vendor." }, { status: 400 });
      }
      updatePayload.identifiedVendorId = vendorId;
      updatePayload.identifiedVendorVariantId = vendorVariantId || null;
    }
  } else if (action === "mark_unknown") {
    updatePayload.status = "review_required";
    updatePayload.matchStatus = "unknown";
    updatePayload.predictedModel = null;
    updatePayload.predictedManufacturer = null;
    updatePayload.predictedDisplayAssembly = null;
    updatePayload.catalogDisplayId = null;
    updatePayload.modelConfidenceScore = null;
    updatePayload.vendorConfidenceScore = null;
    updatePayload.identifiedVendorId = null;
    updatePayload.identifiedVendorVariantId = null;
    updatePayload.verifiedByUserId = null;
    updatePayload.verifiedAt = null;
    if (notes) updatePayload.reviewNotes = notes;
  }

  const updatedItem = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(rmaItems)
      .set({
        ...updatePayload,
        recognitionRevision: sql`${rmaItems.recognitionRevision} + 1`,
      })
      .where(eq(rmaItems.id, itemId))
      .returning();

    await tx.insert(reviewActions).values({
      rmaItemId: itemId,
      userId: auth.user.userId,
      actionType: action,
      previousState,
      newState: { ...updatePayload, recognitionRevision: "incremented" },
      notes: notes || `Operator applied action: ${action}`,
    });
    return updated;
  });

  return NextResponse.json({
    success: true,
    item: updatedItem,
    message: "Correction recorded successfully.",
  });
}
