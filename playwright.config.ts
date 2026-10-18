import { defineConfig, devices } from "@playwright/test";

(process.env as any).NODE_ENV = "test";
process.env.LENS_PROVIDER = "mock";

const port = process.env.PLAYWRIGHT_PORT || "3000";

import fs from "fs";
import path from "path";

// Detect installed browser engines to ensure `npx playwright test` does not crash
const possibleCacheDirs = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  path.join(process.env.HOME || "", "Library/Caches/ms-playwright"),
  path.join(process.env.HOME || "", ".cache/ms-playwright"),
].filter(Boolean) as string[];

let hasFirefox = false;
let hasWebkit = false;

for (const dir of possibleCacheDirs) {
  if (fs.existsSync(dir)) {
    try {
      const files = fs.readdirSync(dir);
      if (files.some((f) => f.startsWith("firefox"))) hasFirefox = true;
      if (files.some((f) => f.startsWith("webkit"))) hasWebkit = true;
    } catch {}
  }
}

const enableAll = process.env.PLAYWRIGHT_ALL_BROWSERS === "true";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_CHROME_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL } : {}),
      },
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
        ...(process.env.PLAYWRIGHT_CHROME_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL } : {}),
      },
    },
    ...((hasFirefox || enableAll)
      ? [
          {
            name: "firefox",
            use: {
              ...devices["Desktop Firefox"],
            },
          },
        ]
      : []),
    ...((hasWebkit || enableAll)
      ? [
          {
            name: "webkit",
            use: {
              ...devices["Desktop Safari"],
            },
          },
          {
            name: "mobile-safari",
            use: {
              ...devices["iPhone 14"],
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      LENS_PROVIDER: "mock",
    },
  },
});
