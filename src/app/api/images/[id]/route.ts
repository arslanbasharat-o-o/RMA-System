import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { itemImages, seededDisplayReferences } from "@/db/schema";
import { requireAuth } from "@/lib/auth/middleware";
import { storage } from "@/lib/storage";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Enforce authentication for private images
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const url = new URL(req.url);
  const size = url.searchParams.get("size"); // "thumb" | "preview" | undefined

  let [imageRecord] = await db
    .select()
    .from(itemImages)
    .where(eq(itemImages.id, id));

  // If not found by direct image UUID, check if id is an rmaItemId (fetch primary image)
  if (!imageRecord) {
    const { asc } = await import("drizzle-orm");
    [imageRecord] = await db
      .select()
      .from(itemImages)
      .where(eq(itemImages.rmaItemId, id))
      .orderBy(asc(itemImages.sortOrder))
      .limit(1);
  }

  // If still not found, check seededDisplayReferences
  if (!imageRecord) {
    const [seededRef] = await db
      .select()
      .from(seededDisplayReferences)
      .where(eq(seededDisplayReferences.id, id));

    if (seededRef) {
      imageRecord = {
        id: seededRef.id,
        storagePath: seededRef.storagePath,
        mimeType: "image/jpeg",
        thumbnailPath: null,
        previewPath: null,
      } as any;
    }
  }

  if (!imageRecord) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  let targetPath = imageRecord.storagePath;
  let contentType = imageRecord.mimeType;

  if (size === "thumb" && imageRecord.thumbnailPath) {
    targetPath = imageRecord.thumbnailPath;
    contentType = "image/webp";
  } else if (size === "preview" && imageRecord.previewPath) {
    targetPath = imageRecord.previewPath;
    contentType = "image/webp";
  }

  try {
    const buffer = await storage.getImageBuffer(targetPath);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Error streaming image:", err);
    return NextResponse.json(
      { error: "Image file could not be read from private storage." },
      { status: 500 }
    );
  }
}
