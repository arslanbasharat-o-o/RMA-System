import sharp from "sharp";

export type DisplayImageType =
  | "primary"
  | "front"
  | "back"
  | "flex_cable"
  | "stamp_closeup"
  | "sticker_closeup"
  | "general";

export interface DisplayFeatureCrop {
  kind: "camera_notch" | "flex_area" | "connector_markings" | "mid_back_stamp" | "detail";
  label: string;
  buffer: Buffer;
}

export interface PreprocessedImages {
  primaryBuffer: Buffer;
  cropBuffer?: Buffer;
  enhancedStampBuffer?: Buffer;
  allCrops: DisplayFeatureCrop[];
}

const IMAGE_TYPE_LABELS: Record<DisplayImageType, string> = {
  primary: "front view",
  front: "front view",
  back: "back view",
  flex_cable: "flex cable close-up",
  stamp_closeup: "stamp close-up",
  sticker_closeup: "sticker close-up",
  general: "general view",
};

export function normalizeDisplayImageType(value?: string): DisplayImageType {
  return value && Object.prototype.hasOwnProperty.call(IMAGE_TYPE_LABELS, value)
    ? value as DisplayImageType
    : "general";
}

export function displayImageTypeLabel(value?: string): string {
  return IMAGE_TYPE_LABELS[normalizeDisplayImageType(value)];
}

export function selectDisplayImagesForOcr<T extends { id: string; imageType: string }>(images: T[]): T[] {
  const preferred = [
    images.find((image) => image.imageType === "primary" || image.imageType === "front"),
    images.find((image) => image.imageType === "flex_cable"),
    images.find((image) => image.imageType === "back"),
    ...images.filter((image) => image.imageType === "stamp_closeup" || image.imageType === "sticker_closeup"),
    ...images,
  ];
  return [...new Map(
    preferred.filter((image): image is T => Boolean(image)).map((image) => [image.id, image])
  ).values()].slice(0, 4);
}

/**
 * Normalize the image, then crop only the physical region implied by its
 * captured angle. Front photos expose the camera notch; back photos expose
 * flex cables and their markings.
 */
export async function preprocessForOcr(
  imageBuffer: Buffer,
  imageTypeOrLegacyFlexCrop?: string | boolean
): Promise<PreprocessedImages> {
  const type = typeof imageTypeOrLegacyFlexCrop === "boolean"
    ? imageTypeOrLegacyFlexCrop ? "back" : "stamp_closeup"
    : normalizeDisplayImageType(imageTypeOrLegacyFlexCrop);
  const primaryBuffer = await sharp(imageBuffer)
    .rotate()
    .resize(2560, 2560, { fit: "inside", withoutEnlargement: true })
    .normalize()
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const crops: DisplayFeatureCrop[] = [];
  let cropBuffer: Buffer | undefined;
  let enhancedStampBuffer: Buffer | undefined;

  try {
    const meta = await sharp(primaryBuffer).metadata();
    const width = meta.width || 1000;
    const height = meta.height || 1000;
    if (width <= 10 || height <= 10) return { primaryBuffer, allCrops: crops };

    if (type === "primary" || type === "front") {
      const notchHeight = Math.max(1, Math.floor(height * 0.34));
      const notch = await sharp(primaryBuffer)
        .extract({ left: 0, top: 0, width, height: notchHeight })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();
      crops.push({ kind: "camera_notch", label: "front camera notch and top edge", buffer: notch });
    } else if (type === "back" || type === "general") {
      const flexHeight = Math.max(1, Math.floor(height * 0.4));
      const flexTop = height - flexHeight;
      cropBuffer = await sharp(primaryBuffer)
        .extract({ left: 0, top: flexTop, width, height: flexHeight })
        .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();
      crops.push({ kind: "flex_area", label: "lower flex cable and connector region", buffer: cropBuffer });

      const markingWidth = Math.max(1, Math.floor(width * 0.7));
      const markingHeight = Math.max(1, Math.floor(flexHeight * 0.7));
      const markingLeft = Math.floor((width - markingWidth) / 2);
      const markingTop = flexTop + Math.floor((flexHeight - markingHeight) / 2);
      enhancedStampBuffer = await sharp(primaryBuffer)
        .extract({ left: markingLeft, top: markingTop, width: markingWidth, height: markingHeight })
        .linear(1.2, -15)
        .sharpen({ sigma: 2.0, m1: 1.5, m2: 3.0 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();
      crops.push({ kind: "connector_markings", label: "flex cable connector markings close-up", buffer: enhancedStampBuffer });

      // Mid-backplate stamp & markings region (y: 35% to 75%):
      // Vendor stamps, QC inspection marks, and supplier codes are often placed on the mid-back shield
      const midTop = Math.max(0, Math.floor(height * 0.35));
      const midHeight = Math.min(height - midTop, Math.floor(height * 0.40));
      const midWidth = Math.max(1, Math.floor(width * 0.85));
      const midLeft = Math.floor((width - midWidth) / 2);

      const midBackBuffer = await sharp(primaryBuffer)
        .extract({ left: midLeft, top: midTop, width: midWidth, height: midHeight })
        .clahe({ width: 24, height: 24, maxSlope: 3 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();
      crops.push({ kind: "mid_back_stamp", label: "mid-backplate inspection stamp and shield markings", buffer: midBackBuffer });

      // Inverted (180° rotated) mid-backplate view:
      // Critical: Factory QC & vendor ink stamps on display backplates are frequently stamped upside-down
      // relative to the phone's upright orientation. Providing this 180° rotated crop enables OCR models
      // to read inverted stamps right-side-up with complete clarity.
      const invTargetWidth = Math.max(800, midWidth * 2);
      const midBackInvertedBuffer = await sharp(primaryBuffer)
        .extract({ left: midLeft, top: midTop, width: midWidth, height: midHeight })
        .rotate(180)
        .resize(invTargetWidth, null, { kernel: "lanczos3", withoutEnlargement: false })
        .clahe({ width: 24, height: 24, maxSlope: 3 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();
      crops.push({ kind: "mid_back_stamp", label: "mid-backplate markings (180-degree rotated view for inverted ink stamps)", buffer: midBackInvertedBuffer });

      // Tight focused lower-mid stamp crop (y: 44% to 66%):
      // Provides a close-up magnification of the factory stamp zone right above the flex connector
      const tightTop = Math.max(0, Math.floor(height * 0.44));
      const tightHeight = Math.min(height - tightTop, Math.floor(height * 0.20));
      const tightWidth = Math.max(1, Math.floor(width * 0.60));
      const tightLeft = Math.floor((width - tightWidth) / 2);
      const tightTargetWidth = Math.max(900, tightWidth * 3);

      const tightStampBuffer = await sharp(primaryBuffer)
        .extract({ left: tightLeft, top: tightTop, width: tightWidth, height: tightHeight })
        .rotate(180)
        .resize(tightTargetWidth, null, { kernel: "lanczos3", withoutEnlargement: false })
        .clahe({ width: 24, height: 24, maxSlope: 3 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();
      crops.push({ kind: "mid_back_stamp", label: "tight close-up of vendor ink stamp (rotated 180-degrees)", buffer: tightStampBuffer });
    } else if (type === "flex_cable") {
      const detailWidth = Math.max(1, Math.floor(width * 0.85));
      const detailHeight = Math.max(1, Math.floor(height * 0.85));
      const detailLeft = Math.floor((width - detailWidth) / 2);
      const detailTop = Math.floor((height - detailHeight) / 2);
      cropBuffer = await sharp(primaryBuffer)
        .extract({ left: detailLeft, top: detailTop, width: detailWidth, height: detailHeight })
        .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();
      crops.push({ kind: "flex_area", label: "flex cable and printed code close-up", buffer: cropBuffer });
    } else if (type === "stamp_closeup" || type === "sticker_closeup") {
      const detailWidth = Math.max(1, Math.floor(width * 0.85));
      const detailHeight = Math.max(1, Math.floor(height * 0.85));
      const detailLeft = Math.floor((width - detailWidth) / 2);
      const detailTop = Math.floor((height - detailHeight) / 2);
      const detail = await sharp(primaryBuffer)
        .extract({ left: detailLeft, top: detailTop, width: detailWidth, height: detailHeight })
        .linear(1.2, -15)
        .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();
      crops.push({ kind: "detail", label: `${displayImageTypeLabel(type)} detail`, buffer: detail });
    }
  } catch {
    // Keep the full normalized image usable if a targeted crop cannot be produced.
  }

  return { primaryBuffer, cropBuffer, enhancedStampBuffer, allCrops: crops };
}
