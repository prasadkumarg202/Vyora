import { expect, test } from "@playwright/test";

/**
 * Purchase, in a real browser — with the cross-module claim that matters:
 * receiving goods here increases stock in Inventory, because both read the same
 * movement ledger. A fresh Playwright context starts from an empty database, so
 * the arithmetic is deterministic.
 */

test.describe("purchase", () => {
  test("computes input GST live through the engine", async ({ page }) => {
    await page.goto("/purchase");
    await expect(page.getByRole("heading", { name: "Purchase", exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await page.locator('input[id^="pq-"]').first().fill("50");
    await page.locator('input[id^="pr-"]').first().fill("8");
    await page.locator('input[id^="pg-"]').first().fill("12");

    // 50 * 8 = 400, +12% = 448.
    await expect(page.getByTestId("grand-total")).toHaveText("₹448.00");
  });

  test("a purchase tied to a product adds to that product's stock", async ({ page }) => {
    test.slow();

    // Seed a product with opening stock 20.
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible({ timeout: 30_000 });
    await page.locator("#p-name").fill("Paracetamol");
    await page.locator("#p-open").fill("20");
    await page.getByTestId("add-product").click();
    await expect(page.getByTestId("on-hand").first()).toHaveText("20", { timeout: 15_000 });

    // Buy 50 of it.
    await page.goto("/purchase");
    await expect(page.getByRole("heading", { name: "Purchase", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.locator('select[id^="prod-"]').first().selectOption({ label: "Paracetamol" });
    await page.locator('input[id^="pq-"]').first().fill("50");
    await page.locator('input[id^="pr-"]').first().fill("8");
    await page.getByTestId("save-purchase").click();
    await expect(page.getByTestId("purchase-row").first()).toBeVisible({ timeout: 15_000 });

    // Inventory now reflects 20 + 50 = 70 — through the shared ledger, no
    // direct write from Purchase to a stock column.
    await page.goto("/inventory");
    await expect(page.getByTestId("on-hand").first()).toHaveText("70", { timeout: 15_000 });

    // And it survives a reload, because it is summed from movements.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("on-hand").first()).toHaveText("70", { timeout: 15_000 });
  });

  test("shows an empty state before any purchase", async ({ page }) => {
    await page.goto("/purchase");
    await expect(page.getByRole("heading", { name: "Purchase", exact: true })).toBeVisible({ timeout: 30_000 });
    const rows = await page.getByTestId("purchase-row").count();
    if (rows === 0) {
      await expect(page.getByText("No purchases yet")).toBeVisible();
    }
  });
});
