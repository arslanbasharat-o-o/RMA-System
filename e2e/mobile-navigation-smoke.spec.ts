import { test, expect } from "@playwright/test";
import { E2E_TEST_PASSWORD } from "./credentials";

test("mobile navigation opens and routes to Customers", async ({ page }) => {
  if ((page.viewportSize()?.width ?? 1024) >= 768) test.skip();
  await page.goto("/login");
  await page.fill('input[type="email"]', "operator@rma-system.internal");
  await page.fill('input[type="password"]', E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/dashboard/, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Operations Dashboard");

  const toggle = page.getByRole("button", { name: "Toggle navigation menu" });
  const drawer = page.getByRole("dialog", { name: "Mobile Navigation Drawer" });
  await expect(toggle).toBeVisible();
  if (!(await drawer.isVisible())) {
    await toggle.click();
    try {
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
    } catch {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 5000 });
    }
  }
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Customers", exact: true }).click();
  await page.waitForURL(/\/customers/, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Customer Directory");
});
