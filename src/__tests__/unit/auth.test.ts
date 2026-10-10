import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("Password Hashing & Verification (Argon2id)", () => {
  it("should securely hash password and verify matching plaintext", async () => {
    const plaintext = "SuperSecretP@ssw0rd!123";
    const hash = await hashPassword(plaintext);

    expect(hash).toBeDefined();
    expect(hash.startsWith("$argon2id$") || hash.startsWith("$2a$") || hash.startsWith("$2b$")).toBe(true);

    const isMatch = await verifyPassword(plaintext, hash);
    expect(isMatch).toBe(true);
  });

  it("should fail verification for incorrect password", async () => {
    const plaintext = "CorrectPassword123";
    const hash = await hashPassword(plaintext);

    const isMatch = await verifyPassword("WrongPassword123", hash);
    expect(isMatch).toBe(false);
  });
});
