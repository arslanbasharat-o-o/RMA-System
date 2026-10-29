import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/db";
import { requireAuth } from "@/lib/auth/middleware";
import { getBoss, QUEUE_PROCESS_ITEM } from "@/lib/queue";
import { storage } from "@/lib/storage";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = z.object({ id: z.string().uuid(), imageId: z.string().uuid() }).safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid display or photo ID." }, { status: 400 });
  const { id, imageId } = parsed.data;
  const client = await pool.connect();
  let removed: { storage_path: string; thumbnail_path: string | null; preview_path: string | null } | undefined;
  let itemStatus = "pending_upload";
  try {
    await client.query("BEGIN");
    const item = (await client.query<{ status: string; verified_at: Date | null }>(
      "SELECT status, verified_at FROM rma_items WHERE id = $1 FOR UPDATE", [id]
    )).rows[0];
    if (!item) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Display not found." }, { status: 404 });
    }
    if (item.status === "verified" || item.verified_at) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Photos on a verified display cannot be removed during intake." }, { status: 409 });
    }
    removed = (await client.query<NonNullable<typeof removed>>(
      "DELETE FROM item_images WHERE id = $1 AND rma_item_id = $2 RETURNING storage_path, thumbnail_path, preview_path",
      [imageId, id]
    )).rows[0];
    if (!removed) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Photo not found on this display." }, { status: 404 });
    }
    const remaining = Number((await client.query<{ count: string }>(
      "SELECT COUNT(*) FROM item_images WHERE rma_item_id = $1", [id]
    )).rows[0].count);
    itemStatus = remaining ? "queued" : "pending_upload";
    // Fence out in-flight workers before clearing predictions from this photo.
    // The replacement job and deletion commit together, or neither does.
    const revision = (await client.query<{ recognition_revision: number }>(
      `UPDATE rma_items SET recognition_revision = recognition_revision + 1,
       status = $2, predicted_manufacturer = NULL, predicted_model = NULL,
       predicted_display_assembly = NULL, catalog_display_id = NULL,
       seeded_display_product_id = NULL, inventory_match_confidence = NULL,
       inventory_match_evidence = NULL,
       identified_vendor_id = NULL, identified_vendor_variant_id = NULL,
       model_confidence_score = NULL, vendor_confidence_score = NULL,
       match_status = 'unknown', visual_status = $3, visual_error = NULL,
       vendor_ocr_status = $3, vendor_ocr_error = NULL,
       extracted_text_summary = NULL, matched_codes_summary = NULL,
       review_notes = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING recognition_revision`,
      [id, itemStatus, remaining ? "pending" : "skipped"]
    )).rows[0].recognition_revision;
    await client.query(
      `INSERT INTO review_actions (rma_item_id, user_id, action_type, previous_state, new_state, notes)
       VALUES ($1, $2, 'remove_photo', $3::jsonb, $4::jsonb, 'Removed an incorrect intake photo.')`,
      [id, auth.user.userId, JSON.stringify({ image_id: imageId }),
        JSON.stringify({ recognition_revision: revision, image_count: remaining })]
    );
    if (remaining) {
      const boss = await getBoss();
      const jobId = await boss.send(QUEUE_PROCESS_ITEM, { itemId: id, options: { revision } }, {
        retryLimit: 3,
        retryDelay: 5,
        db: { executeSql: async (text, values) => {
          const result = await client.query(text, values);
          return { rows: result.rows };
        } },
      });
      if (!jobId) throw new Error("Recognition could not be queued after photo removal.");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Photo removal failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not remove this photo. Please try again." }, { status: 503 });
  } finally {
    client.release();
  }
  // Files are removed only after the database and queue transaction succeeds.
  for (const path of new Set([removed.storage_path, removed.thumbnail_path, removed.preview_path])) {
    if (!path) continue;
    try { await storage.deleteImage(path); }
    catch (error) {
      console.error("Removed photo file cleanup failed:", error instanceof Error ? error.message : "Unknown error");
    }
  }
  return NextResponse.json({ success: true, deletedImageId: imageId, itemStatus });
}
