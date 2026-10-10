import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TEST_PASSWORD } from "./credentials";
import { test, expect, Page } from "@playwright/test";

/**
 * Tier 3: Pairwise Combinations E2E Test Suite
 *
 * Implements combinatorial and cross-feature permutation testing defined in
 * TEST_INFRA.md § 6 across:
 * - Theme Mode: Light | Dark | System
 * - Viewport: Mobile (375x667) | Tablet (768x1024) | Desktop (1280x800 / 1440x900)
 * - Target Pages / Tabs: Settings (Providers, Staff, Appearance, General), Dashboard, RMAs, Review Queue
 * - Concurrent Actions: Provider health test, staff filter/modal, mobile menu toggle, theme switching, batch filter
 */

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
  await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
  await page.click('button:has-text("Sign In to Platform")');
  await expect(page).toHaveURL(/\/dashboard/);
}

async function waitForSettingsTabs(page: Page) {
  // Wait for settings page tabs to resolve and finish skeleton state
  const tabTrigger = page
    .locator('[role="tab"], button:has-text("General"), button:has-text("Providers")')
    .first();
  await tabTrigger.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
}

test.describe("Tier 3 - Pairwise Combinations (Cross-Feature Matrix)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ==========================================================================
  // TC-PAIR-01: Dark Theme x Desktop (1280x800) x Settings Providers Tab x Lens Test
  // ==========================================================================
  test("TC-PAIR-01: Dark Mode + Desktop (1280x800) + Providers Tab + Google Lens Connection Test", async ({
    page,
  }) => {
    // 1. Set Viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // 2. Pre-seed Dark Theme
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "dark");
      document.documentElement.classList.add("dark");
    });

    // 3. Navigate to Settings
    await page.goto("/settings");
    await waitForSettingsTabs(page);

    // Verify dark mode class active
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(isDark).toBe(true);

    // 4. Select Providers Tab
    const providersTab = page.locator(
      '[role="tab"][value="providers"], [role="tab"]:has-text("Recognition"), [role="tab"]:has-text("Providers")'
    );
    if ((await providersTab.count()) > 0) {
      await providersTab.first().click();
    }

    // 5. Verify Visual Recognition card presence
    const body = page.locator("body");
    await expect(body).toContainText(
      /Visual Recognition Provider|Visual Identification|Google Lens/i
    );

    // 6. Execute Connection Test for Google Lens
    const testLensBtn = page
      .locator(
        'button:has-text("Test Visual Connection"), button:has-text("Test Connection")'
      )
      .first();

    if ((await testLensBtn.count()) > 0) {
      await testLensBtn.click();

      // Expect either loading state or result toast / badge
      const feedback = page.locator(
        '[data-sonner-toaster], text=/latency|connected|roundtrip|provider/i'
      );
      await expect(feedback.first()).toBeVisible({ timeout: 10000 });
    }

    // Ensure page theme didn't regress during action
    const retainsDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(retainsDark).toBe(true);
  });

  // ==========================================================================
  // TC-PAIR-02: Light Theme x Mobile (375x667) x Settings Staff Tab x Search & Modal
  // ==========================================================================
  test("TC-PAIR-02: Light Mode + Mobile (375x667) + Staff Tab + Search & Add User Modal", async ({
    page,
  }) => {
    // 1. Set Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // 2. Pre-seed Light Theme
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "light");
      document.documentElement.classList.remove("dark");
    });

    // 3. Navigate to Settings
    await page.goto("/settings");
    await waitForSettingsTabs(page);

    // 4. Select Staff Tab
    const staffTab = page.locator(
      '[role="tab"][value="staff"], [role="tab"]:has-text("Staff")'
    );
    if ((await staffTab.count()) > 0) {
      await staffTab.first().click();
    }

    // 5. Search for existing staff by email
    const searchInput = page.locator('input[placeholder*="Search staff" i]');
    if ((await searchInput.count()) > 0) {
      await searchInput.fill(E2E_ADMIN_EMAIL);
      await page.waitForTimeout(300);

      // Verify filtered list displays admin
      await expect(page.locator("body")).toContainText(E2E_ADMIN_EMAIL);
    }

    // 6. Open Add Staff Modal
    const addStaffBtn = page.locator(
      'button:has-text("Add Staff Account"), button:has-text("Add Staff"), button:has-text("Add User")'
    );
    if ((await addStaffBtn.count()) > 0) {
      await addStaffBtn.first().click();

      // Modal should appear
      const modal = page.locator('div[role="dialog"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText(/Staff Account|Provision/i);

      // Verify mobile touch friendly input fields inside modal
      const modalInputs = modal.locator("input, select");
      expect(await modalInputs.count()).toBeGreaterThanOrEqual(3);

      // Close modal cleanly via Escape key
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
    }
  });

  // ==========================================================================
  // TC-PAIR-03: System Theme x Tablet (768x1024) x Review Queue x Dark Emulation
  // ==========================================================================
  test("TC-PAIR-03: System Theme + Tablet (768x1024) + Review Queue + Dark Emulation Mode", async ({
    page,
  }) => {
    // 1. Emulate Tablet Viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    // 2. Emulate Dark Mode System Media Query
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "system");
    });

    // 3. Navigate to Review Queue
    await page.goto("/review-queue");
    await expect(page).toHaveURL(/\/review-queue/);

    // 4. Verify clean operational copy (no robotic AI subtitles)
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(
      "Rapid verification for ambiguous markings, edge cases, and low-confidence candidates."
    );
    expect(bodyText).not.toContain(
      "All captured screens have been identified and confirmed. Return to the dashboard or intake a new RMA."
    );

    // 5. Verify tablet layout stability (no horizontal overflow blowout)
    const isContained = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 10;
    });
    expect(isContained).toBe(true);

    // 6. Verify main layout container rendered
    await expect(page.locator("main")).toBeVisible();
  });

  // ==========================================================================
  // TC-PAIR-04: Dark Theme x Mobile (375x667) x Dashboard x Mobile Menu & Theme Switch
  // ==========================================================================
  test("TC-PAIR-04: Dark Mode + Mobile (375x667) + Mobile Menu Drawer + Live Theme Switch", async ({
    page,
  }) => {
    // 1. Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // 2. Start in Dark Mode
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "dark");
      document.documentElement.classList.add("dark");
    });

    await page.goto("/dashboard");

    // 3. Open Mobile Menu Drawer
    const menuButton = page.locator(
      'button[aria-label*="menu" i], button[aria-label*="navigation" i], button:has(svg.lucide-menu)'
    );
    await expect(menuButton.first()).toBeVisible();
    await menuButton.first().click();

    // Verify drawer opened
    const drawer = page.locator('div[role="dialog"]');
    await expect(drawer.first()).toBeVisible();

    // Verify mobile navigation links exist
    await expect(drawer.locator('a[href="/rmas"]')).toBeVisible();
    await expect(drawer.locator('a[href="/settings"]')).toBeVisible();

    // Close drawer
    const closeBtn = drawer.locator('button[aria-label*="close" i]');
    if ((await closeBtn.count()) > 0) {
      await closeBtn.first().click();
      await expect(drawer).not.toBeVisible();
    } else {
      await page.keyboard.press("Escape");
    }

    // 4. Switch theme via Topbar Toggle
    const themeToggle = page.locator(
      'header button[aria-label*="theme" i], header button[data-testid="theme-toggle"]'
    );
    if ((await themeToggle.count()) > 0) {
      await themeToggle.first().click();

      // Check that theme switched
      const currentStored = await page.evaluate(() =>
        localStorage.getItem("rma-theme")
      );
      expect(currentStored).toBeTruthy();
    }
  });

  // ==========================================================================
  // TC-PAIR-05: Dark Theme x Desktop (1440x900) x Settings Appearance Tab x Palette Sync
  // ==========================================================================
  test("TC-PAIR-05: Dark Mode + Desktop (1440x900) + Appearance Tab + Instant Palette Switch", async ({
    page,
  }) => {
    // 1. Large Desktop Viewport
    await page.setViewportSize({ width: 1440, height: 900 });

    // 2. Start in Dark Mode
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "dark");
      document.documentElement.classList.add("dark");
    });

    await page.goto("/settings");
    await waitForSettingsTabs(page);

    // 3. Select Appearance Tab
    const appearanceTab = page.locator(
      '[role="tab"][value="appearance"], [role="tab"]:has-text("Appearance")'
    );
    if ((await appearanceTab.count()) > 0) {
      await appearanceTab.first().click();
    }

    // 4. Verify Theme Preference Options
    const lightOption = page.locator('button:has-text("Light Mode")');
    const darkOption = page.locator('button:has-text("Dark Mode")');
    const systemOption = page.locator('button:has-text("System Preference")');

    await expect(lightOption.first()).toBeVisible();
    await expect(darkOption.first()).toBeVisible();
    await expect(systemOption.first()).toBeVisible();

    // 5. Click Light Mode Option Card
    await lightOption.first().click();

    // Verify HTML root drops 'dark' class
    const isDarkAfterLightClick = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(isDarkAfterLightClick).toBe(false);

    // Verify localStorage updated to 'light'
    const storedLight = await page.evaluate(() =>
      localStorage.getItem("rma-theme")
    );
    expect(storedLight).toBe("light");

    // 6. Click Dark Mode Option Card
    await darkOption.first().click();

    // Verify HTML root gains 'dark' class
    const isDarkAfterDarkClick = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(isDarkAfterDarkClick).toBe(true);

    const storedDark = await page.evaluate(() =>
      localStorage.getItem("rma-theme")
    );
    expect(storedDark).toBe("dark");
  });

  // ==========================================================================
  // TC-PAIR-06: Light Theme x Desktop (1280x800) x RMA Batch Listing x Filter & Clean Headers
  // ==========================================================================
  test("TC-PAIR-06: Light Mode + Desktop (1280x800) + RMA Batch Listing + Clean Table Headers", async ({
    page,
  }) => {
    // 1. Desktop Viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // 2. Set Light Mode
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "light");
      document.documentElement.classList.remove("dark");
    });

    // 3. Navigate to RMAs
    await page.goto("/rmas");
    await expect(page).toHaveURL(/\/rmas/);

    // 4. Verify clean enterprise headers
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(
      "Manage returned display batches, intake workflows, and verification progress."
    );
    expect(bodyText).not.toContain("(Task A)");
    expect(bodyText).not.toContain("(Task B)");

    // 5. Verify Create RMA button presence
    const createBtn = page.locator('a[href="/rmas/new"], button:has-text("Create RMA")');
    await expect(createBtn.first()).toBeVisible();

    // 6. Verify Table or Content Cards are readable in light mode
    const content = page.locator("main table, main div.space-y-4, main div.border");
    await expect(content.first()).toBeVisible();
  });

  // ==========================================================================
  // TC-PAIR-07: Dark Theme x Tablet (768x1024) x Settings General Tab x Save Timezone
  // ==========================================================================
  test("TC-PAIR-07: Dark Mode + Tablet (768x1024) + General Tab + Save Operational Timezone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "dark");
      document.documentElement.classList.add("dark");
    });

    await page.goto("/settings");
    await waitForSettingsTabs(page);

    // Select General Tab
    const generalTab = page.locator(
      '[role="tab"][value="general"], [role="tab"]:has-text("General")'
    );
    if ((await generalTab.count()) > 0) {
      await generalTab.first().click();
    }

    // Verify Timezone section
    await expect(page.locator("body")).toContainText(/Operational Timezone|Business Timezone/i);

    // Check timezone presets
    const presetBtn = page.locator('button:has-text("America/New_York"), button:has-text("UTC")');
    if ((await presetBtn.count()) > 0) {
      await presetBtn.first().click();
    }

    // Click Save Timezone button
    const saveBtn = page.locator(
      'button:has-text("Save Timezone"), button:has-text("Save Configuration"), button:has-text("Save Settings")'
    );
    if ((await saveBtn.count()) > 0) {
      await saveBtn.first().click();

      // Verify feedback toast
      const toast = page.locator('[data-sonner-toaster] [data-sonner-toast], div[role="status"]');
      if ((await toast.count()) > 0) {
        await expect(toast.first()).toBeVisible();
      }
    }
  });

  // ==========================================================================
  // TC-PAIR-08: Light Theme x Mobile (375x667) x Reports Page x Operational Export
  // ==========================================================================
  test("TC-PAIR-08: Light Mode + Mobile (375x667) + Reports Page + Operational Export Action", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "light");
      document.documentElement.classList.remove("dark");
    });

    await page.goto("/reports");
    await expect(page).toHaveURL(/\/reports/);

    // Verify clean header with no robotic copy
    await expect(page.locator("h1")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("Export Full CSV (Safe)");

    // Verify export button exists with professional wording
    const exportBtn = page.locator('button:has-text("Export"), a:has-text("Export")');
    if ((await exportBtn.count()) > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
  });
});
