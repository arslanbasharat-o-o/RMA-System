import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TEST_PASSWORD } from "./credentials";
import { test, expect, Page } from "@playwright/test";

/**
 * Tier 4: Real-World Application Scenarios E2E Test Suite
 *
 * Implements multi-step, end-to-end operational workflows defined in
 * TEST_INFRA.md § 7 reflecting real daily usage:
 * - Scenario 1: Intake Supervisor Morning Audit (Dashboard -> Queue -> RMAs)
 * - Scenario 2: Recognition Provider Health Diagnostics (Lens & Vision testing)
 * - Scenario 3: Staff Directory Administration & Last-Admin Guard Protection
 * - Scenario 4: Mobile Floor Technician Intake Inspection (Mobile drawer, theme, create RMA)
 * - Scenario 5: Enterprise Theme Persistence & Route Navigation Lifecycle
 */

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
  await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
  await page.click('button:has-text("Sign In")');
  await expect(page).toHaveURL(/\/dashboard/);
}

async function waitForSettingsTabs(page: Page) {
  const tabTrigger = page
    .locator('[role="tab"], button:has-text("General"), button:has-text("Providers")')
    .first();
  await tabTrigger.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
}

test.describe("Tier 4 - Real-World Application Scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ==========================================================================
  // Scenario 1: Intake Supervisor Morning Audit
  // ==========================================================================
  test("Scenario 1: Intake Supervisor Morning Audit Workflow", async ({
    page,
  }) => {
    // 1. Audit Dashboard
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toBeVisible();
    const dashboardH1 = await page.locator("h1").innerText();
    expect(dashboardH1).toMatch(/Dashboard/i);

    // Verify zero robotic AI subtitles on Dashboard
    const dashboardText = await page.locator("body").innerText();
    expect(dashboardText).not.toContain(
      "Live intake velocity, visual recognition analytics, and review metrics."
    );

    // 2. Audit Review Queue
    await page.goto("/review-queue");
    await expect(page).toHaveURL(/\/review-queue/);
    await expect(page.locator("h1")).toBeVisible();

    const queueText = await page.locator("body").innerText();
    expect(queueText).not.toContain(
      "Rapid verification for ambiguous markings, edge cases, and low-confidence candidates."
    );
    expect(queueText).not.toContain(
      "All captured screens have been identified and confirmed. Return to the dashboard or intake a new RMA."
    );

    // 3. Audit RMA Batch Management
    await page.goto("/rmas");
    await expect(page).toHaveURL(/\/rmas/);
    await expect(page.locator("h1")).toBeVisible();

    const rmasText = await page.locator("body").innerText();
    expect(rmasText).not.toContain(
      "Manage returned display batches, intake workflows, and verification progress."
    );
    expect(rmasText).not.toContain("(Task A)");
    expect(rmasText).not.toContain("(Task B)");

    // 4. Verify Global Header is Clean
    const header = page.locator("header");
    await expect(header).toBeVisible();
    const headerText = await header.innerText();
    expect(headerText).not.toContain("AI Processing Active");
  });

  // ==========================================================================
  // Scenario 2: Recognition Provider Health Diagnostics
  // ==========================================================================
  test("Scenario 2: Recognition Provider Health Diagnostics Workflow", async ({
    page,
  }) => {
    // 1. Navigate to Settings
    await page.goto("/settings");
    await waitForSettingsTabs(page);

    // 2. Switch to Recognition Providers Tab
    const providersTab = page.locator(
      '[role="tab"][value="providers"], [role="tab"]:has-text("Recognition"), [role="tab"]:has-text("Providers")'
    );
    if ((await providersTab.count()) > 0) {
      await providersTab.first().click();
    }

    // 3. Execute Google Lens Visual Connection Test
    const testLensBtn = page
      .locator(
        'button:has-text("Test Visual Recognition Connection"), button:has-text("Test Connection")'
      )
      .first();

    if ((await testLensBtn.count()) > 0) {
      await testLensBtn.click();

      // Verify connection feedback
      const lensToast = page.locator(
        '[data-sonner-toaster] [data-sonner-toast], text=/Successfully connected|latency|roundtrip/i'
      );
      await expect(lensToast.first()).toBeVisible({ timeout: 10000 });
    }

    // 4. Execute OpenAI Vision OCR Engine Connection Test
    const testOcrBtn = page
      .locator('button:has-text("Test OCR Connection")')
      .first();

    if ((await testOcrBtn.count()) > 0) {
      await testOcrBtn.click();

      // Verify connection feedback
      const ocrToast = page.locator(
        '[data-sonner-toaster] [data-sonner-toast], text=/Successfully connected|OpenAI|latency/i'
      );
      await expect(ocrToast.first()).toBeVisible({ timeout: 10000 });
    }

    // 5. Verify no leaked internal task names ("Task A" / "Task B")
    const pageText = await page.locator("body").innerText();
    expect(pageText).not.toContain("Task A: Google Lens Provider");
    expect(pageText).not.toContain("Task B: OpenAI Vision OCR");
  });

  // ==========================================================================
  // Scenario 3: Staff Directory Administration & Guard Verification
  // ==========================================================================
  test("Scenario 3: Staff Directory Administration & Guard Protection Workflow", async ({
    page,
  }) => {
    await page.goto("/settings");
    await waitForSettingsTabs(page);

    // 1. Select Staff & Access Tab
    const staffTab = page.locator(
      '[role="tab"][value="staff"], [role="tab"]:has-text("Staff")'
    );
    if ((await staffTab.count()) > 0) {
      await staffTab.first().click();
    }

    // Verify staff directory loaded
    await expect(page.locator("body")).toContainText(/Staff & Access|Staff/i);

    // 2. Open Add Staff Modal
    const addBtn = page.locator(
      'button:has-text("Add Staff Account"), button:has-text("Add Staff")'
    );
    if ((await addBtn.count()) > 0) {
      await addBtn.first().click();

      const modal = page.locator('div[role="dialog"]');
      await expect(modal).toBeVisible();

      // 3. Create a unique new Operator user
      const uniqueSuffix = Date.now().toString().slice(-6);
      const testName = `Operator Unit ${uniqueSuffix}`;
      const testEmail = `operator.${uniqueSuffix}@rma-system.internal`;

      await modal.locator('input[placeholder*="Connor" i]').fill(testName);
      await modal
        .locator('input[type="email"], input[placeholder*="operator@" i]')
        .fill(testEmail);
      await modal.locator('input[type="password"]').fill(E2E_TEST_PASSWORD);

      // Submit form
      await modal.locator('button[type="submit"]:has-text("Create Account")').click();

      // Expect toast confirmation
      const toast = page.locator(
        '[data-sonner-toaster] [data-sonner-toast], div[role="status"]'
      );
      await expect(toast.first()).toBeVisible({ timeout: 8000 });

      // 4. Search for newly created operator user
      const searchInput = page.locator('input[placeholder*="Search staff" i]');
      if ((await searchInput.count()) > 0) {
        await searchInput.fill(testEmail);
        await page.waitForTimeout(300);
        await expect(page.locator("body")).toContainText(testEmail);
      }
    }

    // 5. Test Last Active Administrator Security Guard via API or UI
    // Ensure the system rejects deactivating the primary admin
    const listRes = await page.request.get("/api/users");
    expect(listRes.status()).toBe(200);
    const usersData = await listRes.json();
    const users = Array.isArray(usersData) ? usersData : usersData.users || [];
    const activeAdmins = users.filter(
      (u: { role: string; active: boolean }) => u.role === "admin" && u.active
    );

    if (activeAdmins.length === 1) {
      const primaryAdmin = activeAdmins[0];
      const patchRes = await page.request.patch(`/api/users/${primaryAdmin.id}`, {
        data: { active: false },
      });
      expect([400, 409]).toContain(patchRes.status());
      const resJson = await patchRes.json();
      expect(resJson.error).toMatch(/administrator|admin/i);
    }
  });

  // ==========================================================================
  // Scenario 4: Mobile Floor Technician Intake Inspection
  // ==========================================================================
  test("Scenario 4: Mobile Floor Technician Intake Inspection Workflow", async ({
    page,
  }) => {
    // 1. Emulate Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("/dashboard");

    // 2. Open Mobile Navigation Drawer via Hamburger Trigger
    const menuBtn = page.locator(
      'button[aria-label*="menu" i], button[aria-label*="navigation" i], button:has(svg.lucide-menu)'
    );
    await expect(menuBtn.first()).toBeVisible();
    await menuBtn.first().click();

    // 3. Verify Drawer Navigation Links
    const drawer = page.locator('div[role="dialog"]');
    await expect(drawer.first()).toBeVisible();

    const createRmaLink = drawer.locator('a[href="/rmas/new"]');
    await expect(createRmaLink).toBeVisible();

    // 4. Navigate to Create RMA page via drawer
    await createRmaLink.click();
    await expect(page).toHaveURL(/\/rmas\/new/);

    // 5. Verify Create RMA Page Layout and Touch-Friendly Elements
    await expect(page.locator("h1")).toBeVisible();
    const h1Text = await page.locator("h1").innerText();
    expect(h1Text).toMatch(/RMA|Intake/i);

    // Verify viewport containment
    const isContained = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 10;
    });
    expect(isContained).toBe(true);

    // 6. Test Theme Toggle on Mobile Header
    const themeToggle = page.locator('header button[aria-label*="theme" i]');
    if ((await themeToggle.count()) > 0) {
      await themeToggle.first().click();
      const hasTheme = await page.evaluate(() =>
        localStorage.getItem("rma-theme")
      );
      expect(hasTheme).toBeTruthy();
    }
  });

  // ==========================================================================
  // Scenario 5: Enterprise Theme Persistence & Route Navigation Lifecycle
  // ==========================================================================
  test("Scenario 5: Enterprise Theme Persistence Across Route Transitions", async ({
    page,
  }) => {
    // 1. Desktop Viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // 2. Go to Settings Appearance Tab
    await page.goto("/settings");
    await waitForSettingsTabs(page);

    const appearanceTab = page.locator(
      '[role="tab"][value="appearance"], [role="tab"]:has-text("Appearance")'
    );
    if ((await appearanceTab.count()) > 0) {
      await appearanceTab.first().click();
    }

    // 3. Wait for lazy-loaded Appearance tab content and select Dark Mode
    const darkBtn = page.getByRole("button", { name: "Dark", exact: true });
    await expect(darkBtn).toBeVisible({ timeout: 10000 });
    await darkBtn.click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // 4. Navigate through multiple application routes
    const routesToVisit = [
      "/dashboard",
      "/customers",
      "/vendor-catalog",
      "/reports",
    ];

    for (const r of routesToVisit) {
      await page.goto(r);
      await expect(page.locator("h1")).toBeVisible();

      // Assert dark mode is maintained across each route
      const isStillDark = await page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      );
      expect(isStillDark).toBe(true);
    }

    // 5. Reload to verify zero-flash persistence
    await page.reload();
    const isDarkAfterReload = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(isDarkAfterReload).toBe(true);
  });
});
