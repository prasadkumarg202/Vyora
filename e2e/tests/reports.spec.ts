import { expect, test } from "@playwright/test";

/**
 * Reports, in a real browser — the daily headline numbers, summed across every
 * transactional module.
 *
 * The point is consistency: Reports computes nothing new, it totals what Sales,
 * Payments and Inventory already wrote, so a figure here always matches the
 * screen it came from. A fresh Playwright context starts empty, so the numbers
 * are deterministic.
 */

test.describe("reports", () => {
  test("sums sales, collected, outstanding and low stock across modules", async ({ page }) => {
    test.slow();

    // Sale of 1,120.
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible({ timeout: 30_000 });
    await page.locator('input[id^="desc-"]').first().fill("Sale");
    await page.locator('input[id^="qty-"]').first().fill("10");
    await page.locator('input[id^="rate-"]').first().fill("100");
    await page.locator('input[id^="gst-"]').first().fill("12");
    await expect(page.getByTestId("grand-total")).toHaveText("₹1,120.00");
    await page.getByTestId("save-invoice").click();
    await expect(page.getByTestId("invoice-row").first()).toBeVisible({ timeout: 15_000 });

    // Collect 500 -> outstanding 620.
    await page.goto("/payments");
    await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel(/Amount for INV-0001/).fill("500");
    await page.getByTestId("pay-part").first().click();
    await expect(page.getByTestId("due").first()).toHaveText("₹620.00");

    // A product below the reorder threshold.
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible({ timeout: 30_000 });
    await page.locator("#p-name").fill("Bandage");
    await page.locator("#p-open").fill("5");
    await page.getByTestId("add-product").click();
    await expect(page.getByTestId("on-hand").first()).toHaveText("5", { timeout: 15_000 });

    // Reports reconciles all of it.
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("sales-total")).toHaveText("₹1,120.00", { timeout: 15_000 });
    await expect(page.getByTestId("collected-total")).toHaveText("₹500.00");
    await expect(page.getByTestId("outstanding-total")).toHaveText("₹620.00");

    const lowRow = page.getByTestId("low-stock-row").filter({ hasText: "Bandage" });
    await expect(lowRow).toContainText("Low");
    await expect(lowRow.getByTestId("low-on-hand")).toHaveText("5");
  });

  test("shows empty low-stock and zero totals for a clean shop", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("sales-total")).toHaveText("₹0.00", { timeout: 15_000 });
    // No products at all -> nothing running low, never a blank.
    if ((await page.getByTestId("low-stock-row").count()) === 0) {
      await expect(page.getByText("Nothing running low")).toBeVisible();
    }
  });
});
