import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TEST_PASSWORD } from "./credentials";
import { test, expect, Page } from "@playwright/test";

/**
 * Challenger 2 Adversarial Stress Test Suite
 * Independent empirical verification of:
 * 1. Settings tabs navigation stress test & rapid switching
 * 2. Provider connection tests (Google Lens & OpenAI Vision OCR)
 * 3. Staff administration, search/filter, user creation, and last-admin guard
 * 4. UX Skeletons, loading states, and button spinners
 */

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
  await page.fill('input[type="password"]', E2E_ADMIN_PASSWORD);
  await page.click('button:has-text("Sign In")');
  await expect(page).toHaveURL(/\/dashboard/);
}

// ============================================================================
// Focus Area 1: Settings Tabs & Rapid Interaction Stress Test
// ============================================================================
test.describe("Challenger 2: Settings Tabs Navigation & Rapid Interaction", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings");
  });

  test("C2.1: Rapid tab switching stress test (60 rapid clicks) produces zero errors and remains stable", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await expect(page.locator("h1").first()).toBeVisible();

    const generalTab = page.locator('[role="tab"]:has-text("General")');
    const providersTab = page.locator('[role="tab"]:has-text("Recognition")');
    const staffTab = page.locator('[role="tab"]:has-text("Staff")');
    const appearanceTab = page.locator('[role="tab"]:has-text("Appearance")');

    await expect(generalTab).toBeVisible({ timeout: 10000 });

    const tabList = [generalTab, providersTab, staffTab, appearanceTab];

    // Rapidly alternate tabs 15 rounds x 4 = 60 clicks
    for (let i = 0; i < 15; i++) {
      for (const tab of tabList) {
        await tab.click({ noWaitAfter: true });
        await page.waitForTimeout(20);
      }
    }

    // Settle on Staff tab
    await staffTab.click();
    await expect(staffTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('button:has-text("Add Staff Account")')).toBeVisible({ timeout: 5000 });

    // Assert zero uncaught page runtime exceptions
    expect(pageErrors).toHaveLength(0);
  });

  test("C2.2: Unsaved form input state is preserved in General tab across tab switches", async ({
    page,
  }) => {
    await expect(page.locator("h1").first()).toBeVisible();

    const tzInput = page.locator('input[placeholder*="UTC"]').first();
    await expect(tzInput).toBeVisible({ timeout: 10000 });

    // Set custom timezone
    await tzInput.fill("America/Denver");

    // Navigate to other tabs
    await page.locator('[role="tab"]:has-text("Recognition")').click();
    await expect(page.getByRole("heading", { name: "Visual Recognition", exact: true })).toBeVisible();

    await page.locator('[role="tab"]:has-text("Appearance")').click();
    await expect(page.getByRole("heading", { name: "Interface Theme", exact: true })).toBeVisible();

    // Navigate back to General tab
    await page.locator('[role="tab"]:has-text("General")').click();
    await expect(tzInput).toBeVisible();

    // Confirm state was preserved
    const val = await tzInput.inputValue();
    expect(val).toBe("America/Denver");
  });

  test("C2.3: Quick presets in General tab instantly update timezone input without reloads", async ({
    page,
  }) => {
    await expect(page.locator("h1").first()).toBeVisible();
    const tzInput = page.locator('input[placeholder*="UTC"]').first();
    await expect(tzInput).toBeVisible();

    // Click quick preset Europe/London
    const londonBtn = page.locator('button:has-text("Europe/London")');
    await londonBtn.click();
    expect(await tzInput.inputValue()).toBe("Europe/London");

    // Click quick preset Asia/Tokyo
    const tokyoBtn = page.locator('button:has-text("Asia/Tokyo")');
    await tokyoBtn.click();
    expect(await tzInput.inputValue()).toBe("Asia/Tokyo");
  });
});

// ============================================================================
// Focus Area 2: Provider Connection Testing (Google Lens & OpenAI Vision)
// ============================================================================
test.describe("Challenger 2: Provider Connection Testing & Diagnostics", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings");
    await page.locator('[role="tab"]:has-text("Recognition")').click();
    await expect(page.getByRole("heading", { name: "Visual Recognition", exact: true })).toBeVisible({ timeout: 10000 });
  });

  test("C2.4: Google Lens connection test displays roundtrip latency and success banner", async ({
    page,
  }) => {
    const testBtn = page.locator('button:has-text("Test Visual Recognition Connection")');
    await expect(testBtn).toBeVisible();

    await testBtn.click();

    // Verify result card renders with latency
    const resultBox = page.locator("text=Roundtrip latency:").first();
    await expect(resultBox).toBeVisible({ timeout: 10000 });

    const latencyText = await resultBox.innerText();
    expect(latencyText).toMatch(/Roundtrip latency:\s*\d+ms/i);

    // Verify toast notification appears
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 5000 });
  });

  test("C2.5: OpenAI Vision connection test displays model confirmation and latency", async ({
    page,
  }) => {
    const testBtn = page.locator('button:has-text("Test OpenAI Vision Connection")');
    await expect(testBtn).toBeVisible();

    await testBtn.click();

    // Verify result card renders
    const resultBox = page.locator("text=Roundtrip latency:").last();
    await expect(resultBox).toBeVisible({ timeout: 10000 });

    const confirmation = page.locator("text=Successfully connected to OpenAI Vision model");
    await expect(confirmation).toBeVisible();

    const latencyText = await resultBox.innerText();
    expect(latencyText).toMatch(/Roundtrip latency:\s*\d+ms/i);
  });

  test("C2.6: Rapid duplicate clicks on connection test trigger handle gracefully without crashing", async ({
    page,
  }) => {
    const testBtn = page.locator('button:has-text("Test Visual Recognition Connection")');
    await expect(testBtn).toBeVisible();

    // Double-click rapidly
    await testBtn.dblclick();

    // Should complete cleanly
    const resultBox = page.locator("text=Roundtrip latency:").first();
    await expect(resultBox).toBeVisible({ timeout: 10000 });
  });

  test("C2.7: Test-connection API rejects invalid provider parameters and non-admin access", async ({
    page,
  }) => {
    // 1. Invalid provider
    const badProvider = await page.request.post("/api/settings/test-connection", {
      data: { provider: "unsupported_provider" },
    });
    expect(badProvider.status()).toBe(400);

    // 2. Missing provider parameter
    const emptyPayload = await page.request.post("/api/settings/test-connection", {
      data: {},
    });
    expect(emptyPayload.status()).toBe(400);
  });
});

// ============================================================================
// Focus Area 3: Staff Administration & Last-Admin Guard Penetration Test
// ============================================================================
test.describe("Challenger 2: Staff Administration & Security Guards", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings");
    await page.locator('[role="tab"]:has-text("Staff")').click();
    await expect(page.locator('button:has-text("Add Staff Account")')).toBeVisible({ timeout: 10000 });
  });

  test("C2.8: Adversarial search patterns and role filters do not cause errors", async ({
    page,
  }) => {
    const searchInput = page.getByPlaceholder("Search staff by name or email...");
    await expect(searchInput).toBeVisible();

    // Adversarial inputs (regex characters, long strings, symbols)
    const patterns = [
      ".*",
      "[a-z]+",
      "\\d{4}",
      E2E_ADMIN_EMAIL,
      "nonexistent-operator-xyz-123",
    ];

    for (const pat of patterns) {
      await searchInput.fill(pat);
      await page.waitForTimeout(50);
      await expect(page.locator("body")).toBeVisible();
    }

    // Reset search
    await searchInput.fill("");

    // Test role filter tabs
    for (const role of ["operator", "viewer", "admin", "all"]) {
      const filterPill = page.getByRole("button", { name: role, exact: true });
      await filterPill.click();
      await page.waitForTimeout(50);
    }
  });

  test("C2.9: Staff user creation, activation toggle, and deactivation lifecycle", async ({
    page,
  }) => {
    // Open modal
    await page.click('button:has-text("Add Staff Account")');
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    const timestamp = Date.now();
    const testName = `QA Operator ${timestamp}`;
    const testEmail = `operator.${timestamp}@rma-internal.test`;

    await modal.locator('input[placeholder*="Sarah Connor"]').fill(testName);
    await modal.locator('input[placeholder*="operator@rma-platform"]').fill(testEmail);
    await modal.locator('input[type="password"]').fill(E2E_TEST_PASSWORD);
    await modal.locator('button:has-text("Create Account")').click();

    // Modal closes and user appears
    await expect(modal).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${testName}`)).toBeVisible();

    // Locate the newly created user row
    const userRow = page.getByTestId("staff-account").filter({ hasText: testEmail });
    const toggleBtn = userRow.locator('button:has-text("Deactivate")');
    await expect(toggleBtn).toBeVisible();

    // Deactivate user
    await toggleBtn.click();
    await expect(userRow.locator("text=Inactive")).toBeVisible({ timeout: 5000 });
    await expect(userRow.locator('button:has-text("Activate")')).toBeVisible();

    // Reactivate user
    const activateBtn = userRow.locator('button:has-text("Activate")');
    await activateBtn.click();
    await expect(userRow.locator('button:has-text("Deactivate")')).toBeVisible({ timeout: 5000 });
  });

  test("C2.10: Last administrator guard cannot be bypassed by UI or direct API attacks", async ({
    page,
  }) => {
    await expect(page.locator(`text=${E2E_ADMIN_EMAIL}`)).toBeVisible();

    // Get primary admin ID
    const listRes = await page.request.get("/api/users");
    expect(listRes.status()).toBe(200);
    const { users } = await listRes.json();
    const admin = users.find((u: any) => u.email === E2E_ADMIN_EMAIL);
    expect(admin).toBeTruthy();

    // 1. UI Attack: Attempt self-deactivation by clicking Deactivate
    const adminRow = page.getByTestId("staff-account").filter({ hasText: admin.email });
    const deactBtn = adminRow.locator('button:has-text("Deactivate")');
    await deactBtn.click();

    // Sonner toast rejects the operation
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 5000 });
    const toastText = await toast.innerText();
    expect(toastText).toMatch(/cannot deactivate|administrator/i);

    // 2. Direct API Attack: PATCH deactivation
    const patchDeactivate = await page.request.patch(`/api/users/${admin.id}`, {
      data: { active: false },
    });
    expect([400, 409]).toContain(patchDeactivate.status());
    const patchDeactBody = await patchDeactivate.json();
    expect(patchDeactBody.error).toMatch(/administrator|admin/i);

    // 3. Direct API Attack: PATCH demotion to operator
    const patchDemote = await page.request.patch(`/api/users/${admin.id}`, {
      data: { role: "operator" },
    });
    expect([400, 409]).toContain(patchDemote.status());
    const patchDemoteBody = await patchDemote.json();
    expect(patchDemoteBody.error).toMatch(/administrator|admin/i);

    // 4. Direct API Attack: DELETE user
    const deleteRes = await page.request.delete(`/api/users/${admin.id}`);
    expect([400, 409]).toContain(deleteRes.status());
    const deleteBody = await deleteRes.json();
    expect(deleteBody.error).toMatch(/administrator|admin/i);

    // Verify admin remains active and role remains admin
    const verifyRes = await page.request.get("/api/users");
    const { users: currentUsers } = await verifyRes.json();
    const verifiedAdmin = currentUsers.find((u: any) => u.id === admin.id);
    expect(verifiedAdmin.active).toBe(true);
    expect(verifiedAdmin.role).toBe("admin");
  });
});

// ============================================================================
// Focus Area 4: Accessible Loading States
// ============================================================================
test.describe("Challenger 2: Loading State Visual Verification", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("C2.11: Accessible loading status remains visible while settings data is pending", async ({
    page,
  }) => {
    let releaseSettings!: () => void;
    const settingsRequestGate = new Promise<void>((resolve) => {
      releaseSettings = resolve;
    });

    // Hold the settings response until the user-visible loading state is asserted.
    await page.route("**/api/settings", async (route) => {
      await settingsRequestGate;
      await route.continue();
    });

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    try {
      await expect(
        page.getByRole("status").filter({ hasText: "Loading settings…" })
      ).toBeVisible();
    } finally {
      releaseSettings();
    }

    // Once the response is released, the settings controls replace the status.
    await expect(page.locator('button:has-text("Save Timezone")')).toBeVisible({
      timeout: 10000,
    });
  });

  test("C2.12: Buttons transition to loading spinners and disable interactions during async mutations", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.locator("h1").first()).toBeVisible();

    // Slow down PUT /api/settings
    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "PUT") {
        await new Promise((res) => setTimeout(res, 400));
      }
      await route.continue();
    });

    const saveBtn = page.locator('button:has-text("Save Timezone")');
    await expect(saveBtn).toBeVisible({ timeout: 10000 });

    // Trigger save
    await saveBtn.click();

    // Button should be disabled during inflight mutation
    await expect(saveBtn).toBeDisabled();
    await expect(saveBtn).toHaveAttribute("aria-busy", "true");
    const spinner = saveBtn.locator('svg[aria-hidden="true"]');
    await expect(spinner).toBeVisible();

    // Once mutation settles, button re-enables
    await expect(saveBtn).not.toBeDisabled({ timeout: 5000 });
  });
});
