import { expect, test } from "@playwright/test";

/**
 * Picking a catalogue product fills the billing line.
 *
 * Product and sale happen inside one test on purpose. The local ledger lives in
 * OPFS, which is per browser profile and therefore empty in every fresh
 * Playwright context — a product created in an earlier test would simply not
 * exist here. Creating it in-test is also the honest end-to-end shape: this is
 * what a shop does on its first day.
 *
 * The fixture tenant is a pharmacy, which declares an HSN box among its
 * optional fields. That makes the HSN assertion visible rather than something
 * only readable out of the saved row.
 */

const PRODUCT = {
  name: "Crocin Advance 500mg",
  sku: "CRO-500",
  hsn: "30049099",
  price: "48.50",
  gst: "12",
  openingQty: "40",
};

async function addProduct(page: import("@playwright/test").Page) {
  await page.goto("/products");
  await page.getByLabel("Product", { exact: true }).fill(PRODUCT.name);
  await page.getByLabel("SKU").fill(PRODUCT.sku);
  await page.getByLabel("HSN / SAC").fill(PRODUCT.hsn);
  await page.getByLabel("Price ₹").fill(PRODUCT.price);
  await page.getByLabel("GST %").fill(PRODUCT.gst);
  await page.getByLabel("Opening qty").fill(PRODUCT.openingQty);
  await page.getByTestId("add-product").click();
  await expect(page.getByText(PRODUCT.name).first()).toBeVisible({
    timeout: 15_000,
  });
}

test("choosing a product fills HSN, GST and price on the line", async ({
  page,
}) => {
  test.slow();
  await addProduct(page);

  await page.goto("/sales");
  const line = page.getByTestId("sale-line").first();

  // Three letters is how a counter actually searches.
  await line.getByLabel(/Item name/).fill("cro");

  const matches = line.getByTestId("product-matches");
  await expect(matches).toBeVisible({ timeout: 10_000 });
  // The suggestion carries the facts, so the shopkeeper can tell two similar
  // products apart before committing.
  await expect(matches).toContainText(`HSN ${PRODUCT.hsn}`);
  await expect(matches).toContainText("12% GST");

  await matches.getByRole("option").first().click();

  await expect(line.getByLabel(/Item name/)).toHaveValue(PRODUCT.name);
  await expect(line.getByLabel(/^HSN/)).toHaveValue(PRODUCT.hsn);
  await expect(line.getByLabel(/^GST/)).toHaveValue("12");
  await expect(line.getByLabel(/^Rate/)).toHaveValue("48.5");
  await expect(line.getByTestId("line-from-catalogue")).toBeVisible();
});

test("the keyboard alone can pick a product", async ({ page }) => {
  test.slow();
  await addProduct(page);

  await page.goto("/sales");
  const line = page.getByTestId("sale-line").first();
  const name = line.getByLabel(/Item name/);

  await name.fill("cro");
  await expect(line.getByTestId("product-matches")).toBeVisible({
    timeout: 10_000,
  });
  await name.press("ArrowDown");
  await name.press("Enter");

  await expect(name).toHaveValue(PRODUCT.name);
  await expect(line.getByLabel(/^GST/)).toHaveValue("12");
});

test("the filled values stay editable and never touch the product", async ({
  page,
}) => {
  test.slow();
  await addProduct(page);

  await page.goto("/sales");
  const line = page.getByTestId("sale-line").first();
  await line.getByLabel(/Item name/).fill("cro");
  await line.getByTestId("product-matches").getByRole("option").first().click();

  // A one-off rate for today's customer.
  await line.getByLabel(/^Rate/).fill("45");
  await line.getByLabel(/^GST/).fill("5");
  await expect(line.getByLabel(/^Rate/)).toHaveValue("45");

  // The catalogue is unchanged — the next bill starts from the real price.
  await page.goto("/products");
  const row = page.getByText(PRODUCT.name).first();
  await expect(row).toBeVisible();
  await expect(page.getByText("₹48.50").first()).toBeVisible();
});

test("a name that is not in the catalogue still bills", async ({ page }) => {
  await page.goto("/sales");
  const line = page.getByTestId("sale-line").first();

  await line.getByLabel(/Item name/).fill("Doorstep delivery charge");
  await expect(line.getByText(/Not in your catalogue/i)).toBeVisible({
    timeout: 10_000,
  });
  await expect(line.getByTestId("line-from-catalogue")).toHaveCount(0);

  // Free text is a first-class line, not a fallback that half-works.
  await line.getByLabel(/^Rate/).fill("60");
  await line.getByLabel(/^Qty/).fill("1");
  await expect(page.getByTestId("totals")).toBeVisible();
});

test("the saved invoice carries the HSN through to the print view", async ({
  page,
}) => {
  test.slow();
  await addProduct(page);

  await page.goto("/sales");
  const line = page.getByTestId("sale-line").first();
  await line.getByLabel(/Item name/).fill("cro");
  await line.getByTestId("product-matches").getByRole("option").first().click();

  // The pharmacy vertical's own required fields, which the picker does not and
  // should not guess: a batch number is a fact about the box on the shelf.
  await line.getByLabel(/^Batch No/).fill("B-2261");
  await line.getByLabel(/^Expiry/).fill(oneYearFromNow());
  await line.getByLabel(/^MRP/).fill("55");
  await line.getByLabel(/^Qty/).fill("2");

  await page.getByTestId("save-invoice").click();

  // The recent-invoices list links out to the printable view.
  const print = page.getByRole("link", { name: "Print" }).first();
  await expect(print).toBeVisible({ timeout: 20_000 });
  await print.click();

  // HSN on the printed tax invoice is the whole point of auto-filling it.
  await expect(page.getByText(PRODUCT.hsn)).toBeVisible({ timeout: 20_000 });
});

function oneYearFromNow(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
