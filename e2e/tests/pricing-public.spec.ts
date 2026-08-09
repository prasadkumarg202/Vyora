import { expect, test } from "@playwright/test";

/**
 * The public pricing page, signed out.
 *
 * Runs in the `public` project with an empty storage state, because the point
 * of half of these assertions is that a shop comparing us against Vyapar can
 * read the whole price list without an account. Running them signed in would
 * pass while the page was quietly gated.
 */

test.describe("public pricing page", () => {
  test("is reachable without signing in", async ({ page }) => {
    const response = await page.goto("/pricing");

    expect(response?.status()).toBe(200);
    // Middleware sends anonymous traffic to /login for everything that is not
    // explicitly public. A regression there would show up here as a redirect.
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(
      page.getByRole("heading", { name: /120 days before you pay/i }),
    ).toBeVisible();
  });

  test("shows exactly the two plans that are for sale", async ({ page }) => {
    await page.goto("/pricing");

    await expect(
      page.getByRole("heading", { name: "Vyora Pro" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Vyora Business" }),
    ).toBeVisible();

    // Basic is a wind-down state, not a tier. It must not appear as a card
    // beside the paid ones — that would read as a free plan, and there is none.
    await expect(
      page.getByRole("heading", { name: "Vyora Basic" }),
    ).toHaveCount(0);
  });

  test("the yearly/monthly switch changes the headline price", async ({
    page,
  }) => {
    await page.goto("/pricing");

    const toggle = page.getByRole("radiogroup", { name: "Billing period" });
    await expect(toggle).toBeVisible();

    await toggle.getByRole("radio", { name: /Monthly/ }).click();
    await expect(page.getByText("₹99").first()).toBeVisible();

    await toggle.getByRole("radio", { name: /Yearly/ }).click();
    // ₹899 a year is ₹74 a month — the number the incumbents advertise, so
    // ours has to be the comparable one.
    await expect(page.getByText("₹74").first()).toBeVisible();
    await expect(page.getByText("₹899 billed yearly, incl. GST")).toBeVisible();
  });

  test("states the 90 + 30 terms before anyone pays", async ({ page }) => {
    await page.goto("/pricing");

    await expect(
      page.getByText(/Before you pay anything: 120 days/i),
    ).toBeVisible();
    await expect(
      page.getByText(/90 days of the entire product/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/the workspace closes/i).first()).toBeVisible();
  });

  test("compares against all three incumbents", async ({ page }) => {
    await page.goto("/pricing");

    const table = page.locator("#versus table");
    await expect(
      table.getByRole("columnheader", { name: "Vyapar" }),
    ).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "myBillBook" }),
    ).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "Zoho Books" }),
    ).toBeVisible();

    // The claim that matters most, and the one most likely to go stale.
    await expect(table.getByText(/90 days of everything/i)).toBeVisible();
  });

  test("marks unbuilt features as roadmap rather than selling them", async ({
    page,
  }) => {
    await page.goto("/pricing");

    const matrix = page.locator("#compare");
    const row = matrix.getByRole("row", { name: /Staff roles & permissions/ });
    await expect(row.getByText("On the roadmap")).toBeVisible();
  });

  test("the landing page links here", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Pricing" }).first().click();
    await expect(page).toHaveURL(/\/pricing$/);
  });

  test("checkout refuses an anonymous caller", async ({ request }) => {
    // Needs a real Supabase project: without one the route cannot ask who is
    // calling, throws, and answers 500. That is a configuration gap, not the
    // authorisation bug this test exists to catch.
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL,
      "needs a Supabase project to distinguish anonymous from broken",
    );

    const res = await request.post("/api/billing/checkout", {
      data: { planId: "pro", cycle: "yearly" },
    });
    expect(res.status()).toBe(401);
  });

  test.describe("snapshots", () => {
    /**
     * Baselines are per-platform, and the committed ones were taken on the
     * machine they were written on. A Linux runner has no matching file, so
     * Playwright writes the actual and fails — every time, for everyone, until
     * someone commits a linux baseline.
     *
     * Run `pnpm test:e2e:update-snapshots` on a Linux runner (or in Docker) and
     * commit `*-public-linux.png` to switch these on in CI. Until then they are
     * a local check, which is where a human is looking at the page anyway.
     */
    test.skip(
      Boolean(process.env.CI),
      "no linux baselines committed yet — see the comment above",
    );

    test("pricing page, yearly", async ({ page }) => {
      await page.goto("/pricing");
      await page
        .getByRole("radiogroup", { name: "Billing period" })
        .getByRole("radio", { name: /Yearly/ })
        .click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot("pricing-yearly.png", {
        fullPage: true,
        // The footer year is the only thing on the page that moves on its own.
        mask: [page.locator("footer span").first()],
      });
    });

    test("pricing page, monthly", async ({ page }) => {
      await page.goto("/pricing");
      await page
        .getByRole("radiogroup", { name: "Billing period" })
        .getByRole("radio", { name: /Monthly/ })
        .click();
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator("section").filter({ hasText: "Vyora Pro" }).first(),
      ).toHaveScreenshot("pricing-cards-monthly.png");
    });
  });
});
