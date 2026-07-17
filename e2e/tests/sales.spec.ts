import { expect, test } from "@playwright/test";

/**
 * The Sales till, in a real browser.
 *
 * This is the first screen where every package converges: the metadata engine
 * computes GST, the on-device database persists the invoice, and the design
 * system renders it. The assertion that matters is that a saved invoice
 * survives a reload — the "every write commits locally first" promise.
 *
 * A hard lesson is baked into the fresh-context fixture below: the Serwist
 * service worker precaches JS chunks, so a browser that has run an older build
 * will keep running it. Each Playwright test gets a fresh context (no SW, no
 * OPFS), which is exactly what keeps this honest.
 */

test.describe("sales", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sales");
    // The db worker compiles wasm and migrates on first use.
    await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("computes GST live through the engine", async ({ page }) => {
    await page.locator('input[id^="desc-"]').first().fill("Crocin");
    await page.locator('input[id^="qty-"]').first().fill("10");
    await page.locator('input[id^="rate-"]').first().fill("100");
    await page.locator('input[id^="gst-"]').first().fill("12");

    // 10 * 100 = 1000 taxable, 12% intra-state = CGST 60 + SGST 60 = 1120.
    await expect(page.getByTestId("grand-total")).toHaveText("₹1,120.00");
    await expect(page.getByTestId("totals")).toContainText("CGST");
    await expect(page.getByTestId("totals")).toContainText("₹60.00");
  });

  test("saves an invoice locally and it survives a reload", async ({ page }) => {
    test.slow();

    await page.locator('input[id^="desc-"]').first().fill("Dolo 650");
    await page.locator('input[id^="qty-"]').first().fill("5");
    await page.locator('input[id^="rate-"]').first().fill("40");
    await page.locator('input[id^="gst-"]').first().fill("12");

    // 5 * 40 = 200, +12% = 224.
    await expect(page.getByTestId("grand-total")).toHaveText("₹224.00");

    await page.getByTestId("save-invoice").click();

    // Appears in the list, flagged unsynced (no server transport yet).
    const list = page.getByTestId("invoice-list");
    await expect(list).toBeVisible({ timeout: 15_000 });
    const row = page.getByTestId("invoice-row").first();
    await expect(row).toContainText("₹224.00");
    await expect(row).toContainText("Unsynced");

    // The moment of truth: reload, and the locally-saved invoice is still there.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("invoice-row").first()).toContainText("₹224.00", {
      timeout: 15_000,
    });
  });

  test("shows an empty state before any sale", async ({ page }) => {
    // A fresh context has an empty OPFS database, so this is the first thing a
    // new device sees — never a blank rectangle, per the design spec.
    const hasRows = await page.getByTestId("invoice-row").count();
    if (hasRows === 0) {
      await expect(page.getByText("No invoices yet")).toBeVisible();
    }
  });
});
