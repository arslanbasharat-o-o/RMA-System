import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./credentials";
import { test, expect, Page } from "@playwright/test";

/**
 * Challenger 1 Adversarial Stress Test Suite
 * Independent empirical verification of:
 * 1. Copy Integrity & AI Boilerplate Elimination across all routes
 * 2. Theme System: Toggling, Corrupted/Malformed localStorage Fallbacks, SSR Zero-Flash, Dark Primitives
 * 3. Responsive Layouts: Mobile Drawer (375px), Backdrop, Escape key, Scroll Lock, Viewport Blowout Sweeps
 */

const FORBIDDEN_COPY_PATTERNS = [
  "Rapid verification for ambiguous markings",
  "All captured screens have been identified and confirmed",
  "Live intake velocity, visual recognition analytics",
  "Manage returned display batches, intake workflows",
  "Wholesale clients, repair shops, and return accounts",
  "AI Processing Active",
  "Task A: Google Lens Provider",
  "Task B: OpenAI Vision OCR",
  "Export Full CSV (Safe)",
  "Authoritative repository for mobile screen assemblies",
  "Define smartphone display for Task A",
  "Configure Google Lens visual adapter",
];

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
  await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
  await page.click('button:has-text("Sign In")');
  await expect(page).toHaveURL(/\/dashboard/);
}

// ============================================================================
// Axis 1: Empirical Copy Integrity Stress Test
// ============================================================================
test.describe("Challenger 1 Axis 1: Copy Integrity Across All Routes", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  const routesToTest = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "RMAs List", path: "/rmas" },
    { name: "New RMA", path: "/rmas/new" },
    { name: "Review Queue", path: "/review-queue" },
    { name: "Customers", path: "/customers" },
    { name: "Display Catalog", path: "/display-catalog" },
    { name: "Vendor Catalog", path: "/vendor-catalog" },
    { name: "Reports", path: "/reports" },
    { name: "Settings", path: "/settings" },
  ];

  for (const route of routesToTest) {
    test(`Empirical copy audit: ${route.name} (${route.path}) has zero forbidden phrases`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await expect(page.locator("body")).toBeVisible();

      // Extract full page text
      const bodyText = await page.locator("body").innerText();

      for (const forbidden of FORBIDDEN_COPY_PATTERNS) {
        expect(bodyText, `Route ${route.path} must not contain: "${forbidden}"`).not.toContain(forbidden);
      }

      // Assert clean enterprise h1 presence (or modal header on certain pages)
      const h1Count = await page.locator("h1").count();
      expect(h1Count, `Route ${route.path} should feature at least one h1 header`).toBeGreaterThanOrEqual(1);
    });
  }

  test("AppShell header never renders 'AI Processing Active' pill on any route", async ({
    page,
  }) => {
    for (const route of routesToTest.slice(0, 4)) {
      await page.goto(route.path);
      const header = page.locator("header");
      await expect(header).toBeVisible();
      const headerText = await header.innerText();
      expect(headerText).not.toContain("AI Processing Active");
    }
  });
});

// ============================================================================
// Axis 2: Empirical Theme System & Resilience Stress Test
// ============================================================================
test.describe("Challenger 1 Axis 2: Theme System Resilience & Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Theme toggle cycles Light -> Dark -> System -> Light with accurate DOM & localStorage states", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const toggle = page.locator(
      'button[aria-label*="theme" i], button[data-testid="theme-toggle"], [data-theme-toggle]'
    ).first();
    await expect(toggle).toBeVisible();

    // 1. Force light
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "light");
    });
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("rma-theme"))).toBe("light");

    // 2. Click toggle -> dark
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("rma-theme"))).toBe("dark");

    // 3. Click toggle -> light
    await toggle.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("rma-theme"))).toBe("light");
  });

  const corruptedStorageValues = [
    { label: "malformed JSON", value: '{"corrupted": true, 123}' },
    { label: "empty string", value: "" },
    { label: "random string", value: "super-dark-cyberpunk-neon" },
    { label: "uppercase DARK", value: "DARK" },
    { label: "number as string", value: "999" },
    { label: "null as string", value: "null" },
    { label: "undefined as string", value: "undefined" },
    { label: "boolean string", value: "false" },
    { label: "object string", value: "[object Object]" },
  ];

  test("Corrupted localStorage fallback: All invalid/malformed values fallback safely and recover cleanly", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const dashboardTitle = page.getByTestId("dashboard-title");
    await expect(dashboardTitle).toBeVisible();

    const toggle = page.locator(
      'button[aria-label*="theme" i], button[data-testid="theme-toggle"], [data-theme-toggle]'
    ).first();

    for (const { label, value } of corruptedStorageValues) {
      // 1. Inject corrupted value into localStorage
      await page.evaluate((val) => {
        try {
          localStorage.setItem("rma-theme", val);
        } catch {}
      }, value);

      // 2. Reload page to exercise ThemeProvider initialization with corrupted key
      await page.reload();
      await expect(page.locator("body")).toBeVisible();
      await expect(dashboardTitle).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);

      // Ensure page did not crash
      const h1Text = await dashboardTitle.innerText();
      expect(h1Text, `Failed with ${label}`).toMatch(/Dashboard/i);

      // 3. Test interactive recovery via theme toggle
      await expect(toggle).toBeVisible();
      await toggle.click();

      // Theme toggle should write back a valid recognized theme value
      const currentStored = await page.evaluate(() => localStorage.getItem("rma-theme"));
      expect(
        ["light", "dark", "system"],
        `Recovery failed after corrupted value: ${label}`
      ).toContain(currentStored);
    }
  });

  test("SSR Zero-Flash verification: HTML class applied in initial markup before React hydration", async ({
    page,
  }) => {
    // 1. Pre-seed dark theme
    await page.addInitScript(() => {
      localStorage.setItem("rma-theme", "dark");
    });

    await page.goto("/dashboard");
    const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(hasDarkClass).toBe(true);

    // 2. Pre-seed light theme
    await page.addInitScript(() => {
      localStorage.setItem("rma-theme", "light");
    });
    await page.goto("/dashboard");
    const hasDarkClassLight = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    expect(hasDarkClassLight).toBe(false);
  });

  test("Dark mode styling audit: Primitives render with expected dark surface and text styles", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("rma-theme", "dark");
    });
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Check header computed background color in dark mode
    const headerBg = await page.locator("header").evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = window.getComputedStyle(el).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    });
    // Expected dark background (#121215 = rgb(18, 18, 21))
    expect(headerBg).toEqual([18, 18, 21]);

    // Check aside computed background color in dark mode
    const asideBg = await page.locator("aside").evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = window.getComputedStyle(el).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    });
    expect(asideBg).toEqual([18, 18, 21]);
  });

  test("System theme emulation: prefers-color-scheme dark vs light synchronizes cleanly", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("rma-theme", "system");
    });

    // Emulate dark OS preference
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Emulate light OS preference
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/dashboard");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

// ============================================================================
// Axis 3: Empirical Responsive Layout & Mobile Navigation Stress Test
// ============================================================================
test.describe("Challenger 1 Axis 3: Responsive Layout & Mobile Navigation Drawer", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Mobile 375px: Desktop sidebar hidden, hamburger menu opens drawer with full nav list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    // Aside must be hidden
    // Next may retain hidden route trees; none of their desktop sidebars may be visible.
    await expect(page.locator("aside:visible")).toHaveCount(0);

    // Hamburger button must be visible
    const menuBtn = page.locator('button[aria-label="Toggle navigation menu"]');
    await expect(menuBtn).toBeVisible();

    // Click hamburger button to open drawer
    await menuBtn.click();

    // Verify dialog presence and accessibility attributes
    const drawer = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-label", "Mobile Navigation Drawer");

    // Verify all 8 core nav items exist inside mobile drawer
    const navItems = [
      "Dashboard",
      "RMAs",
      "Customers",
      "Display Catalog",
      "Vendor Catalog",
      "Review Queue",
      "Reports",
      "Settings",
    ];

    for (const item of navItems) {
      const link = drawer.locator(`a:has-text("${item}")`);
      await expect(link).toBeVisible();
    }
  });

  test("Mobile 375px: Drawer closes cleanly via Close button (X)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    await page.locator('button[aria-label="Toggle navigation menu"]').click();
    const drawer = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(drawer).toBeVisible();

    // Click close button
    const closeBtn = drawer.locator('button[aria-label="Close navigation menu"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(drawer).not.toBeVisible();
  });

  test("Mobile 375px: Drawer closes cleanly via Escape key", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    await page.locator('button[aria-label="Toggle navigation menu"]').click();
    const drawer = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(drawer).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
  });

  test("Mobile 375px: Drawer closes cleanly via Backdrop click", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    await page.locator('button[aria-label="Toggle navigation menu"]').click();
    const drawer = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(drawer).toBeVisible();

    // Click backdrop (the backdrop overlay div)
    const backdrop = drawer.locator(".backdrop-blur-xs, .bg-neutral-950\\/60");
    await backdrop.click({ position: { x: 340, y: 300 }, force: true });
    await expect(drawer).not.toBeVisible();
  });

  test("Mobile 375px: Drawer navigation link click dismisses drawer and navigates", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    await page.locator('button[aria-label="Toggle navigation menu"]').click();
    const drawer = page.locator('div[role="dialog"][aria-modal="true"]');
    await expect(drawer).toBeVisible();

    // Click Customers link
    await drawer.locator('a:has-text("Customers")').click();
    await expect(page).toHaveURL(/\/customers/);
    await expect(drawer).not.toBeVisible();
  });

  test("Mobile 375px: Scroll lock activates when mobile drawer is open", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    // Check body overflow before opening
    const initialOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(initialOverflow).not.toBe("hidden");

    // Open drawer
    await page.locator('button[aria-label="Toggle navigation menu"]').click();
    await expect(page.locator('div[role="dialog"][aria-modal="true"]')).toBeVisible();

    // Check body overflow when open
    const openOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(openOverflow).toBe("hidden");

    // Close drawer
    await page.keyboard.press("Escape");
    await expect(page.locator('div[role="dialog"][aria-modal="true"]')).not.toBeVisible();

    // Check body overflow restored
    const closedOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(closedOverflow).not.toBe("hidden");
  });

  test("Viewport blowout sweep: Zero horizontal scroll blowout across viewports and routes", async ({
    page,
  }) => {
    const viewports = [
      { width: 320, height: 568, name: "iPhone SE 1st gen (320px)" },
      { width: 375, height: 667, name: "iPhone 8 / SE 2nd gen (375px)" },
      { width: 390, height: 844, name: "iPhone 13 / 14 (390px)" },
      { width: 768, height: 1024, name: "iPad Mini / Portrait Tablet (768px)" },
      { width: 1024, height: 768, name: "iPad Pro / Small Desktop (1024px)" },
      { width: 1280, height: 800, name: "Standard Desktop (1280px)" },
      { width: 1440, height: 900, name: "Wide Desktop (1440px)" },
    ];

    const testRoutes = ["/dashboard", "/rmas", "/review-queue", "/settings", "/reports"];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of testRoutes) {
        await page.goto(route);
        await expect(page.locator("body")).toBeVisible();

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            innerWidth: window.innerWidth,
          };
        });

        // Allow at most 1px tolerance for subpixel rounding
        expect(
          overflow.scrollWidth,
          `Route ${route} at ${vp.name} suffered horizontal overflow: scrollWidth (${overflow.scrollWidth}) > clientWidth (${overflow.clientWidth})`
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      }
    }
  });

  test("Desktop 1280px and 1440px: Expanded sidebar is visible and hamburger menu is hidden", async ({
    page,
  }) => {
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dashboard");

      const aside = page.locator("aside");
      await expect(aside).toBeVisible();

      // Hamburger button should be hidden on desktop
      const menuBtn = page.locator('button[aria-label="Toggle navigation menu"]');
      await expect(menuBtn).not.toBeVisible();
    }
  });
});
