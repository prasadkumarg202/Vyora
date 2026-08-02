import { expect, test } from "@playwright/test";

/**
 * GST summary, in a real browser — the monthly net across three screens.
 *
 * A sale raises output tax, a purchase raises input credit, and GST nets them.
 * Every figure is tax the engine computed and stored per document; this screen
 * only sums it. A fresh Playwright context starts empty, so the numbers are
 * deterministic and current-month by default.
 */

test.describe("gst", () => {
  test("nets output tax against input credit", async ({ page }) => {
    test.slow();

    // A sale: 10 * 100 = 1000 taxable at 12% -> output tax 120.
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible({ timeout: 30_000 });
    await page.locator('input[id^="desc-"]').first().fill("Sale item");
    await page.locator('input[id^="qty-"]').first().fill("10");
    await page.locator('input[id^="rate-"]').first().fill("100");
    await page.locator('input[id^="gst-"]').first().fill("12");
    await expect(page.getByTestId("grand-total")).toHaveText("₹1,120.00");
    await page.getByTestId("save-invoice").click();
    await expect(page.getByTestId("invoice-row").first()).toBeVisible({ timeout: 15_000 });

    // A purchase: 50 * 8 = 400 at 12% -> input tax 48.
    await page.goto("/purchase");
    await expect(page.getByRole("heading", { name: "Purchase", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.locator('input[id^="pq-"]').first().fill("50");
    await page.locator('input[id^="pr-"]').first().fill("8");
    await page.locator('input[id^="pg-"]').first().fill("12");
    await page.getByTestId("save-purchase").click();
    await expect(page.getByTestId("purchase-row").first()).toBeVisible({ timeout: 15_000 });

    // Net payable = 120 - 48 = 72.
    await page.goto("/gst");
    await expect(page.getByRole("heading", { name: "GST", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("output-tax")).toHaveText("₹120.00", { timeout: 15_000 });
    await expect(page.getByTestId("input-tax")).toHaveText("₹48.00");
    await expect(page.getByTestId("net-payable")).toHaveText("₹72.00");
    await expect(page.getByTestId("net-breakdown")).toHaveText("₹72.00");
  });

  test("shows zeroes for a period with no activity", async ({ page }) => {
    await page.goto("/gst");
    await expect(page.getByRole("heading", { name: "GST", exact: true })).toBeVisible({ timeout: 30_000 });

    // An older month with nothing recorded nets to zero, never a blank.
    const options = await page.getByTestId("period").locator("option").count();
    if (options > 1) {
      await page.getByTestId("period").selectOption({ index: options - 1 });
      await expect(page.getByTestId("net-payable")).toHaveText("₹0.00", { timeout: 10_000 });
    }
  });
});
