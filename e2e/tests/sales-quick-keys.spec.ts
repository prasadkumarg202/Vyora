import { expect, test, type Page } from "@playwright/test";

/**
 * Till shortcuts for the items a shop bills all day.
 *
 * Everything happens in one browser context per test because the catalogue and
 * the saved key order both live in local SQLite/OPFS, which is empty in every
 * fresh Playwright profile.
 *
 * The assertion that matters most is the last one: a digit typed into a
 * quantity box must stay a digit. Bare number keys are the right shortcut at a
 * counter, and they are also one careless listener away from silently adding
 * an item to somebody's bill.
 */

const ITEMS = [
  { name: "Sugar 1kg", price: "45", gst: "5", hsn: "17019910" },
  { name: "Rice 5kg", price: "310", gst: "5", hsn: "10063020" },
  { name: "Salt 1kg", price: "22", gst: "5", hsn: "25010020" },
  { name: "Wheat Atta 5kg", price: "245", gst: "5", hsn: "11010000" },
];

async function addItems(page: Page) {
  await page.goto("/products");
  for (const item of ITEMS) {
    await page.getByLabel("Product", { exact: true }).fill(item.name);
    await page.getByLabel("HSN / SAC").fill(item.hsn);
    await page.getByLabel("Price ₹").fill(item.price);
    await page.getByLabel("GST %").fill(item.gst);
    await page.getByTestId("add-product").click();
    await expect(page.getByText(item.name).first()).toBeVisible({
      timeout: 15_000,
    });
  }
}

/** The row is derived, so read the order off the screen rather than guessing. */
async function keyLabels(page: Page): Promise<string[]> {
  const tiles = page.getByTestId("quick-key");
  await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
  return (await tiles.allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
}

test("a new shop gets shortcuts suggested from its own catalogue", async ({
  page,
}) => {
  test.slow();
  await addItems(page);
  await page.goto("/sales");

  await expect(page.getByTestId("quick-keys")).toBeVisible({ timeout: 15_000 });
  const labels = await keyLabels(page);

  // All four registered items are offered, and nothing we invented for
  // "grocery" that this shop never registered.
  for (const item of ITEMS) {
    expect(labels.join(" | ")).toContain(item.name);
  }
  await expect(page.getByText(/suggested from your catalogue/i)).toBeVisible();
});

test("tapping a key bills that item", async ({ page }) => {
  test.slow();
  await addItems(page);
  await page.goto("/sales");

  const sugar = page.getByTestId("quick-key").filter({ hasText: "Sugar 1kg" });
  await sugar.click();

  const line = page.getByTestId("sale-line").first();
  await expect(line.getByLabel(/Item name/)).toHaveValue("Sugar 1kg");
  await expect(line.getByLabel(/^Rate/)).toHaveValue("45");
  await expect(line.getByLabel(/^GST/)).toHaveValue("5");
  await expect(line.getByTestId("line-from-catalogue")).toBeVisible();
});

test("the number key adds the item it is showing", async ({ page }) => {
  test.slow();
  await addItems(page);
  await page.goto("/sales");

  const labels = await keyLabels(page);
  const index = labels.findIndex((l) => l.includes("Rice 5kg"));
  expect(index).toBeGreaterThanOrEqual(0);

  // Focus somewhere that is not a field, the way a cashier's hands rest
  // between customers.
  await page.getByRole("heading", { name: "Sales", level: 1 }).click();
  await page.keyboard.press(String(index + 1));

  const line = page.getByTestId("sale-line").first();
  await expect(line.getByLabel(/Item name/)).toHaveValue("Rice 5kg");
});

test("pressing two keys bills two lines, not three", async ({ page }) => {
  test.slow();
  await addItems(page);
  await page.goto("/sales");

  await page.getByTestId("quick-key").filter({ hasText: "Sugar 1kg" }).click();
  await page.getByTestId("quick-key").filter({ hasText: "Salt 1kg" }).click();

  // The empty starting line is reused by the first press, not left dangling.
  await expect(page.getByTestId("sale-line")).toHaveCount(2);
  await expect(
    page
      .getByTestId("sale-line")
      .nth(1)
      .getByLabel(/Item name/),
  ).toHaveValue("Salt 1kg");
});

test("a digit typed into a field never adds an item", async ({ page }) => {
  test.slow();
  await addItems(page);
  await page.goto("/sales");

  await page.getByTestId("quick-key").first().click();
  const line = page.getByTestId("sale-line").first();

  await line.getByLabel(/^Qty/).fill("");
  await line.getByLabel(/^Qty/).pressSequentially("3");
  await expect(line.getByLabel(/^Qty/)).toHaveValue("3");

  // Still one line. If the shortcut listener ever stops checking what has
  // focus, this is where it shows up — before a customer finds it.
  await expect(page.getByTestId("sale-line")).toHaveCount(1);
});

test("the shop can fix its own order, and it sticks", async ({ page }) => {
  test.slow();
  await addItems(page);
  await page.goto("/sales");

  await page.getByTestId("edit-quick-keys").click();

  // Drop everything except salt, so the assertion cannot pass by accident.
  for (const item of ITEMS) {
    if (item.name === "Salt 1kg") continue;
    await page.getByRole("button", { name: `Remove ${item.name}` }).click();
  }
  await page.getByTestId("save-quick-keys").click();

  await expect(page.getByTestId("quick-key")).toHaveCount(1);
  await expect(page.getByTestId("quick-key").first()).toContainText("Salt 1kg");
  // No longer derived — the shop has said what it wants.
  await expect(page.getByText(/suggested from your catalogue/i)).toHaveCount(0);

  // The choice is a preference in the local ledger, so it survives a reload.
  await page.reload();
  await expect(page.getByTestId("quick-key")).toHaveCount(1);
  await expect(page.getByTestId("quick-key").first()).toContainText("Salt 1kg");
});
