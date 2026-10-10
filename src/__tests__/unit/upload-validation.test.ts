import { describe, it, expect } from "vitest";
import { validateImageMagicBytes } from "@/lib/storage/validation";

describe("Upload Image Magic Bytes Validation", () => {
  it("should detect valid JPEG magic bytes", () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = validateImageMagicBytes(jpegHeader);
    expect(result.valid).toBe(true);
    expect(result.detectedFormat).toBe("jpeg");
  });

  it("should detect valid PNG magic bytes", () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = validateImageMagicBytes(pngHeader);
    expect(result.valid).toBe(true);
    expect(result.detectedFormat).toBe("png");
  });

  it("should detect valid WebP magic bytes", () => {
    // RIFF....WEBP
    const webpHeader = Buffer.from("RIFFxxxxWEBPVP8 ");
    const result = validateImageMagicBytes(webpHeader);
    expect(result.valid).toBe(true);
    expect(result.detectedFormat).toBe("webp");
  });

  it("should reject corrupted/executable/script files masquerading as images", () => {
    const bashScript = Buffer.from("#!/bin/bash\necho hacked");
    expect(validateImageMagicBytes(bashScript).valid).toBe(false);

    const phpPayload = Buffer.from("<?php system($_GET['cmd']); ?>");
    expect(validateImageMagicBytes(phpPayload).valid).toBe(false);

    const empty = Buffer.alloc(0);
    expect(validateImageMagicBytes(empty).valid).toBe(false);

    const tiny = Buffer.from([0xff, 0xd8]);
    expect(validateImageMagicBytes(tiny).valid).toBe(false);
  });
});
