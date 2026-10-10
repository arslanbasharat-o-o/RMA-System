import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalStorageProvider } from "@/lib/storage";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("LocalStorageProvider Security & Operations", () => {
  let tempDir: string;
  let storage: LocalStorageProvider;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rma-storage-test-"));
    storage = new LocalStorageProvider(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it("should prevent directory traversal in getAbsolutePath", () => {
    // Attempt absolute root path escape
    const resolvedPath = storage.getAbsolutePath("/etc/passwd");
    // Must remain inside tempDir
    expect(resolvedPath.startsWith(tempDir)).toBe(true);

    // Attempt relative traversal escape
    const resolvedRel = storage.getAbsolutePath("../../../var/log");
    expect(resolvedRel.startsWith(tempDir)).toBe(true);

    const siblingPrefixEscape = `subdir/../../${path.basename(tempDir)}-backup/secret`;
    expect(() => storage.getAbsolutePath(siblingPrefixEscape)).toThrow(/Path traversal attempt blocked/);
  });

  it("should reject invalid/corrupt image buffers during saveImage", async () => {
    const corruptBuffer = Buffer.from("NOT_A_REAL_IMAGE_DATA_CORRUPT_BYTES");

    await expect(
      storage.saveImage(corruptBuffer, "test.jpg", "image/jpeg", "uploads")
    ).rejects.toThrow();

    // Verify no stray file remains in tempDir
    const files = await fs.readdir(tempDir);
    expect(files.length).toBe(0);
  });

  it("should successfully save and generate thumbnails for valid PNG images", async () => {
    // 1x1 transparent PNG buffer
    const validPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const result = await storage.saveImage(
      validPng,
      "pixel.png",
      "image/png",
      "displays"
    );
    expect(result.storagePath).toBeDefined();
    expect(result.thumbnailPath).toBeDefined();
    expect(result.fileSizeBytes).toBe(validPng.length);

    const fullOriginal = storage.getAbsolutePath(result.storagePath);
    const exists = await fs.stat(fullOriginal);
    expect(exists.isFile()).toBe(true);
  });
});
