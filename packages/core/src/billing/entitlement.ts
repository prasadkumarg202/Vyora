import type { FeatureKey } from "./features";
import { FEATURES, shippedFeaturesFor } from "./features";
import type { BillingCycle, PlanId, PlanLimits } from "./plans";
import { BASIC_PLAN, PLANS, TRIAL_PLAN, isAtLeast } from "./plans";

/**
 * What this workspace is allowed to do, right now.
 *
 * Deliberately a pure function of (stored billing state, clock). It runs
 * unchanged on the server — where it is the authority — and in the browser,
 * where it only decides what to grey out. The server never trusts the client's
 * copy; the client never has to guess.
 *
 * The lifecycle a workspace that never pays walks through:
 *
 *   day 0 ────────────── day 90 ─────────── day 120 ──────────▶
 *   │  trialing          │  grace           │  locked
 *   │  everything        │  basics only     │  pay, or export and leave
 *
 * The result is plain data. It crosses the server/client boundary as a prop,
 * so no methods and no Date objects live on it — `can()` is a free function.
 */

export type SubscriptionStatus =
  /** Inside the 90-day, everything-included trial. */
  | "trialing"
  /** Paid and current. */
  | "active"
  /** Renewal failed; still working, inside the retry window. */
  | "past_due"
  /** Cancelled but paid until the period ends. */
  | "cancelled"
  /** Trial over, nothing bought — the basics still work, for 30 days. */
  | "expired"
  /** The wind-down is over. The workspace is closed until a plan is bought. */
  | "locked";

/** Full-feature trial. Three months, per the launch plan. */
export const TRIAL_DAYS = 90;

/**
 * Start warning this far from the end of the trial — i.e. after two months.
 * The nudge is a banner, not a lock: nothing is taken away until day 90.
 */
export const TRIAL_WARN_DAYS = 30;

/**
 * After the trial, the shop keeps the bookkeeping basics for one more month
 * and then the workspace locks. 90 + 30 = 120 days from sign-up.
 *
 * This is the commercial decision, and it is a real one: a month is long
 * enough that nobody loses a day's billing to a decision they did not know
 * they had to make, and short enough that the product is not free forever.
 */
export const POST_TRIAL_GRACE_DAYS = 30;

/** Total days a workspace runs without ever paying. */
export const DAYS_UNTIL_LOCK = TRIAL_DAYS + POST_TRIAL_GRACE_DAYS;

/**
 * A failed renewal keeps working this long. UPI mandates fail for boring
 * reasons (bank downtime, a day's low balance); locking a paying shop out over
 * one retry would cost more in goodwill than the renewal is worth.
 */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * What still works after the lock.
 *
 * A locked workspace is closed for business, not held hostage. The ledger is
 * the shop's own record of its own trade — we would be wrong to sit on it, and
 * in most places it is also the shop's statutory obligation to be able to
 * produce it. So backup and export survive the lock; nothing else does.
 */
export const LOCKED_FEATURES: readonly FeatureKey[] = [
  "manual_backup",
  "import_export",
];

const DAY_MS = 86_400_000;

/** The billing columns as they are stored on the organisation row. */
export interface OrgBillingState {
  readonly planId: PlanId;
  readonly status: SubscriptionStatus;
  readonly cycle: BillingCycle | null;
  /** ISO timestamp. Null once the org has paid at least once. */
  readonly trialEndsAt: string | null;
  /** ISO timestamp of the end of the paid period. */
  readonly currentPeriodEnd: string | null;
  readonly seatsUsed: number;
  readonly devicesUsed: number;
}

export interface Entitlement {
  /** What they bought (or would return to). */
  readonly planId: PlanId;
  /** What they may actually use right now — the trial inflates this. */
  readonly effectivePlanId: PlanId;
  readonly status: SubscriptionStatus;
  readonly cycle: BillingCycle | null;
  readonly isTrial: boolean;
  /** True between day 90 and day 120: basics only, nothing bought yet. */
  readonly isWindingDown: boolean;
  /** True from day 120. The shell renders the lock screen instead of the app. */
  readonly isLocked: boolean;
  /** 0 once the trial is over; null when there is no trial. */
  readonly trialDaysLeft: number | null;
  /** Days until the workspace locks; null once they have paid. */
  readonly daysUntilLock: number | null;
  /** True in the last {@link TRIAL_WARN_DAYS} days of the trial. */
  readonly showTrialWarning: boolean;
  /** True while a failed renewal is still inside the retry window. */
  readonly inGrace: boolean;
  readonly daysUntilRenewal: number | null;
  readonly limits: PlanLimits;
  readonly features: readonly FeatureKey[];
  readonly seatsUsed: number;
  readonly devicesUsed: number;
}

/** The state a workspace has before anything is written — a fresh 90-day trial. */
export function freshTrialState(startedAtIso: string): OrgBillingState {
  const ends = new Date(Date.parse(startedAtIso) + TRIAL_DAYS * DAY_MS);
  return {
    planId: BASIC_PLAN,
    status: "trialing",
    cycle: null,
    trialEndsAt: ends.toISOString(),
    currentPeriodEnd: null,
    seatsUsed: 1,
    devicesUsed: 1,
  };
}

export function resolveEntitlement(
  state: OrgBillingState,
  now: Date = new Date(),
): Entitlement {
  const nowMs = now.getTime();
  const trialEndMs = parseIso(state.trialEndsAt);
  const periodEndMs = parseIso(state.currentPeriodEnd);

  const trialActive =
    (state.status === "trialing" || state.status === "expired") &&
    trialEndMs !== null &&
    nowMs < trialEndMs;

  let effectivePlanId: PlanId;
  let status: SubscriptionStatus = state.status;
  let inGrace = false;
  /**
   * When the workspace closes. Null means "not on a countdown" — either they
   * are paying, or we could not read the date that would start one. An
   * unreadable date must never lock anyone: that would be our bug costing a
   * shop its day's billing.
   */
  let lockAtMs: number | null = null;

  if (state.status === "active") {
    effectivePlanId = state.planId;
  } else if (state.status === "past_due") {
    inGrace =
      periodEndMs !== null &&
      nowMs < periodEndMs + PAST_DUE_GRACE_DAYS * DAY_MS;
    effectivePlanId = inGrace ? state.planId : BASIC_PLAN;
    if (!inGrace) {
      status = "expired";
      lockAtMs = countdownFrom(periodEndMs);
    }
  } else if (state.status === "cancelled") {
    // Cancelled means "do not renew", not "stop now".
    const stillPaid = periodEndMs !== null && nowMs < periodEndMs;
    effectivePlanId = stillPaid ? state.planId : BASIC_PLAN;
    if (!stillPaid) {
      status = "expired";
      lockAtMs = countdownFrom(periodEndMs);
    }
  } else if (trialActive) {
    // The trial is the whole product. That is the point: a shop should decide
    // with the real thing in their hands, not a demo.
    effectivePlanId = TRIAL_PLAN;
  } else {
    // Trial over and nothing bought: the basics, on a one-month countdown.
    effectivePlanId = BASIC_PLAN;
    status = "expired";
    lockAtMs = countdownFrom(trialEndMs);
  }

  const locked = lockAtMs !== null && nowMs >= lockAtMs;
  if (locked) status = "locked";

  const trialDaysLeft =
    trialEndMs === null
      ? null
      : Math.max(0, Math.ceil((trialEndMs - nowMs) / DAY_MS));

  return {
    planId: state.planId,
    effectivePlanId,
    status,
    cycle: state.cycle,
    isTrial: trialActive,
    isWindingDown: lockAtMs !== null && !locked,
    isLocked: locked,
    trialDaysLeft,
    daysUntilLock:
      lockAtMs === null
        ? null
        : Math.max(0, Math.ceil((lockAtMs - nowMs) / DAY_MS)),
    showTrialWarning:
      trialActive && trialDaysLeft !== null && trialDaysLeft <= TRIAL_WARN_DAYS,
    inGrace,
    daysUntilRenewal:
      periodEndMs === null ? null : Math.ceil((periodEndMs - nowMs) / DAY_MS),
    limits: PLANS[effectivePlanId].limits,
    // A locked workspace keeps exactly one thing: the way out.
    features: locked ? LOCKED_FEATURES : shippedFeaturesFor(effectivePlanId),
    seatsUsed: state.seatsUsed,
    devicesUsed: state.devicesUsed,
  };

  function countdownFrom(startMs: number | null): number | null {
    return startMs === null ? null : startMs + POST_TRIAL_GRACE_DAYS * DAY_MS;
  }
}

/** The only question a screen should ask. */
export function can(entitlement: Entitlement, feature: FeatureKey): boolean {
  return entitlement.features.includes(feature);
}

/** The cheapest plan that unlocks a feature — what the upgrade prompt offers. */
export function requiredPlanFor(feature: FeatureKey): PlanId {
  return FEATURES[feature].minPlan;
}

/** True when the feature is on the roadmap rather than behind a paywall, so
 *  the UI can say "coming soon" instead of "upgrade". */
export function isPlanned(feature: FeatureKey): boolean {
  return FEATURES[feature].status === "planned";
}

export interface SeatCheck {
  readonly allowed: boolean;
  readonly limit: number | null;
  readonly used: number;
}

export function canAddUser(entitlement: Entitlement): SeatCheck {
  const limit = entitlement.limits.maxUsers;
  return {
    allowed:
      !entitlement.isLocked &&
      (limit === null || entitlement.seatsUsed < limit),
    limit,
    used: entitlement.seatsUsed,
  };
}

export function canAddDevice(entitlement: Entitlement): SeatCheck {
  const limit = entitlement.limits.maxDevices;
  return {
    allowed:
      !entitlement.isLocked &&
      (limit === null || entitlement.devicesUsed < limit),
    limit,
    used: entitlement.devicesUsed,
  };
}

export function parseSubscriptionStatus(
  value: unknown,
): SubscriptionStatus | null {
  return value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "cancelled" ||
    value === "expired" ||
    value === "locked"
    ? value
    : null;
}

/** Guards against a NaN date silently reading as "1970", which would lock
 *  every workspace ever created. */
function parseIso(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** True when this plan is a real upgrade from the current one. */
export function isUpgrade(from: PlanId, to: PlanId): boolean {
  return !isAtLeast(from, to);
}
