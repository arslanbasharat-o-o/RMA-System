import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmas, rmaItems, vendors, vendorVariants, customers } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { buildCsv } from "@/lib/utils/export-csv";
import { eq, asc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const [rma] = await db
    .select({
      rmaNumber: rmas.rmaNumber,
      customerName: customers.name,
      createdAt: rmas.createdAt,
    })
    .from(rmas)
    .leftJoin(customers, eq(rmas.customerId, customers.id))
    .where(eq(rmas.id, id));

  if (!rma) {
    return NextResponse.json({ error: "RMA not found." }, { status: 404 });
  }

  const items = await db
    .select({
      itemNumber: rmaItems.itemNumber,
      manufacturer: rmaItems.predictedManufacturer,
      model: rmaItems.predictedModel,
      assembly: rmaItems.predictedDisplayAssembly,
      vendorName: vendors.name,
      variantName: vendorVariants.name,
      matchStatus: rmaItems.matchStatus,
      status: rmaItems.status,
      modelConfidence: rmaItems.modelConfidenceScore,
      extractedMarkings: rmaItems.extractedTextSummary,
      matchedCodes: rmaItems.matchedCodesSummary,
      verifiedAt: rmaItems.verifiedAt,
    })
    .from(rmaItems)
    .leftJoin(vendors, eq(rmaItems.identifiedVendorId, vendors.id))
    .leftJoin(vendorVariants, eq(rmaItems.identifiedVendorVariantId, vendorVariants.id))
    .where(eq(rmaItems.rmaId, id))
    .orderBy(asc(rmaItems.itemNumber));

  const headers = [
    "Item #",
    "Manufacturer",
    "Model",
    "Display Assembly",
    "Vendor",
    "Vendor Variant",
    "Match Status",
    "Item Status",
    "Model Confidence",
    "Extracted Markings",
    "Matched Codes",
    "Verified Timestamp",
  ];

  const rows = items.map((i) => [
    i.itemNumber,
    i.manufacturer || "Unresolved",
    i.model || "Unresolved",
    i.assembly || "",
    i.vendorName || "Unresolved",
    i.variantName || "Unresolved",
    i.matchStatus,
    i.status,
    i.modelConfidence ? (i.modelConfidence * 100).toFixed(1) + "%" : "N/A",
    i.extractedMarkings || "",
    i.matchedCodes || "",
    i.verifiedAt ? new Date(i.verifiedAt).toISOString() : "",
  ]);

  const csvContent = buildCsv(headers, rows);

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${rma.rmaNumber}-displays.csv"`,
    },
  });
}
