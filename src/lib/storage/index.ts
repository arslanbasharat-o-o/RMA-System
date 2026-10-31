import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

export interface StoredImageMetadata {
  storagePath: string; // Relative to storage root
  thumbnailPath: string;
  previewPath: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  width: number;
  height: number;
}

export interface StorageProvider {
  saveImage(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    folderPrefix?: string
  ): Promise<StoredImageMetadata>;
  getImageBuffer(relativePath: string): Promise<Buffer>;
  deleteImage(relativePath: string): Promise<void>;
  getAbsolutePath(relativePath: string): string;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(customPath?: string) {
    const rawPath =
      customPath ||
      process.env.STORAGE_LOCAL_PATH ||
      "data/storage";
    this.baseDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawPath);
  }

  private async ensureDir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  public getAbsolutePath(relativePath: string): string {
    // Strip leading slashes, backslashes, and directory traversal dots
    const sanitized = relativePath
      .replace(/^[\/\\]+/, "")
      .replace(/^(\.\.[\/\\])+/, "");
    const safePath = path.normalize(sanitized);
    const resolved = path.resolve(this.baseDir, safePath);
    const relative = path.relative(this.baseDir, resolved);

    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Path traversal attempt blocked: ${relativePath}`);
    }
    return resolved;
  }

  public async saveImage(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    folderPrefix = "general"
  ): Promise<StoredImageMetadata> {
    if (!buffer || buffer.length === 0) {
      throw new Error("Cannot save empty image buffer");
    }

    // Validate with Sharp before touching disk to avoid orphaned files
    const imagePipeline = sharp(buffer).rotate();
    const metadata = await imagePipeline.metadata();

    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (!width || !height) {
      throw new Error("Invalid image: unable to determine dimensions");
    }

    const checksumSha256 = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");

    // Sanitize folderPrefix against path traversal
    const cleanPrefix = folderPrefix.replace(/[^a-zA-Z0-9_\-\/]/g, "");
    const targetFolder = path.join(this.baseDir, cleanPrefix);
    await this.ensureDir(targetFolder);

    const fileId = crypto.randomUUID();
    const rawExt = path.extname(originalFilename).toLowerCase();
    const ext = [".jpg", ".jpeg", ".png", ".webp", ".heic"].includes(rawExt)
      ? rawExt
      : ".jpg";
    const baseFilename = `${fileId}${ext}`;
    const thumbFilename = `${fileId}_thumb.webp`;
    const previewFilename = `${fileId}_preview.webp`;

    const fullOriginalPath = path.join(targetFolder, baseFilename);
    const fullThumbPath = path.join(targetFolder, thumbFilename);
    const fullPreviewPath = path.join(targetFolder, previewFilename);

    try {
      // Save original buffer
      await fs.writeFile(fullOriginalPath, buffer);

      // Generate webp thumbnail (200x200 cover)
      await sharp(buffer)
        .rotate()
        .resize(200, 200, { fit: "cover", position: "centre" })
        .webp({ quality: 80 })
        .toFile(fullThumbPath);

      // Generate high-resolution webp preview (max 2560px dimension, high-fidelity)
      await sharp(buffer)
        .rotate()
        .resize(2560, 2560, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 95, effort: 6 })
        .toFile(fullPreviewPath);
    } catch (err) {
      // Clean up any partially written files on error
      await Promise.allSettled([
        fs.unlink(fullOriginalPath),
        fs.unlink(fullThumbPath),
        fs.unlink(fullPreviewPath),
      ]);
      throw err;
    }

    return {
      storagePath: path.join(cleanPrefix, baseFilename),
      thumbnailPath: path.join(cleanPrefix, thumbFilename),
      previewPath: path.join(cleanPrefix, previewFilename),
      originalFilename,
      mimeType,
      fileSizeBytes: buffer.length,
      checksumSha256,
      width,
      height,
    };
  }

  public async getImageBuffer(relativePath: string): Promise<Buffer> {
    const fullPath = this.getAbsolutePath(relativePath);
    return await fs.readFile(fullPath);
  }

  public async deleteImage(relativePath: string): Promise<void> {
    try {
      const fullPath = this.getAbsolutePath(relativePath);
      await fs.unlink(fullPath).catch(() => {});

      // If this was an original image, also clean up corresponding generated thumbnail and preview files
      const dir = path.dirname(fullPath);
      const ext = path.extname(fullPath);
      const baseName = path.basename(fullPath, ext);
      if (!baseName.endsWith("_thumb") && !baseName.endsWith("_preview")) {
        const thumbPath = path.join(dir, `${baseName}_thumb.webp`);
        const previewPath = path.join(dir, `${baseName}_preview.webp`);
        await Promise.allSettled([
          fs.unlink(thumbPath),
          fs.unlink(previewPath),
        ]);
      }
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

export const storage = new LocalStorageProvider();
