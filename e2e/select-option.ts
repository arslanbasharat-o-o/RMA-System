import { expect, type Locator, type Page } from "@playwright/test";

/** Exercise the visible custom control while locating options by their stored values. */
export async function chooseOption(page: Page, native: Locator, value: string) {
  await expect(native.locator(`option[value="${value}"]`)).toHaveCount(1);
  const triggerId = (await native.getAttribute("id"))!.replace(/-native$/, "");
  await page.locator(`[id="${triggerId}"]`).click();
  await page.getByRole("listbox").locator(`[data-value="${value}"]`).click();
  await expect(native).toHaveValue(value);
}
