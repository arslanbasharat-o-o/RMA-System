import { defineConfig } from "vitest/config";
import path from "path";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Ignore if file does not exist
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 20000,
    include: ["src/__tests__/**/*.test.ts"],
    exclude: ["node_modules", "e2e/**"],
    env: {
      NODE_ENV: "test",
      LENS_PROVIDER: "mock",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
