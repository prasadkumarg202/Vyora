import { FIXTURE_EMAIL, admin, findUser } from "./auth";

/**
 * Time travel for the billing lifecycle.
 *
 * The trial, the wind-down and the lock are all derived on the *server* from
 * `organizations.trial_ends_at`, so mocking the browser clock proves nothing —
 * `page.clock` would move the calendar in the tab while the entitlement is
 * still computed in a route handler against the real one.
 *
 * So these helpers move the stored dates instead, with the service-role key,
 * and let the real resolver draw its own conclusions. That is the point: the
 * tests exercise the same code path a workspace hits on day 121, rather than a
 * test-only branch that exists to be tested.
 */

export interface BillingRow {
  plan_id: "free" | "pro" | "business";
  plan_status:
    | "trialing"
    | "active"
    | "past_due"
    | "cancelled"
    | "expired"
    | "locked";
  plan_cycle: "monthly" | "yearly" | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

const DAY_MS = 86_400_000;

export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/** The fixture tenant's workspace id, resolved once per spec file. */
export async function fixtureOrgId(): Promise<string> {
  const user = await findUser(FIXTURE_EMAIL);
  if (!user) {
    throw new Error(
      `fixture user ${FIXTURE_EMAIL} does not exist — run the setup project first`,
    );
  }

  const res = await admin(
    `/rest/v1/org_members?user_id=eq.${user.id}&select=org_id&limit=1`,
  );
  const rows = (await res.json()) as { org_id?: string }[];
  const orgId = rows[0]?.org_id;
  if (!orgId) {
    throw new Error(
      "fixture user has no workspace — run the setup project first",
    );
  }
  return orgId;
}

async function patchOrg(
  orgId: string,
  patch: Partial<BillingRow>,
): Promise<void> {
  const res = await admin(`/rest/v1/organizations?id=eq.${orgId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(
      `could not move the workspace's billing state: ${res.status} ${await res.text()}`,
    );
  }
}

export async function readBilling(orgId: string): Promise<BillingRow> {
  const res = await admin(
    `/rest/v1/organizations?id=eq.${orgId}&select=plan_id,plan_status,plan_cycle,trial_ends_at,current_period_end`,
  );
  const rows = (await res.json()) as BillingRow[];
  if (!rows[0]) throw new Error(`no organization ${orgId}`);
  return rows[0];
}

/**
 * Day 1 of the trial: everything unlocked, no banner.
 *
 * Every stage helper writes the whole billing shape rather than just the field
 * it cares about, so a spec cannot inherit a stray `plan_id: "pro"` from
 * whatever ran before it and pass for the wrong reason.
 */
export async function stageFreshTrial(orgId: string): Promise<void> {
  await patchOrg(orgId, {
    plan_id: "free",
    plan_status: "trialing",
    plan_cycle: null,
    trial_ends_at: daysFromNow(89),
    current_period_end: null,
  });
}

/** Inside the last 30 days of the trial: the banner appears, dismissible. */
export async function stageTrialEnding(
  orgId: string,
  daysLeft = 5,
): Promise<void> {
  await patchOrg(orgId, {
    plan_id: "free",
    plan_status: "trialing",
    plan_cycle: null,
    // Half a day past the boundary, so `Math.ceil` cannot land on daysLeft ± 1
    // and make the banner's copy flaky.
    trial_ends_at: daysFromNow(daysLeft - 0.5),
    current_period_end: null,
  });
}

/** Past day 90: basics only, counting down to the close. */
export async function stageWindDown(
  orgId: string,
  daysUsed = 1,
): Promise<void> {
  await patchOrg(orgId, {
    plan_id: "free",
    plan_status: "trialing",
    plan_cycle: null,
    trial_ends_at: daysFromNow(-daysUsed - 0.5),
    current_period_end: null,
  });
}

/** Past day 120: the workspace is closed. */
export async function stageLocked(orgId: string): Promise<void> {
  await patchOrg(orgId, {
    plan_id: "free",
    plan_status: "trialing",
    plan_cycle: null,
    trial_ends_at: daysFromNow(-31),
    current_period_end: null,
  });
}

/** A paying workspace, mid-period. */
export async function stagePaid(
  orgId: string,
  plan: "pro" | "business" = "pro",
  cycle: "monthly" | "yearly" = "yearly",
): Promise<void> {
  await patchOrg(orgId, {
    plan_id: plan,
    plan_status: "active",
    plan_cycle: cycle,
    trial_ends_at: daysFromNow(-200),
    current_period_end: daysFromNow(cycle === "yearly" ? 300 : 20),
  });
}

/** Removes everything the checkout specs write, so a re-run starts clean. */
export async function clearBillingHistory(orgId: string): Promise<void> {
  for (const table of [
    "billing_invoices",
    "billing_subscriptions",
    "billing_events",
  ]) {
    await admin(`/rest/v1/${table}?org_id=eq.${orgId}`, { method: "DELETE" });
  }
}

export interface Receipt {
  number: string;
  base_paise: number;
  tax_paise: number;
  total_paise: number;
  plan_id: string;
  cycle: string;
}

export async function readReceipts(orgId: string): Promise<Receipt[]> {
  const res = await admin(
    `/rest/v1/billing_invoices?org_id=eq.${orgId}&select=number,base_paise,tax_paise,total_paise,plan_id,cycle&order=created_at.desc`,
  );
  return (await res.json()) as Receipt[];
}

export async function countEvents(orgId: string): Promise<number> {
  const res = await admin(
    `/rest/v1/billing_events?org_id=eq.${orgId}&select=id`,
  );
  return ((await res.json()) as unknown[]).length;
}
