import { describe, expect, it } from "vitest";

import {
  can,
  canAddDevice,
  canAddUser,
  DAYS_UNTIL_LOCK,
  freshTrialState,
  isPlanned,
  isUpgrade,
  LOCKED_FEATURES,
  POST_TRIAL_GRACE_DAYS,
  requiredPlanFor,
  resolveEntitlement,
  TRIAL_DAYS,
  TRIAL_WARN_DAYS,
  type OrgBillingState,
} from "./entitlement";
import {
  COMPARISON,
  FEATURE_LIST,
  featuresAddedBy,
  shippedFeaturesFor,
} from "./features";
import {
  GST_BPS,
  PLANS,
  PLAN_ORDER,
  PURCHASABLE_PLANS,
  isAtLeast,
  parseBillingCycle,
  parsePlanId,
  priceOf,
  splitGstInclusive,
  yearlyAsMonthly,
  yearlySavingsPct,
} from "./plans";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const at = (days: number) => new Date(T0.getTime() + days * 86_400_000);

function trialing(overrides: Partial<OrgBillingState> = {}): OrgBillingState {
  return { ...freshTrialState(T0.toISOString()), ...overrides };
}

describe("plans", () => {
  it("orders the ladder cheapest first", () => {
    expect(PLAN_ORDER).toEqual(["free", "pro", "business"]);
    expect(priceOf("free", "monthly")).toBe(0);
    expect(priceOf("pro", "monthly")).toBeLessThan(
      priceOf("business", "monthly"),
    );
    expect(priceOf("pro", "yearly")).toBeLessThan(
      priceOf("pro", "monthly") * 12,
    );
  });

  it("never caps invoices on any plan — that is the wedge", () => {
    for (const id of PLAN_ORDER) {
      expect(PLANS[id].limits.maxInvoicesPerMonth).toBeNull();
    }
  });

  it("makes yearly a real saving", () => {
    expect(yearlySavingsPct("pro")).toBeGreaterThanOrEqual(20);
    expect(yearlySavingsPct("business")).toBeGreaterThanOrEqual(20);
    expect(yearlySavingsPct("free")).toBe(0);
    expect(yearlyAsMonthly("pro")).toBeLessThan(priceOf("pro", "monthly"));
  });

  it("splits a GST-inclusive price so base + tax is exactly what we charge", () => {
    for (const id of PLAN_ORDER) {
      for (const cycle of ["monthly", "yearly"] as const) {
        const total = priceOf(id, cycle);
        const split = splitGstInclusive(total);
        expect(split.base + split.tax).toBe(total);
        expect(split.tax).toBeGreaterThanOrEqual(0);
      }
    }
    // ₹399 inclusive of 18% -> ₹338.14 + ₹60.86
    expect(splitGstInclusive(39_900, GST_BPS)).toEqual({
      base: 33_814,
      tax: 6_086,
      total: 39_900,
    });
  });

  it("rejects junk plan and cycle values instead of trusting them", () => {
    expect(parsePlanId("enterprise")).toBeNull();
    expect(parsePlanId(null)).toBeNull();
    expect(parsePlanId("pro")).toBe("pro");
    expect(parseBillingCycle("weekly")).toBeNull();
    expect(parseBillingCycle("yearly")).toBe("yearly");
  });

  it("sells exactly two plans — basic is a fallback, not a tier", () => {
    expect(PURCHASABLE_PLANS).toEqual(["pro", "business"]);
    expect(PLANS.free.purchasable).toBe(false);
  });

  it("ranks plans", () => {
    expect(isAtLeast("business", "pro")).toBe(true);
    expect(isAtLeast("free", "pro")).toBe(false);
    expect(isUpgrade("free", "pro")).toBe(true);
    expect(isUpgrade("business", "pro")).toBe(false);
  });
});

describe("feature catalogue", () => {
  it("has no duplicate keys", () => {
    const keys = FEATURE_LIST.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never licenses a feature that is not built yet", () => {
    for (const id of PLAN_ORDER) {
      for (const key of shippedFeaturesFor(id)) {
        expect(isPlanned(key)).toBe(false);
      }
    }
  });

  it("gives every plan something to add", () => {
    for (const id of PLAN_ORDER) {
      expect(featuresAddedBy(id).length).toBeGreaterThan(0);
    }
  });

  it("keeps free strictly inside pro, and pro inside business", () => {
    const free = new Set(shippedFeaturesFor("free"));
    const pro = new Set(shippedFeaturesFor("pro"));
    const biz = new Set(shippedFeaturesFor("business"));
    for (const k of free) expect(pro.has(k)).toBe(true);
    for (const k of pro) expect(biz.has(k)).toBe(true);
    expect(pro.size).toBeGreaterThan(free.size);
  });

  it("keeps the bookkeeping core free", () => {
    const free = shippedFeaturesFor("free");
    for (const key of [
      "gst_billing",
      "inventory",
      "reports",
      "report_library",
      "import_export",
    ] as const) {
      expect(free).toContain(key);
    }
  });

  it("points an upgrade prompt at the cheapest plan that unlocks it", () => {
    expect(requiredPlanFor("voice_billing")).toBe("pro");
    expect(requiredPlanFor("staff_roles")).toBe("business");
    expect(requiredPlanFor("gst_billing")).toBe("free");
  });

  it("compares against every incumbent on every row", () => {
    for (const row of COMPARISON) {
      expect(row.vyora.length).toBeGreaterThan(0);
      expect(row.vyapar.length).toBeGreaterThan(0);
      expect(row.mybillbook.length).toBeGreaterThan(0);
      expect(row.zoho.length).toBeGreaterThan(0);
    }
  });
});

describe("entitlement — trial", () => {
  it("unlocks everything for the full 90 days", () => {
    const day1 = resolveEntitlement(trialing(), at(1));
    expect(day1.isTrial).toBe(true);
    expect(day1.effectivePlanId).toBe("business");
    expect(can(day1, "voice_billing")).toBe(true);
    expect(can(day1, "unlimited_users")).toBe(true);
    expect(day1.trialDaysLeft).toBe(TRIAL_DAYS - 1);
    expect(day1.showTrialWarning).toBe(false);
  });

  it("starts warning two months in, without taking anything away", () => {
    const warnDay = at(TRIAL_DAYS - TRIAL_WARN_DAYS + 1);
    const e = resolveEntitlement(trialing(), warnDay);
    expect(e.showTrialWarning).toBe(true);
    expect(e.isTrial).toBe(true);
    expect(can(e, "cloud_sync")).toBe(true);
  });

  it("drops to the basics on day 90 — billing stays, advanced features lock", () => {
    const e = resolveEntitlement(trialing(), at(TRIAL_DAYS + 1));
    expect(e.isTrial).toBe(false);
    expect(e.isWindingDown).toBe(true);
    expect(e.isLocked).toBe(false);
    expect(e.status).toBe("expired");
    expect(e.effectivePlanId).toBe("free");
    expect(e.trialDaysLeft).toBe(0);
    expect(e.daysUntilLock).toBe(POST_TRIAL_GRACE_DAYS - 1);
    // The bookkeeping core survives the downgrade.
    expect(can(e, "gst_billing")).toBe(true);
    expect(can(e, "inventory")).toBe(true);
    expect(can(e, "report_library")).toBe(true);
    // The premium surface does not.
    expect(can(e, "cloud_sync")).toBe(false);
    expect(can(e, "voice_billing")).toBe(false);
    expect(can(e, "multi_device")).toBe(false);
  });

  it("still works on the last day of the wind-down", () => {
    const e = resolveEntitlement(trialing(), at(DAYS_UNTIL_LOCK - 0.5));
    expect(e.isLocked).toBe(false);
    expect(e.isWindingDown).toBe(true);
    expect(can(e, "gst_billing")).toBe(true);
  });

  it("locks the workspace on day 120", () => {
    const e = resolveEntitlement(trialing(), at(DAYS_UNTIL_LOCK + 0.5));
    expect(e.isLocked).toBe(true);
    expect(e.isWindingDown).toBe(false);
    expect(e.status).toBe("locked");
    expect(e.daysUntilLock).toBe(0);
    // Nothing runs...
    expect(can(e, "gst_billing")).toBe(false);
    expect(can(e, "inventory")).toBe(false);
    expect(can(e, "reports")).toBe(false);
    expect(can(e, "cloud_sync")).toBe(false);
    // ...except the way out. A shop's ledger is its own statutory record; we
    // do not get to hold it.
    expect(can(e, "manual_backup")).toBe(true);
    expect(can(e, "import_export")).toBe(true);
    expect(e.features.length).toBe(LOCKED_FEATURES.length);
  });

  it("stops a locked workspace adding users or devices", () => {
    const e = resolveEntitlement(trialing(), at(DAYS_UNTIL_LOCK + 5));
    expect(canAddUser(e).allowed).toBe(false);
    expect(canAddDevice(e).allowed).toBe(false);
  });

  it("never locks a workspace whose trial date is unreadable", () => {
    const e = resolveEntitlement(
      trialing({ trialEndsAt: "not-a-date" }),
      at(400),
    );
    expect(e.isLocked).toBe(false);
    expect(e.effectivePlanId).toBe("free");
    expect(e.trialDaysLeft).toBeNull();
    expect(e.daysUntilLock).toBeNull();
    expect(can(e, "gst_billing")).toBe(true);
  });
});

describe("entitlement — paid lifecycle", () => {
  const paid: OrgBillingState = {
    planId: "pro",
    status: "active",
    cycle: "monthly",
    trialEndsAt: null,
    currentPeriodEnd: at(30).toISOString(),
    seatsUsed: 2,
    devicesUsed: 4,
  };

  it("grants exactly the purchased plan", () => {
    const e = resolveEntitlement(paid, at(10));
    expect(e.effectivePlanId).toBe("pro");
    expect(can(e, "cloud_sync")).toBe(true);
    expect(can(e, "staff_roles")).toBe(false);
    expect(e.daysUntilRenewal).toBe(20);
  });

  it("keeps a past-due shop working through the grace window, then stops", () => {
    const pastDue = { ...paid, status: "past_due" as const };
    const inGrace = resolveEntitlement(pastDue, at(33));
    expect(inGrace.inGrace).toBe(true);
    expect(inGrace.effectivePlanId).toBe("pro");

    const after = resolveEntitlement(pastDue, at(40));
    expect(after.inGrace).toBe(false);
    expect(after.effectivePlanId).toBe("free");
    expect(after.status).toBe("expired");
    expect(after.isWindingDown).toBe(true);
  });

  it("gives a lapsed payer the same one month before locking", () => {
    const pastDue = { ...paid, status: "past_due" as const };
    // Period ended at day 30; the wind-down runs to day 60.
    expect(resolveEntitlement(pastDue, at(59)).isLocked).toBe(false);
    const locked = resolveEntitlement(pastDue, at(61));
    expect(locked.isLocked).toBe(true);
    expect(locked.status).toBe("locked");
    expect(can(locked, "manual_backup")).toBe(true);
    expect(can(locked, "gst_billing")).toBe(false);
  });

  it("honours a cancellation until the period actually ends", () => {
    const cancelled = { ...paid, status: "cancelled" as const };
    expect(resolveEntitlement(cancelled, at(29)).effectivePlanId).toBe("pro");
    expect(resolveEntitlement(cancelled, at(31)).effectivePlanId).toBe("free");
  });
});

describe("entitlement — seats and devices", () => {
  it("stops a wind-down workspace at one user and one device", () => {
    const e = resolveEntitlement(
      trialing({ seatsUsed: 1, devicesUsed: 1 }),
      at(TRIAL_DAYS + 2),
    );
    expect(e.isWindingDown).toBe(true);
    expect(canAddUser(e).allowed).toBe(false);
    expect(canAddDevice(e).allowed).toBe(false);
  });

  it("lets Pro add devices freely and users up to three", () => {
    const e = resolveEntitlement(
      {
        planId: "pro",
        status: "active",
        cycle: "yearly",
        trialEndsAt: null,
        currentPeriodEnd: at(300).toISOString(),
        seatsUsed: 3,
        devicesUsed: 9,
      },
      at(1),
    );
    expect(canAddUser(e)).toEqual({ allowed: false, limit: 3, used: 3 });
    expect(canAddDevice(e).allowed).toBe(true);
  });
});
