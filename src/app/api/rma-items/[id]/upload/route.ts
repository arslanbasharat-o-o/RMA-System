import { hasIntakeCustomer, CUSTOMER_REQUIRED } from "@/lib/intake-customer";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rmaItems, itemImages } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { storage } from "@/lib/storage";
import { validateImageMagicBytes } from "@/lib/storage/validation";
import { enqueueRmaItem } from "@/lib/queue";
import { eq, desc } from "drizzle-orm";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, ["admin", "operator"]);
  if (auth instanceof NextResponse) return auth;

  const { id: itemId } = await params;

  // 1. Verify item exists
  const [item] = await db
    .select()
    .from(rmaItems)
    .where(eq(rmaItems.id, itemId));

  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  if (!await hasIntakeCustomer(item.rmaId)) {
    return NextResponse.json({ error: CUSTOMER_REQUIRED }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const imageType = (formData.get("imageType") as string) || "general";

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided in upload request." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 25MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB).` },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported image MIME type: ${file.type}. Allowed: JPEG, PNG, WebP.` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json(
        { error: "Image file is empty (0 bytes)." },
        { status: 400 }
      );
    }

    // Actual file-content validation (magic bytes verification)
    const { valid } = validateImageMagicBytes(buffer);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid image content: file signature does not match a valid JPEG, PNG, WebP, or HEIC image." },
        { status: 400 }
      );
    }

    // Checksum for idempotency (Scenario H)
    const crypto = await import("crypto");
    const checksumSha256 = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    // Idempotency check: if identical image already uploaded for this item, return existing
    const { and } = await import("drizzle-orm");
    const [existingImage] = await db
      .select()
      .from(itemImages)
      .where(
        and(
          eq(itemImages.rmaItemId, itemId),
          eq(itemImages.checksumSha256, checksumSha256)
        )
      );

    if (existingImage) {
      return NextResponse.json({
        success: true,
        image: existingImage,
        itemStatus: item.status,
        deduplicated: true,
        message: "Image already attached to this display item (duplicate prevented).",
      });
    }

    // Save image to private storage and generate thumbnails via Sharp
    const stored = await storage.saveImage(
      buffer,
      file.name,
      file.type,
      `rma_${item.rmaId}/item_${itemId}`
    );

    // Determine sort order
    const [lastImg] = await db
      .select({ sortOrder: itemImages.sortOrder })
      .from(itemImages)
      .where(eq(itemImages.rmaItemId, itemId))
      .orderBy(desc(itemImages.sortOrder))
      .limit(1);

    const nextSortOrder = (lastImg?.sortOrder || 0) + 1;

    const [savedImage] = await db
      .insert(itemImages)
      .values({
        rmaItemId: itemId,
        imageType: imageType as any,
        storagePath: stored.storagePath,
        thumbnailPath: stored.thumbnailPath,
        previewPath: stored.previewPath,
        originalFilename: stored.originalFilename,
        mimeType: stored.mimeType,
        fileSizeBytes: stored.fileSizeBytes,
        checksumSha256: stored.checksumSha256,
        width: stored.width,
        height: stored.height,
        sortOrder: nextSortOrder,
      })
      .returning();

    // Update item status to queued
    await db
      .update(rmaItems)
      .set({
        status: "queued",
        updatedAt: new Date(),
      })
      .where(eq(rmaItems.id, itemId));

    // Enqueue recognition asynchronously - HTTP response returns immediately!
    await enqueueRmaItem(itemId);

    return NextResponse.json({
      success: true,
      image: savedImage,
      itemStatus: "queued",
      message: "Image uploaded and queued for recognition.",
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Upload error:", errorMsg);
    if (errorMsg.includes("unsupported") || errorMsg.includes("Input buffer") || errorMsg.includes("Invalid image")) {
      return NextResponse.json(
        { error: "Corrupted or unreadable image file." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Image processing or storage failure." },
      { status: 500 }
    );
  }
}
