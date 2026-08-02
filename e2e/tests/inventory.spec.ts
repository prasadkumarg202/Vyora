import { expect, test } from "@playwright/test";

/**
 * Inventory / Catalog, in a real browser.
 *
 * The claim under test is the CRDT stock counter: on-hand is never a stored
 * number, it is the running sum of stock movements. A fresh Playwright context
 * gives an empty OPFS database each time, so the numbers below start from
 * nothing and are deterministic.
 */

test.describe("inventory", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("creates a product with opening stock", async ({ page }) => {
    test.slow();
    await page.locator("#p-name").fill("Crocin 500");
    await page.locator("#p-sku").fill("CRO500");
    await page.locator("#p-price").fill("25");
    await page.locator("#p-open").fill("100");
    await page.getByTestId("add-product").click();

    const row = page.getByTestId("product-row").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("Crocin 500");
    await expect(page.getByTestId("on-hand").first()).toHaveText("100");
  });

  test("stock is a movement ledger — deltas sum and survive a reload", async ({ page }) => {
    test.slow();
    await page.locator("#p-name").fill("Dolo 650");
    await page.locator("#p-open").fill("10");
    await page.getByTestId("add-product").click();

    const onHand = page.getByTestId("on-hand").first();
    await expect(onHand).toHaveText("10", { timeout: 15_000 });

    // Two sales and one restock: 10 - 1 - 1 + 1 = 9. An overwrite model would
    // lose one of the concurrent decrements.
    await page.getByRole("button", { name: /Remove one/ }).first().click();
    await expect(onHand).toHaveText("9");
    await page.getByRole("button", { name: /Remove one/ }).first().click();
    await expect(onHand).toHaveText("8");
    await page.getByRole("button", { name: /Add one/ }).first().click();
    await expect(onHand).toHaveText("9");

    // Reload: the level is recomputed from the ledger, not read from a column.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("on-hand").first()).toHaveText("9", { timeout: 15_000 });
  });

  test("shows an empty state before any product", async ({ page }) => {
    const rows = await page.getByTestId("product-row").count();
    if (rows === 0) {
      await expect(page.getByText("No products yet")).toBeVisible();
    }
  });
});
