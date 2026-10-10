import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmas, rmaItems, vendors, vendorVariants, customers, returnReasons } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { buildCsv } from "@/lib/utils/export-csv";
import { desc, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const format = url.searchParams.get("format"); // "csv" or "json"

  // Query verified reports dataset
  const records = await db
    .select({
      rmaNumber: rmas.rmaNumber,
      customerName: customers.name,
      returnReason: returnReasons.label,
      itemNumber: rmaItems.itemNumber,
      manufacturer: rmaItems.predictedManufacturer,
      model: rmaItems.predictedModel,
      displayAssembly: rmaItems.predictedDisplayAssembly,
      vendorName: vendors.name,
      variantName: vendorVariants.name,
      matchStatus: rmaItems.matchStatus,
      itemStatus: rmaItems.status,
      verifiedAt: rmaItems.verifiedAt,
      createdAt: rmaItems.createdAt,
    })
    .from(rmaItems)
    .innerJoin(rmas, eq(rmaItems.rmaId, rmas.id))
    .leftJoin(customers, eq(rmas.customerId, customers.id))
    .leftJoin(returnReasons, eq(rmas.returnReasonId, returnReasons.id))
    .leftJoin(vendors, eq(rmaItems.identifiedVendorId, vendors.id))
    .leftJoin(vendorVariants, eq(rmaItems.identifiedVendorVariantId, vendorVariants.id))
    .orderBy(desc(rmaItems.createdAt))
    .limit(1000);

  if (format === "csv") {
    const headers = [
      "RMA #",
      "Customer",
      "Return Reason",
      "Item #",
      "Manufacturer",
      "Model",
      "Vendor",
      "Vendor Variant",
      "Match Status",
      "Item Status",
      "Verified Timestamp",
      "Intake Timestamp",
    ];

    const rows = records.map((r) => [
      r.rmaNumber,
      r.customerName || "Unknown",
      r.returnReason || "Unspecified",
      r.itemNumber,
      r.manufacturer || "Unresolved",
      r.model || "Unresolved",
      r.vendorName || "Unresolved",
      r.variantName || "Unresolved",
      r.matchStatus,
      r.itemStatus,
      r.verifiedAt ? new Date(r.verifiedAt).toISOString() : "",
      new Date(r.createdAt).toISOString(),
    ]);

    const csvData = buildCsv(headers, rows);

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rma-display-report.csv"',
      },
    });
  }

  return NextResponse.json({ records });
}
