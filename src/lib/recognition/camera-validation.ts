/**
 * RMA System — Display Camera & Recognition Image Validation
 *
 * Business Requirements:
 * 1. Front of display: REQUIRED
 * 2. Back of display: REQUIRED
 * 3. Flex cable close-up: OPTIONAL
 * 4. Additional photographs: OPTIONAL
 *
 * Front and Back are both mandatory for new recognition requests.
 * Flex is optional and enhances OCR/part-number identification when present.
 * Historical records created before this rule are preserved without corruption.
 */

export interface CandidateDisplayImage {
  id?: string;
  imageType: string;
  checksumSha256?: string | null;
  storagePath?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
}

export interface DisplayImageValidationResult {
  valid: boolean;
  error?: string;
  missingRoles: Array<"front" | "back">;
  hasFront: boolean;
  hasBack: boolean;
  hasFlex: boolean;
  frontImage?: CandidateDisplayImage;
  backImage?: CandidateDisplayImage;
  flexImage?: CandidateDisplayImage;
  additionalImages: CandidateDisplayImage[];
}

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/**
 * Checks if an image is considered a Front view.
 * Supports "front" and legacy "primary".
 */
export function isFrontImage(image: CandidateDisplayImage): boolean {
  return image.imageType === "front" || image.imageType === "primary";
}

/**
 * Checks if an image is considered a Back view.
 */
export function isBackImage(image: CandidateDisplayImage): boolean {
  return image.imageType === "back";
}

/**
 * Checks if an image is considered a Flex cable view.
 */
export function isFlexImage(image: CandidateDisplayImage): boolean {
  return image.imageType === "flex_cable";
}

/**
 * Validates whether an attached set of display images satisfies the mandatory
 * Front + Back requirements for display recognition.
 */
export function validateDisplayImagesForRecognition(
  images: CandidateDisplayImage[]
): DisplayImageValidationResult {
  if (!images || !Array.isArray(images) || images.length === 0) {
    return {
      valid: false,
      error: "Both front and back display images are required for recognition.",
      missingRoles: ["front", "back"],
      hasFront: false,
      hasBack: false,
      hasFlex: false,
      additionalImages: [],
    };
  }

  // Filter valid images (size > 0, supported mime if provided)
  const validImages = images.filter((img) => {
    if (img.fileSizeBytes !== undefined && img.fileSizeBytes !== null && img.fileSizeBytes <= 0) {
      return false;
    }
    if (img.mimeType && !SUPPORTED_MIME_TYPES.has(img.mimeType)) {
      return false;
    }
    return true;
  });

  const frontCandidates = validImages.filter(isFrontImage);
  const backCandidates = validImages.filter(isBackImage);
  const flexCandidates = validImages.filter(isFlexImage);
  const additionalImages = validImages.filter(
    (img) => !isFrontImage(img) && !isBackImage(img) && !isFlexImage(img)
  );

  const hasFront = frontCandidates.length > 0;
  const hasBack = backCandidates.length > 0;
  const hasFlex = flexCandidates.length > 0;

  const missingRoles: Array<"front" | "back"> = [];
  if (!hasFront) missingRoles.push("front");
  if (!hasBack) missingRoles.push("back");

  if (missingRoles.length === 2) {
    return {
      valid: false,
      error: "Both front and back display images are required for recognition.",
      missingRoles,
      hasFront,
      hasBack,
      hasFlex,
      additionalImages,
    };
  }

  if (!hasFront) {
    return {
      valid: false,
      error: "Front display image is required for recognition. Please capture or upload the front view.",
      missingRoles,
      hasFront,
      hasBack,
      hasFlex,
      backImage: backCandidates[0],
      flexImage: flexCandidates[0],
      additionalImages,
    };
  }

  if (!hasBack) {
    return {
      valid: false,
      error: "Back display image is required for recognition. Please capture or upload the back view.",
      missingRoles,
      hasFront,
      hasBack,
      hasFlex,
      frontImage: frontCandidates[0],
      flexImage: flexCandidates[0],
      additionalImages,
    };
  }

  const frontImage = frontCandidates[0];
  const backImage = backCandidates[0];

  // Anti-bypass guard: Ensure front and back are distinct physical images
  if (
    frontImage.id &&
    backImage.id &&
    frontImage.id === backImage.id
  ) {
    return {
      valid: false,
      error: "Front and back display photos must be distinct photographs.",
      missingRoles: [],
      hasFront: true,
      hasBack: true,
      hasFlex,
      additionalImages,
    };
  }

  if (
    frontImage.checksumSha256 &&
    backImage.checksumSha256 &&
    frontImage.checksumSha256 === backImage.checksumSha256
  ) {
    return {
      valid: false,
      error: "Front and back display photos must be distinct photographs (identical image detected for both roles).",
      missingRoles: [],
      hasFront: true,
      hasBack: true,
      hasFlex,
      additionalImages,
    };
  }

  if (
    frontImage.storagePath &&
    backImage.storagePath &&
    frontImage.storagePath === backImage.storagePath
  ) {
    return {
      valid: false,
      error: "Front and back display photos must refer to distinct storage files.",
      missingRoles: [],
      hasFront: true,
      hasBack: true,
      hasFlex,
      additionalImages,
    };
  }

  return {
    valid: true,
    missingRoles: [],
    hasFront: true,
    hasBack: true,
    hasFlex,
    frontImage,
    backImage,
    flexImage: flexCandidates[0],
    additionalImages: [...additionalImages, ...flexCandidates.slice(1)],
  };
}
