import { expect, test } from "@playwright/test";

/**
 * Payments, in a real browser — the Sales-to-cash loop across two screens.
 *
 * An invoice raised in Sales becomes outstanding here and settles as it is paid,
 * with the status recomputed from the running paid amount rather than trusted.
 * A fresh Playwright context starts empty, so the arithmetic is deterministic.
 */

async function raiseInvoice(page: import("@playwright/test").Page) {
  await page.goto("/sales");
  await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible({ timeout: 30_000 });
  // 10 * 100 = 1000, +12% = 1120.
  await page.locator('input[id^="desc-"]').first().fill("Medicines");
  await page.locator('input[id^="qty-"]').first().fill("10");
  await page.locator('input[id^="rate-"]').first().fill("100");
  await page.locator('input[id^="gst-"]').first().fill("12");
  await expect(page.getByTestId("grand-total")).toHaveText("₹1,120.00");
  await page.getByTestId("save-invoice").click();
  await expect(page.getByTestId("invoice-row").first()).toContainText("₹1,120.00", { timeout: 15_000 });
}

test.describe("payments", () => {
  test("a Sales invoice shows as outstanding here", async ({ page }) => {
    test.slow();
    await raiseInvoice(page);

    await page.goto("/payments");
    await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible({ timeout: 30_000 });
    const row = page.getByTestId("outstanding-row").first();
    await expect(row).toContainText("INV-0001");
    await expect(page.getByTestId("due").first()).toHaveText("₹1,120.00");
  });

  test("partial then full payment settles the invoice, and survives reload", async ({ page }) => {
    test.slow();
    await raiseInvoice(page);

    await page.goto("/payments");
    await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible({ timeout: 30_000 });

    // Pay 500 of 1120 -> partial, 620 due.
    await page.getByLabel(/Amount for INV-0001/).fill("500");
    await page.getByTestId("pay-part").first().click();
    await expect(page.getByTestId("due").first()).toHaveText("₹620.00");
    await expect(page.getByTestId("outstanding-row").first()).toContainText("Paid ₹500.00 of ₹1,120.00");

    // Pay the rest -> settled, drops out of outstanding.
    await page.getByTestId("pay-full").first().click();
    await expect(page.getByText("Nothing outstanding")).toBeVisible({ timeout: 15_000 });
    // Both payments recorded: 500 + 620 = 1120.
    await expect(page.getByTestId("payment-row")).toHaveCount(2);

    // Reload: the settled state is durable, computed from stored payments.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Nothing outstanding")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("payment-row")).toHaveCount(2);
  });
});
