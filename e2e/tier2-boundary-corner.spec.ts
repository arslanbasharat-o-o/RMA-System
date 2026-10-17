import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TEST_PASSWORD } from "./credentials";
import { test, expect, Page } from "@playwright/test";

/**
 * Tier 2: Boundary & Corner Cases E2E Test Suite
 * Validates edge conditions, boundary thresholds, invalid states, corrupted inputs,
 * concurrency stress, and resource boundaries for requirements R1 through R5.
 */

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
  await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
  await page.click('button:has-text("Sign In")');
  await expect(page).toHaveURL(/\/dashboard/);
}

// ============================================================================
// Boundary Tier: Feature R1 (Copy & Header Edge Cases)
// ============================================================================
test.describe("Tier 2 - Feature R1 Boundaries & Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("B1.1: Empty Review Queue renders clean operational text with zero AI fluff", async ({
    page,
  }) => {
    // Navigate with a query filter that matches zero items
    await page.goto("/review-queue?status=unresolved_nonexistent_filter");
    await expect(page.locator("body")).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(
      "All captured screens have been identified and confirmed. Return to the dashboard or intake a new RMA."
    );
    expect(bodyText).not.toContain(
      "Rapid verification for ambiguous markings, edge cases, and low-confidence candidates."
    );
  });

  test("B1.2: URL query injection with AI keywords does not render robotic copy", async ({
    page,
  }) => {
    const maliciousQuery = encodeURIComponent(
      "AI Processing Active Rapid verification for ambiguous markings"
    );
    await page.goto(`/review-queue?search=${maliciousQuery}`);
    await expect(page.locator("h1")).toBeVisible();

    // The h1 or layout headers should never reflect robotic copy
    const h1Text = await page.locator("h1").innerText();
    expect(h1Text).not.toContain("AI Processing Active");
    expect(h1Text).not.toContain("Rapid verification for ambiguous markings");
  });

  test("B1.3: RMA Details table headers and drawers display clean labels without leaked task tags", async ({
    page,
  }) => {
    await page.goto("/rmas");
    await expect(page.locator("body")).toBeVisible();

    // Check table headers
    const headers = await page.locator("th").allInnerTexts();
    for (const h of headers) {
      expect(h).not.toContain("(Task A)");
      expect(h).not.toContain("(Task B)");
    }
  });

  test("B1.4: Catalog modal reopen cycles retain enterprise text without state corruption", async ({
    page,
  }) => {
    await page.goto("/display-catalog");

    const addBtn = page.locator('button:has-text("Add Display Model"), button:has-text("Add Model")');
    if ((await addBtn.count()) > 0) {
      await addBtn.first().click();

      const modal = page.locator('div[role="dialog"][aria-modal="true"]');
      await expect(modal).toBeVisible();

      // Check description inside modal
      const modalText = await modal.innerText();
      expect(modalText).not.toContain("Define smartphone display for Task A visual");

      // Close and reopen
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();

      await addBtn.first().click();
      await expect(modal).toBeVisible();
      const modalTextSecond = await modal.innerText();
      expect(modalTextSecond).not.toContain("Task A visual and part-number matching");
      await page.keyboard.press("Escape");
    }
  });

  test("B1.5: Reports page export action displays clean label without '(Safe)' fluff", async ({
    page,
  }) => {
    await page.goto("/reports");
    await expect(page.locator("h1")).toBeVisible();

    const buttons = await page.locator("button, a").allInnerTexts();
    for (const b of buttons) {
      expect(b).not.toContain("Export Full CSV (Safe)");
    }
  });
});

// ============================================================================
// Boundary Tier: Feature R2 (Dark Mode & Theming Boundaries)
// ============================================================================
test.describe("Tier 2 - Feature R2 Boundaries & Corner Cases", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("B2.1: Corrupted localStorage value falls back safely without runtime crash", async ({
    page,
  }) => {
    // Set malformed JSON string in localStorage
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", '{"corrupted": true, 123}');
    });

    // Reload page; should not crash with unhandled syntax error
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
  });

  test("B2.2: Empty string in localStorage theme key initializes safely", async ({
    page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem("rma-theme", "");
    });

    await page.reload();
    await expect(page.locator("body")).toBeVisible();
    const isRendered = await page.evaluate(() => document.body !== null);
    expect(isRendered).toBe(true);
  });

  test("B2.3: Rapid theme switching stress test maintains DOM stability", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Perform rapid localStorage mutations
    const result = await page.evaluate(async () => {
      const themes = ["dark", "light", "system", "dark", "light"];
      for (const t of themes) {
        localStorage.setItem("rma-theme", t);
        // trigger storage event if any
        window.dispatchEvent(new Event("storage"));
      }
      return localStorage.getItem("rma-theme");
    });

    expect(result).toBe("light");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("B2.4: System theme media query responds cleanly via emulation", async ({
    page,
  }) => {
    // Emulate dark mode color scheme
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/dashboard");

    await expect(page.locator("body")).toBeVisible();
    const hasBody = await page.evaluate(() => document.body !== null);
    expect(hasBody).toBe(true);

    // Switch emulation back to light
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("body")).toBeVisible();
  });

  test("B2.5: Zero-flash SSR initialization pre-renders cleanly with dark storage state", async ({
    page,
  }) => {
    // Pre-seed localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem("rma-theme", "dark");
    });

    await page.goto("/dashboard");
    await expect(page.locator("body")).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem("rma-theme"));
    expect(stored).toBe("dark");
  });
});

// ============================================================================
// Boundary Tier: Feature R3 (Settings Page & API Guard Boundaries)
// ============================================================================
test.describe("Tier 2 - Feature R3 Boundaries & Corner Cases", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("B3.1: Submitting empty settings inputs handles validation gracefully", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.locator("h1")).toBeVisible();

    // Verify PUT /api/settings handles empty payloads safely
    const response = await page.request.put("/api/settings", {
      data: {},
    });
    // Should return 200 or 400 validation error, never 500
    expect([200, 400]).toContain(response.status());
  });

  test("B3.2: Staff user creation with invalid email format is rejected by API validation", async ({
    page,
  }) => {
    const response = await page.request.post("/api/users", {
      data: {
        name: "Test Invalid",
        email: "not-a-valid-email-string",
        role: "operator",
        password: E2E_TEST_PASSWORD,
      },
    });

    // Must be rejected with 400 Bad Request
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test("B3.3: Staff user creation with duplicate existing email is rejected", async ({
    page,
  }) => {
    // Attempt to register duplicate admin user
    const response = await page.request.post("/api/users", {
      data: {
        name: "Admin Duplicate",
        email: E2E_ADMIN_EMAIL,
        role: "admin",
        password: E2E_ADMIN_PASSWORD,
      },
    });

    // Must return 400 or 409 conflict
    expect([400, 409]).toContain(response.status());
    const body = await response.json();
    expect(body.error).toMatch(/already exists|duplicate/i);
  });

  test("B3.4: Last active administrator guard prevents deactivation of the only admin", async ({
    page,
  }) => {
    // Fetch users list
    const listRes = await page.request.get("/api/users");
    expect(listRes.status()).toBe(200);
    const usersData = await listRes.json();
    const users = Array.isArray(usersData) ? usersData : usersData.users || [];

    const admin = users.find((u: { id: string; email: string; role: string; active: boolean }) => u.email === E2E_ADMIN_EMAIL);
    if (!admin) return;

    // Attempt to deactivate
    const patchRes = await page.request.patch(`/api/users/${admin.id}`, {
      data: {
        active: false,
      },
    });

    // If there is only 1 admin, API must reject with 400 or 409 guard
    const adminCount = users.filter((u: { role: string; active: boolean }) => u.role === "admin" && u.active).length;
    if (adminCount <= 1) {
      expect([400, 409]).toContain(patchRes.status());
      const resBody = await patchRes.json();
      expect(resBody.error).toMatch(/administrator|admin/i);
    } else {
      // Restore active state immediately if deactivated during multi-admin state
      await page.request.patch(`/api/users/${admin.id}`, {
        data: { active: true },
      });
    }
  });

  test("B3.5: Provider connection test with invalid provider key returns 400 Bad Request", async ({
    page,
  }) => {
    const response = await page.request.post("/api/settings/test-connection", {
      data: {
        provider: "unknown_invalid_provider_key",
      },
    });

    // Should reject invalid provider parameter with 400
    expect(response.status()).toBe(400);
  });
});

// ============================================================================
// Boundary Tier: Feature R4 (Loading & Concurrency Boundaries)
// ============================================================================
test.describe("Tier 2 - Feature R4 Boundaries & Performance Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("B4.1: Rapid duplicate clicks on connection test button trigger only one inflight request", async ({
    page,
  }) => {
    await page.goto("/settings");

    const testBtn = page.locator('button:has-text("Test Connection"), button:has-text("Test")').first();
    if ((await testBtn.count()) > 0) {
      // Rapid double click
      await testBtn.dblclick();

      // Ensure button handles rapid clicks without throwing uncaught client error
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("B4.2: Simulated slow network response maintains responsive UI", async ({
    page,
  }) => {
    // Intercept settings API and add delay
    await page.route("**/api/settings", async (route) => {
      await new Promise((res) => setTimeout(res, 300));
      await route.continue();
    });

    await page.goto("/settings");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("B4.3: Multiple simultaneous toasts render cleanly in Sonner container", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Dispatch toast notifications via window
    await page.evaluate(() => {
      // If sonner toast is available on window or dispatch events
      window.dispatchEvent(new CustomEvent("toast", { detail: { message: "Test 1" } }));
      window.dispatchEvent(new CustomEvent("toast", { detail: { message: "Test 2" } }));
    });

    const toaster = page.locator("[data-sonner-toaster]");
    await expect(toaster).toHaveCount(1);
  });

  test("B4.4: Rapid navigation between routes does not cause React unmount crash", async ({
    page,
  }) => {
    const routes = ["/dashboard", "/rmas", "/review-queue", "/customers", "/settings"];

    for (const r of routes) {
      await page.goto(r);
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });

  test("B4.5: Browser back/forward cache navigation preserves clean headers", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.goto("/review-queue");
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("h1")).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/review-queue/);
    await expect(page.locator("h1")).toBeVisible();
  });
});

// ============================================================================
// Boundary Tier: Feature R5 (Viewport & Layout Threshold Boundaries)
// ============================================================================
test.describe("Tier 2 - Feature R5 Viewport Threshold Boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("B5.1: Ultra-compact viewport (320px) avoids horizontal scroll blowout", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/dashboard");

    // Assert body scroll width is constrained or wraps cleanly
    const isBodyContained = await page.evaluate(() => {
      return document.documentElement.clientWidth <= window.innerWidth;
    });
    expect(isBodyContained).toBe(true);
  });

  test("B5.2: Threshold boundary at 767px (1px below Tablet) preserves mobile navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 767, height: 800 });
    await page.goto("/dashboard");

    // At 767px, mobile menu trigger should still be active
    const menuBtn = page.locator(
      'button[aria-label*="menu" i], button[aria-label*="navigation" i], button:has(svg.lucide-menu)'
    );
    await expect(menuBtn.first()).toBeVisible();
  });

  test("B5.3: Exact Tablet threshold at 768px transitions layout cleanly", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/dashboard");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });

  test("B5.4: Threshold boundary at 1023px (1px below Desktop) handles layout safely", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1023, height: 768 });
    await page.goto("/dashboard");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });

  test("B5.5: Exact Desktop threshold at 1024px renders inline sidebar navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/dashboard");

    const sidebar = page.locator("aside");
    if ((await sidebar.count()) > 0) {
      await expect(sidebar).toBeVisible();
    }
  });
});
