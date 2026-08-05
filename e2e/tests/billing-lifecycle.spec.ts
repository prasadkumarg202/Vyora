import { expect, test } from "@playwright/test";

import { isConfigured } from "../fixtures/auth";
import {
  fixtureOrgId,
  stageFreshTrial,
  stageLocked,
  stageTrialEnding,
  stageWindDown,
} from "../fixtures/billing";

/**
 * The 120-day lifecycle, walked end to end in a real browser.
 *
 * Each stage moves the fixture workspace's stored dates and then asserts what
 * the shop actually sees. Nothing here reads the entitlement directly — the
 * assertions are the sidebar, the banner, the module body and the lock screen,
 * because those are what a shopkeeper experiences and what a refactor is most
 * likely to break quietly.
 *
 * Serial, not parallel: every test in this file mutates one shared workspace
 * row, so running them concurrently would have each one racing the others'
 * time travel.
 */

test.describe.configure({ mode: "serial" });

let orgId: string;

test.beforeAll(async () => {
  test.skip(!isConfigured, "needs apps/web/.env.local with a Supabase project");
  orgId = await fixtureOrgId();
});

test.afterAll(async () => {
  // Leave the fixture usable for whatever runs next, including a human.
  if (orgId) await stageFreshTrial(orgId);
});

test.describe("day 1 — the whole product", () => {
  test.beforeEach(async () => {
    await stageFreshTrial(orgId);
  });

  test("no banner, nothing locked", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByTestId("trial-banner")).toHaveCount(0);
    await expect(
      page.locator("nav[aria-label='Main']").getByText("Needs a paid plan"),
    ).toHaveCount(0);
  });

  test("a premium module opens normally", async ({ page }) => {
    await page.goto("/voice-bill");

    await expect(
      page.getByRole("heading", { name: "Voice Billing", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "See plans" })).toHaveCount(
      0,
    );
  });
});

test.describe("day 60 — the warning", () => {
  test("the banner counts down and can be put off for a day", async ({
    page,
  }) => {
    await stageTrialEnding(orgId, 5);
    await page.goto("/dashboard");

    const banner = page.getByTestId("trial-banner");
    await expect(banner).toHaveAttribute("data-phase", "trial");
    await expect(banner).toContainText("5 days left in your free trial");
    await expect(banner).toContainText("workspace closes");

    // Dismissal is a courtesy during the trial, and only during the trial.
    await banner.getByRole("button", { name: "Later" }).click();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("trial-banner")).toHaveCount(0);
  });

  test("everything still works while the banner is showing", async ({
    page,
  }) => {
    await stageTrialEnding(orgId, 5);
    await page.goto("/voice-bill");

    await expect(
      page.getByRole("heading", { name: "Voice Billing", level: 1 }),
    ).toBeVisible();
  });
});

test.describe("day 91 — the wind-down", () => {
  test.beforeEach(async () => {
    await stageWindDown(orgId, 1);
  });

  test("billing, stock and reports keep working", async ({ page }) => {
    for (const [route, heading] of [
      ["/sales", /Sales/],
      ["/inventory", /Inventory/],
      ["/reports-hub", /Report/],
    ] as const) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toContainText(heading);
    }
  });

  test("the premium surface shows the upgrade prompt instead", async ({
    page,
  }) => {
    await page.goto("/voice-bill");

    await expect(page.getByText("Vyora Pro").first()).toBeVisible();
    await expect(
      page.getByText(/Your current plan does not include/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "See plans" })).toBeVisible();
  });

  test("the sidebar marks what is locked without hiding it", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const nav = page.locator("nav[aria-label='Main']");
    // Still navigable — a module that vanishes reads as a broken app.
    await expect(
      nav.getByRole("link", { name: /Voice Billing/ }),
    ).toBeVisible();
    await expect(nav.getByText("Needs a paid plan").first()).toBeVisible();
    // Free-forever modules keep no lock.
    const sales = nav.getByRole("link", { name: /^Sales/ });
    await expect(sales.getByText("Needs a paid plan")).toHaveCount(0);
  });

  test("the countdown cannot be dismissed", async ({ page }) => {
    await page.goto("/dashboard");

    const banner = page.getByTestId("trial-banner");
    await expect(banner).toHaveAttribute("data-phase", "wind_down");
    await expect(banner).toContainText(/This workspace closes in \d+ days/);
    await expect(banner.getByRole("button", { name: "Later" })).toHaveCount(0);
  });

  test("the AI endpoint refuses a caller without the plan", async ({
    request,
  }) => {
    // The screen is gated, but the endpoint is what costs us provider credit —
    // so it has to refuse on its own, not because a screen did not render.
    const res = await request.post("/api/ai", {
      data: { question: "how were sales this month?" },
    });
    expect(res.status()).toBe(402);
    expect((await res.json()).error).toBe("upgrade_required");
  });

  test("snapshot — upgrade gate", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "one baseline is enough");
    await page.goto("/voice-bill");
    await expect(page.locator("main")).toHaveScreenshot("upgrade-gate.png");
  });
});

test.describe("day 121 — closed", () => {
  test.beforeEach(async () => {
    await stageLocked(orgId);
  });

  test("the app shell is replaced by the lock screen", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: /free period has ended/i }),
    ).toBeVisible();
    // No sidebar, no module, nothing to navigate to.
    await expect(page.locator("nav[aria-label='Main']")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toHaveCount(0);
  });

  test("no route gets around it", async ({ page }) => {
    for (const route of ["/sales", "/reports-hub", "/inventory", "/settings"]) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { name: /free period has ended/i }),
      ).toBeVisible();
    }
  });

  test("the shop can still take its data out", async ({ page }) => {
    await page.goto("/dashboard");

    const download = page.getByRole("button", { name: "Download all my data" });
    await expect(download).toBeVisible();

    const [file] = await Promise.all([
      page.waitForEvent("download"),
      download.click(),
    ]);
    expect(file.suggestedFilename()).toMatch(/\.json$/);

    // Not an empty shell of a file: a locked workspace must hand back the real
    // ledger, because that ledger is the shop's own GST record.
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const backup = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      counts?: Record<string, number>;
    };
    expect(backup.counts).toBeTruthy();
  });

  test("the plans are on the same screen as the export", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: "Vyora Pro" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Choose Vyora Pro|Upgrade to Vyora Pro/,
      }),
    ).toBeVisible();
  });

  test("snapshot — locked workspace", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "one baseline is enough");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("workspace-locked.png", {
      fullPage: true,
    });
  });
});
