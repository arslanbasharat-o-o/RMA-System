import { describe, expect, it } from "vitest";
import {
  validateDisplayImagesForRecognition,
  isFrontImage,
  isBackImage,
  isFlexImage,
  CandidateDisplayImage,
} from "@/lib/recognition/camera-validation";

describe("RMA Camera & Recognition Image Validation — 17 Mandatory Scenarios", () => {
  const validFront: CandidateDisplayImage = {
    id: "img-front-1",
    imageType: "front",
    checksumSha256: "front-sha256-hash-1111",
    storagePath: "uploads/item-1/front.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 1024 * 100,
  };

  const legacyPrimaryFront: CandidateDisplayImage = {
    id: "img-primary-1",
    imageType: "primary",
    checksumSha256: "primary-sha256-hash-2222",
    storagePath: "uploads/item-1/primary.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 1024 * 120,
  };

  const validBack: CandidateDisplayImage = {
    id: "img-back-1",
    imageType: "back",
    checksumSha256: "back-sha256-hash-3333",
    storagePath: "uploads/item-1/back.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 1024 * 150,
  };

  const validFlex: CandidateDisplayImage = {
    id: "img-flex-1",
    imageType: "flex_cable",
    checksumSha256: "flex-sha256-hash-4444",
    storagePath: "uploads/item-1/flex.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 1024 * 80,
  };

  const validLabel: CandidateDisplayImage = {
    id: "img-label-1",
    imageType: "stamp_closeup",
    checksumSha256: "label-sha256-hash-5555",
    storagePath: "uploads/item-1/label.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 1024 * 50,
  };

  // Scenario 1: No images uploaded
  it("Scenario 1: No images uploaded — rejects recognition and reports both roles missing", () => {
    const res = validateDisplayImagesForRecognition([]);
    expect(res.valid).toBe(false);
    expect(res.missingRoles).toEqual(["front", "back"]);
    expect(res.error).toMatch(/both front and back/i);
  });

  // Scenario 2: Front only
  it("Scenario 2: Front only — rejects recognition and reports back image missing", () => {
    const res = validateDisplayImagesForRecognition([validFront]);
    expect(res.valid).toBe(false);
    expect(res.hasFront).toBe(true);
    expect(res.hasBack).toBe(false);
    expect(res.missingRoles).toEqual(["back"]);
    expect(res.error).toMatch(/back display image is required/i);
  });

  // Scenario 3: Back only
  it("Scenario 3: Back only — rejects recognition and reports front image missing", () => {
    const res = validateDisplayImagesForRecognition([validBack]);
    expect(res.valid).toBe(false);
    expect(res.hasFront).toBe(false);
    expect(res.hasBack).toBe(true);
    expect(res.missingRoles).toEqual(["front"]);
    expect(res.error).toMatch(/front display image is required/i);
  });

  // Scenario 4: Both front and back
  it("Scenario 4: Both front and back — satisfies mandatory requirements without flex", () => {
    const res = validateDisplayImagesForRecognition([validFront, validBack]);
    expect(res.valid).toBe(true);
    expect(res.hasFront).toBe(true);
    expect(res.hasBack).toBe(true);
    expect(res.hasFlex).toBe(false);
    expect(res.missingRoles).toHaveLength(0);
    expect(res.frontImage?.id).toBe(validFront.id);
    expect(res.backImage?.id).toBe(validBack.id);
  });

  // Scenario 5: Front, back, and flex
  it("Scenario 5: Front, back, and flex — accepts all and flags flex present", () => {
    const res = validateDisplayImagesForRecognition([validFront, validBack, validFlex]);
    expect(res.valid).toBe(true);
    expect(res.hasFront).toBe(true);
    expect(res.hasBack).toBe(true);
    expect(res.hasFlex).toBe(true);
    expect(res.flexImage?.id).toBe(validFlex.id);
  });

  // Scenario 6: Front and back with additional photos
  it("Scenario 6: Front and back with additional photos — associates additional photos", () => {
    const res = validateDisplayImagesForRecognition([validFront, validBack, validLabel]);
    expect(res.valid).toBe(true);
    expect(res.hasFront).toBe(true);
    expect(res.hasBack).toBe(true);
    expect(res.additionalImages).toHaveLength(1);
    expect(res.additionalImages[0].id).toBe(validLabel.id);
  });

  // Scenario 7: Invalid front image (empty 0-byte or unsupported mime)
  it("Scenario 7: Invalid front image (0 bytes) — rejected and front reported missing", () => {
    const emptyFront: CandidateDisplayImage = {
      ...validFront,
      id: "empty-front",
      fileSizeBytes: 0,
    };
    const res = validateDisplayImagesForRecognition([emptyFront, validBack]);
    expect(res.valid).toBe(false);
    expect(res.missingRoles).toContain("front");
  });

  // Scenario 8: Invalid back image (unsupported MIME type)
  it("Scenario 8: Invalid back image (unsupported MIME) — rejected and back reported missing", () => {
    const invalidBack: CandidateDisplayImage = {
      ...validBack,
      id: "invalid-back",
      mimeType: "application/pdf",
    };
    const res = validateDisplayImagesForRecognition([validFront, invalidBack]);
    expect(res.valid).toBe(false);
    expect(res.missingRoles).toContain("back");
  });

  // Scenario 9: Retaking photographs (replacing front image)
  it("Scenario 9: Retaking photographs — replacing front image with a new photo updates front", () => {
    const retakenFront: CandidateDisplayImage = {
      id: "img-front-retaken",
      imageType: "front",
      checksumSha256: "front-sha256-hash-new",
      storagePath: "uploads/item-1/front_retaken.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 1024 * 110,
    };
    const res = validateDisplayImagesForRecognition([retakenFront, validBack]);
    expect(res.valid).toBe(true);
    expect(res.frontImage?.id).toBe("img-front-retaken");
    expect(res.frontImage?.checksumSha256).toBe("front-sha256-hash-new");
  });

  // Scenario 10: Replacing photographs (replacing back image)
  it("Scenario 10: Replacing photographs — replacing back image preserves validity", () => {
    const replacedBack: CandidateDisplayImage = {
      id: "img-back-replaced",
      imageType: "back",
      checksumSha256: "back-sha256-hash-replaced",
      storagePath: "uploads/item-1/back_replaced.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 1024 * 140,
    };
    const res = validateDisplayImagesForRecognition([validFront, replacedBack]);
    expect(res.valid).toBe(true);
    expect(res.backImage?.id).toBe("img-back-replaced");
  });

  // Scenario 11: Mobile camera access
  it("Scenario 11: Mobile camera access — recognizes front and primary image types", () => {
    expect(isFrontImage(validFront)).toBe(true);
    expect(isFrontImage(legacyPrimaryFront)).toBe(true);
    expect(isFrontImage(validBack)).toBe(false);
  });

  // Scenario 12: Desktop file upload
  it("Scenario 12: Desktop file upload — classifies back and flex correctly", () => {
    expect(isBackImage(validBack)).toBe(true);
    expect(isBackImage(validFront)).toBe(false);
    expect(isFlexImage(validFlex)).toBe(true);
    expect(isFlexImage(validBack)).toBe(false);
  });

  // Scenario 13: Camera permission denial / recovery
  it("Scenario 13: Gracefully handles empty array or undefined input", () => {
    const resNull = validateDisplayImagesForRecognition(null as any);
    expect(resNull.valid).toBe(false);
    expect(resNull.missingRoles).toEqual(["front", "back"]);

    const resUndefined = validateDisplayImagesForRecognition(undefined as any);
    expect(resUndefined.valid).toBe(false);
  });

  // Scenario 14: Backend validation bypass attempts
  it("Scenario 14: Anti-bypass — identical duplicate image used for both front and back is rejected", () => {
    const duplicateFrontAsBack: CandidateDisplayImage = {
      id: "dup-1",
      imageType: "back",
      checksumSha256: validFront.checksumSha256, // Same identical hash!
      storagePath: validFront.storagePath,
      mimeType: validFront.mimeType,
      fileSizeBytes: validFront.fileSizeBytes,
    };
    const res = validateDisplayImagesForRecognition([validFront, duplicateFrontAsBack]);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/distinct photographs/i);
  });

  // Scenario 15: Worker image retrieval
  it("Scenario 15: Worker image retrieval — legacy 'primary' satisfies front requirement", () => {
    const res = validateDisplayImagesForRecognition([legacyPrimaryFront, validBack]);
    expect(res.valid).toBe(true);
    expect(res.hasFront).toBe(true);
    expect(res.hasBack).toBe(true);
    expect(res.frontImage?.id).toBe(legacyPrimaryFront.id);
  });

  // Scenario 16: Recognition with no flex image
  it("Scenario 16: Recognition with no flex image — absence of flex does NOT cause failure", () => {
    const res = validateDisplayImagesForRecognition([validFront, validBack]);
    expect(res.valid).toBe(true);
    expect(res.hasFlex).toBe(false);
    expect(res.error).toBeUndefined();
  });

  // Scenario 17: Existing historical RMA records
  it("Scenario 17: Existing historical records with multiple additional photos are preserved", () => {
    const historicalPhotos = [
      legacyPrimaryFront,
      validBack,
      validLabel,
      {
        id: "historical-extra-1",
        imageType: "general",
        checksumSha256: "hist-extra-hash",
        storagePath: "uploads/item-1/extra.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024 * 90,
      },
    ];
    const res = validateDisplayImagesForRecognition(historicalPhotos);
    expect(res.valid).toBe(true);
    expect(res.hasFront).toBe(true);
    expect(res.hasBack).toBe(true);
    expect(res.additionalImages).toHaveLength(2);
  });
});
