// Playwright must target a disposable database seeded from local environment values.
export const E2E_ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL || "admin@rma-system.local";
export const E2E_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || "";
// This fallback is restricted to disposable NODE_ENV=test databases. CI supplies a
// fresh per-run value so seeded test accounts and browser tests share credentials.
export const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "e2e-test-only-password-change-me-123";

if (!E2E_ADMIN_PASSWORD) {
  throw new Error("Set INITIAL_ADMIN_PASSWORD for isolated Playwright runs.");
}
