import { expect, test } from "@playwright/test";

import { isConfigured } from "../fixtures/auth";
import {
  clearBillingHistory,
  countEvents,
  fixtureOrgId,
  readBilling,
  readReceipts,
  stageFreshTrial,
  stageWindDown,
} from "../fixtures/billing";

/**
 * The money path, against the mock provider.
 *
 * The mock is not a shortcut around the real flow — it creates an order, signs
 * a webhook with the same HMAC-SHA256 the live gateway uses and delivers it to
 * our own endpoint. So these tests exercise the code that will run with real
 * Razorpay keys, which is the only reason a mock is worth having.
 *
 * Three of them exist specifically to fail if someone ever makes the browser
 * the authority on whether a payment happened.
 */

test.describe.configure({ mode: "serial" });

let orgId: string;

test.beforeAll(async () => {
  test.skip(!isConfigured, "needs apps/web/.env.local with a Supabase project");
  orgId = await fixtureOrgId();
});

test.afterAll(async () => {
  if (orgId) {
    await clearBillingHistory(orgId);
    await stageFreshTrial(orgId);
  }
});

test("a wound-down workspace can buy Pro and get everything back", async ({
  page,
}) => {
  test.slow();
  await clearBillingHistory(orgId);
  await stageWindDown(orgId, 2);

  await page.goto("/subscriptions");
  await expect(page.getByTestId("plan-status")).toHaveAttribute(
    "data-status",
    "winding_down",
  );

  await page
    .getByRole("radiogroup", { name: "Billing period" })
    .getByRole("radio", { name: /Yearly/ })
    .click();
  await page.getByRole("button", { name: /Vyora Pro/ }).click();

  // The button never tells the server anything succeeded — it refreshes and
  // waits for the webhook's effect to appear. If the plan shows up here, the
  // whole server-side chain ran.
  const status = page.getByTestId("plan-status");
  await expect(status).toHaveAttribute("data-status", "active", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("current-plan")).toHaveText("Vyora Pro");

  const billing = await readBilling(orgId);
  expect(billing.plan_id).toBe("pro");
  expect(billing.plan_status).toBe("active");
  expect(billing.plan_cycle).toBe("yearly");

  // And the surface that was locked two minutes ago now opens.
  await page.goto("/voice-bill");
  await expect(
    page.getByRole("heading", { name: "Voice Billing", level: 1 }),
  ).toBeVisible();
});

test("the receipt splits GST so it adds up exactly", async () => {
  const receipts = await readReceipts(orgId);
  expect(receipts.length).toBeGreaterThan(0);

  const receipt = receipts[0]!;
  expect(receipt.plan_id).toBe("pro");
  expect(receipt.cycle).toBe("yearly");
  expect(receipt.total_paise).toBe(89_900);
  // ₹899 inclusive of 18% is ₹761.86 + ₹137.14.
  expect(receipt.base_paise).toBe(76_186);
  expect(receipt.tax_paise).toBe(13_714);
  expect(receipt.base_paise + receipt.tax_paise).toBe(receipt.total_paise);
  expect(receipt.number).toMatch(/^VYORA\/\d{4}-\d{2}\/\d{6}$/);
});

test("the receipt is visible to the shop", async ({ page }) => {
  await page.goto("/subscriptions");

  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByText(/^VYORA\//)).toBeVisible();
  await expect(table.getByText("₹899")).toBeVisible();
});

test("a redelivered webhook does not charge or extend twice", async ({
  request,
}) => {
  const before = await readReceipts(orgId);
  const eventsBefore = await countEvents(orgId);

  // Same payload, same event id — exactly what Razorpay does when our 200 is
  // slow to arrive. Without the unique index this doubles the subscription.
  const res = await request.post("/api/billing/simulate", {
    data: { planId: "pro", cycle: "yearly" },
  });
  expect(res.ok()).toBeTruthy();

  expect(await readReceipts(orgId)).toHaveLength(before.length);
  expect(await countEvents(orgId)).toBe(eventsBefore);
});

test("an unsigned webhook changes nothing", async ({ request }) => {
  await clearBillingHistory(orgId);
  await stageWindDown(orgId, 2);

  const res = await request.post("/api/billing/webhook", {
    headers: { "x-razorpay-signature": "0".repeat(64) },
    data: {
      id: "evt_forged_1",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_forged",
            amount: 100,
            notes: { org_id: orgId, plan_id: "business", cycle: "yearly" },
          },
        },
      },
    },
  });

  expect(res.status()).toBe(401);

  // The real assertion: nothing moved.
  const billing = await readBilling(orgId);
  expect(billing.plan_id).toBe("free");
  expect(billing.plan_status).toBe("trialing");
  expect(await readReceipts(orgId)).toHaveLength(0);
});

test("checkout will not price a plan from the request body", async ({
  request,
}) => {
  // A client that could name its own amount could buy Business for ₹1. The
  // route takes a plan id and reads the price from the catalogue; anything
  // else in the body is ignored.
  const res = await request.post("/api/billing/checkout", {
    data: {
      planId: "business",
      cycle: "yearly",
      amountPaise: 100,
      amount: 100,
    },
  });

  expect(res.ok()).toBeTruthy();
  const order = (await res.json()) as {
    amountPaise: number;
    catalogueAmountPaise: number;
  };
  expect(order.amountPaise).toBe(159_900);
  expect(order.catalogueAmountPaise).toBe(159_900);
});

test("checkout rejects a plan that is not for sale", async ({ request }) => {
  for (const body of [
    { planId: "free", cycle: "yearly" },
    { planId: "enterprise", cycle: "yearly" },
    { planId: "pro", cycle: "weekly" },
  ]) {
    const res = await request.post("/api/billing/checkout", { data: body });
    expect(res.status(), JSON.stringify(body)).toBe(400);
  }
});

test("snapshot — subscription screen on a paid plan", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "one baseline is enough");

  await clearBillingHistory(orgId);
  await stageWindDown(orgId, 2);
  await page.goto("/subscriptions");
  await page
    .getByRole("radiogroup", { name: "Billing period" })
    .getByRole("radio", { name: /Yearly/ })
    .click();
  await page.getByRole("button", { name: /Vyora Pro/ }).click();
  await expect(page.getByTestId("plan-status")).toHaveAttribute(
    "data-status",
    "active",
    { timeout: 30_000 },
  );

  await expect(page.locator("main")).toHaveScreenshot("subscription-paid.png", {
    // The renewal date and the receipt date are both "today + n", so they move
    // with the calendar. Everything else on the screen is fixed.
    mask: [page.getByRole("table").locator("td:nth-child(2)")],
    maxDiffPixelRatio: 0.02,
  });
});
