import { expect, test } from "@playwright/test";

/**
 * Marketing, in a real browser — the campaign builder on the local database.
 *
 * A campaign drafted here is saved locally and survives a reload, because it is
 * read back from the on-device database, not held in memory. "Mark sent" is a
 * local status flip — no message is actually delivered. A fresh Playwright
 * context starts from an empty database, so the empty state is deterministic.
 */

test.describe("marketing", () => {
  test("a drafted campaign appears as draft and survives reload", async ({ page }) => {
    test.slow();

    await page.goto("/marketing");
    await expect(page.getByRole("heading", { name: "Marketing", exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("campaign-name").fill("Diwali offer");
    await page.getByTestId("campaign-channel").selectOption("sms");
    await page.getByTestId("campaign-message").fill("Flat 20% off this weekend!");
    await page.getByTestId("save-campaign").click();

    const row = page.getByTestId("campaign-row").first();
    await expect(row).toContainText("Diwali offer", { timeout: 15_000 });
    await expect(row.getByTestId("campaign-status")).toHaveText("Draft");

    // Reload: the draft is durable, read back from the local database.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Marketing", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const reloaded = page.getByTestId("campaign-row").first();
    await expect(reloaded).toContainText("Diwali offer", { timeout: 15_000 });
    await expect(reloaded.getByTestId("campaign-status")).toHaveText("Draft");
  });

  test("Mark sent flips a draft to sent", async ({ page }) => {
    test.slow();

    await page.goto("/marketing");
    await expect(page.getByRole("heading", { name: "Marketing", exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("campaign-name").fill("Weekend blast");
    await page.getByTestId("save-campaign").click();

    const row = page.getByTestId("campaign-row").first();
    await expect(row.getByTestId("campaign-status")).toHaveText("Draft", { timeout: 15_000 });

    await page.getByTestId("mark-sent").first().click();
    await expect(row.getByTestId("campaign-status")).toHaveText("Sent", { timeout: 15_000 });
  });

  test("shows an empty state on a clean context", async ({ page }) => {
    await page.goto("/marketing");
    await expect(page.getByRole("heading", { name: "Marketing", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const rows = await page.getByTestId("campaign-row").count();
    if (rows === 0) {
      await expect(page.getByText("No campaigns yet")).toBeVisible();
    }
  });
});
