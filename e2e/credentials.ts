import { randomBytes } from "node:crypto";

// Playwright must target a disposable database seeded from local environment values.
export const E2E_ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL || "admin@rma-system.local";
export const E2E_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || "";
export const E2E_TEST_PASSWORD = randomBytes(32).toString("base64url");

if (!E2E_ADMIN_PASSWORD) {
  throw new Error("Set INITIAL_ADMIN_PASSWORD for isolated Playwright runs.");
}
