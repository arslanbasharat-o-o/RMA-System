import sharp from "sharp";

export interface PreprocessedImages {
  primaryBuffer: Buffer;
  cropBuffer?: Buffer;
  enhancedStampBuffer?: Buffer;
  allCrops: Buffer[];
}

/**
 * Preprocesses an image buffer using Sharp for optimal OCR readability of display assemblies.
 * - Auto-rotates via EXIF.
 * - Normalizes dynamic range and contrast.
 * - Uses 4:4:4 chroma subsampling so ink stamp colors (purple/violet) and sharp edges don't blur.
 * - Generates targeted high-contrast crops of the bottom flex cable and connector stamp regions.
 */
export async function preprocessForOcr(
  imageBuffer: Buffer,
  generateFlexCrop = true
): Promise<PreprocessedImages> {
  // 1. Process primary image with contrast normalization and high chroma fidelity
  const primaryBuffer = await sharp(imageBuffer)
    .rotate() // auto-orient based on EXIF
    .resize(2560, 2560, { fit: "inside", withoutEnlargement: true })
    .normalize() // stretch dynamic range to make faint markings legible
    .jpeg({
      quality: 95,
      chromaSubsampling: "4:4:4", // preserve exact color borders for violet/cyan ink stamps
    })
    .toBuffer();

  const crops: Buffer[] = [];
  let cropBuffer: Buffer | undefined;
  let enhancedStampBuffer: Buffer | undefined;

  if (generateFlexCrop) {
    try {
      const meta = await sharp(primaryBuffer).metadata();
      const width = meta.width || 1000;
      const height = meta.height || 1000;

      if (width > 10 && height > 10) {
        // Extract bottom 40% of the display assembly where flex cables, ICs and stamps live
        const cropHeight = Math.max(1, Math.floor(height * 0.4));
        const cropTop = height - cropHeight;

      cropBuffer = await sharp(primaryBuffer)
        .extract({
          left: 0,
          top: cropTop,
          width,
          height: cropHeight,
        })
        .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.0 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();

      crops.push(cropBuffer);

      // Extract ultra-close-up center-bottom connector area with enhanced micro-contrast
      // Specifically tuned for faint silver/gold laser etchings on black flexible printed circuits
      const stampWidth = Math.floor(width * 0.7);
      const stampLeft = Math.floor((width - stampWidth) / 2);
      const stampHeight = Math.floor(cropHeight * 0.7);
      const stampTop = cropTop + Math.floor((cropHeight - stampHeight) / 2);

      enhancedStampBuffer = await sharp(primaryBuffer)
        .extract({
          left: stampLeft,
          top: stampTop,
          width: stampWidth,
          height: stampHeight,
        })
        .linear(1.2, -15) // boost micro-contrast for laser etchings & faint ink stamps
        .sharpen({ sigma: 2.0, m1: 1.5, m2: 3.0 })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
        .toBuffer();

        crops.push(enhancedStampBuffer);
      }
    } catch {
      // If crop fails gracefully, primary image remains valid
    }
  }

  return {
    primaryBuffer,
    cropBuffer,
    enhancedStampBuffer,
    allCrops: crops,
  };
}
