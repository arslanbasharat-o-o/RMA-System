import argon2 from "argon2";
import bcrypt from "bcryptjs";

/**
 * Hashes a plaintext password using Argon2id with automatic bcrypt fallback.
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  } catch (error) {
    console.warn("Argon2 hashing fallback to bcrypt:", error);
    return await bcrypt.hash(password, 12);
  }
}

/**
 * Verifies a plaintext password against an Argon2id or bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    if (hash.startsWith("$argon2")) {
      return await argon2.verify(hash, password);
    }
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}
