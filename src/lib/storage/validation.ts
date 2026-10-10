/**
 * Magic bytes validator for uploaded image files.
 * Protects against MIME-spoofing and corrupted payload uploads.
 */
export function validateImageMagicBytes(buffer: Buffer): {
  valid: boolean;
  detectedFormat?: "jpeg" | "png" | "webp" | "heic";
} {
  if (!buffer || buffer.length < 4) {
    return { valid: false };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedFormat: "jpeg" };
  }

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { valid: true, detectedFormat: "png" };
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { valid: true, detectedFormat: "webp" };
  }

  // HEIF / HEIC: byte 4-8 = 'ftyp'
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
  ) {
    return { valid: true, detectedFormat: "heic" };
  }

  return { valid: false };
}
