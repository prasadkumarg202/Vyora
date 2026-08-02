import { expect, test } from "@playwright/test";

/**
 * CRM, in a real browser — the customer directory, offline-first.
 *
 * A fresh Playwright context starts with an empty OPFS database, so the empty
 * state is the true starting point. A customer added here is written to the
 * local `customers` table and must survive a reload, because the row is durable
 * on-device, not held in React state.
 */

test.describe("crm", () => {
  test("empty state on a clean context", async ({ page }) => {
    await page.goto("/crm");
    await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("No customers yet")).toBeVisible({ timeout: 15_000 });
  });

  test("adding a customer appears in the list and survives reload", async ({ page }) => {
    test.slow();
    await page.goto("/crm");
    await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Name").fill("Anita Desai");
    await page.getByLabel("Phone").fill("9876543210");
    await page.getByTestId("add-customer").click();

    const row = page.getByTestId("customer-row").first();
    await expect(row).toContainText("Anita Desai", { timeout: 15_000 });
    await expect(row).toContainText("9876543210");

    // Reload: the row is durable, read back from the local database.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("customer-row").first()).toContainText("Anita Desai", { timeout: 15_000 });
  });

  test("search filters the directory by name or phone", async ({ page }) => {
    test.slow();
    await page.goto("/crm");
    await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Name").fill("Ravi Kumar");
    await page.getByLabel("Phone").fill("9000000001");
    await page.getByTestId("add-customer").click();
    await expect(page.getByTestId("customer-row").first()).toContainText("Ravi Kumar", { timeout: 15_000 });

    await page.getByLabel("Name").fill("Sunita Rao");
    await page.getByLabel("Phone").fill("9000000002");
    await page.getByTestId("add-customer").click();
    await expect(page.getByTestId("customer-row")).toHaveCount(2, { timeout: 15_000 });

    // Filter by name.
    await page.getByTestId("search-customers").fill("Ravi");
    await expect(page.getByTestId("customer-row")).toHaveCount(1);
    await expect(page.getByTestId("customer-row").first()).toContainText("Ravi Kumar");

    // Filter by phone.
    await page.getByTestId("search-customers").fill("9000000002");
    await expect(page.getByTestId("customer-row")).toHaveCount(1);
    await expect(page.getByTestId("customer-row").first()).toContainText("Sunita Rao");

    // Clear: both return.
    await page.getByTestId("search-customers").fill("");
    await expect(page.getByTestId("customer-row")).toHaveCount(2);
  });
});
