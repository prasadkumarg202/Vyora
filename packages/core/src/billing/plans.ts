import type { Paise } from "../types";

/**
 * The Vyora price ladder.
 *
 * One catalogue, in code, shared by the marketing site, the in-app
 * subscription screen, the checkout route and the webhook. Prices are NOT
 * stored in the database: a row that drifts from the pricing page is how a
 * shop gets charged one amount and shown another. The database records what a
 * given org *bought* (plan id, cycle, period end); what that costs is here.
 *
 * Positioning, deliberately:
 *   - Vyapar and myBillBook both paywall multi-device sync and multi-user, and
 *     ration e-way bills on their entry tiers. Zoho Books gives a genuinely
 *     full free plan but caps it at ₹25 lakh annual revenue.
 *   - So Vyora's free tier keeps the whole bookkeeping core — GST billing,
 *     stock, all 13 reports, GSTR-1 export — with no invoice cap and no
 *     turnover ceiling. That is the wedge.
 *   - Money comes from what a *growing* shop needs: the cloud (sync, backup,
 *     more than one device), the team (more than one user), and the AI.
 *
 * Every amount is GST-inclusive paise, because that is the number an Indian
 * shopkeeper expects to see. `splitGstInclusive` recovers the base and the tax
 * for the tax invoice we issue back to them.
 */

export type PlanId = "free" | "pro" | "business";

export type BillingCycle = "monthly" | "yearly";

/** GST on SaaS in India. */
export const GST_BPS = 1800;

export interface PlanLimits {
  /** Users who can sign in to the workspace. `null` means unlimited. */
  readonly maxUsers: number | null;
  /** Devices that may hold a copy of the ledger. `null` means unlimited. */
  readonly maxDevices: number | null;
  /** Invoices per month. Always null — we never cap billing. Kept explicit so
   *  the comparison table can say so without a magic string. */
  readonly maxInvoicesPerMonth: null;
  /** Cloud sync and automatic backup. */
  readonly cloudSync: boolean;
  /** AI calls per month (voice bill, snap bill, assistant). `null` = unmetered. */
  readonly aiCallsPerMonth: number | null;
}

export interface PlanDef {
  readonly id: PlanId;
  readonly name: string;
  /** One line, shop-owner language, for the pricing card. */
  readonly tagline: string;
  /** Who it is for — shown under the price. */
  readonly audience: string;
  /** GST-inclusive price per cycle. Zero for free. */
  readonly price: Readonly<Record<BillingCycle, Paise>>;
  readonly limits: PlanLimits;
  /** Rendered with a highlight ring on the pricing page. */
  readonly highlight: boolean;
  /**
   * False for `basic`, which nobody buys — it is the feature level a workspace
   * falls back to during the one-month wind-down after the trial, not a tier
   * on sale. The pricing cards read this instead of special-casing an id.
   */
  readonly purchasable: boolean;
}

export const PLAN_ORDER: readonly PlanId[] = ["free", "pro", "business"];

/**
 * The feature level a workspace runs at once the trial ends and before it
 * locks. Not a plan anyone can buy — see {@link PlanDef.purchasable}.
 *
 * The id stays `free` because it is written into the database enum and into
 * every receipt already issued; renaming it would be a migration with no
 * benefit. What it is *called* is the label below.
 */
export const BASIC_PLAN: PlanId = "free";

/** What the 90-day trial unlocks — everything. */
export const TRIAL_PLAN: PlanId = "business";

export const PLANS: Readonly<Record<PlanId, PlanDef>> = {
  free: {
    id: "free",
    name: "Vyora Basic",
    tagline: "The bookkeeping core, while you decide.",
    audience: "The wind-down month after your trial. One user, one device.",
    price: { monthly: 0 as Paise, yearly: 0 as Paise },
    limits: {
      maxUsers: 1,
      maxDevices: 1,
      maxInvoicesPerMonth: null,
      cloudSync: false,
      aiCallsPerMonth: 0,
    },
    highlight: false,
    purchasable: false,
  },
  pro: {
    id: "pro",
    name: "Vyora Pro",
    tagline: "The cloud, the counter and the AI.",
    audience: "A shop with a helper or two, and more than one phone.",
    price: { monthly: 39_900 as Paise, yearly: 349_900 as Paise },
    limits: {
      maxUsers: 3,
      maxDevices: null,
      maxInvoicesPerMonth: null,
      cloudSync: true,
      aiCallsPerMonth: 500,
    },
    highlight: true,
    purchasable: true,
  },
  business: {
    id: "business",
    name: "Vyora Business",
    tagline: "Many hands, many counters, full compliance.",
    audience: "Multi-counter shops, distributors and small chains.",
    price: { monthly: 79_900 as Paise, yearly: 649_900 as Paise },
    limits: {
      maxUsers: null,
      maxDevices: null,
      maxInvoicesPerMonth: null,
      cloudSync: true,
      aiCallsPerMonth: null,
    },
    highlight: false,
    purchasable: true,
  },
};

/**
 * The plans that actually appear as buyable cards, in ladder order.
 *
 * Declared after PLANS rather than beside PLAN_ORDER: a const referencing
 * PLANS above its declaration is a temporal-dead-zone crash at import time,
 * and it would take the whole app with it.
 */
export const PURCHASABLE_PLANS: readonly PlanId[] = PLAN_ORDER.filter(
  (id) => PLANS[id].purchasable,
);

export function getPlan(id: PlanId): PlanDef {
  return PLANS[id];
}

/** Null for an unknown string, so a stale database value degrades to free
 *  rather than throwing on every page load. */
export function parsePlanId(value: unknown): PlanId | null {
  return typeof value === "string" && value in PLANS ? (value as PlanId) : null;
}

export function parseBillingCycle(value: unknown): BillingCycle | null {
  return value === "monthly" || value === "yearly" ? value : null;
}

/** Rank in the ladder — higher means more. Used to answer "is this feature
 *  included", never to compare prices. */
export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}

export function isAtLeast(actual: PlanId, required: PlanId): boolean {
  return planRank(actual) >= planRank(required);
}

export function priceOf(id: PlanId, cycle: BillingCycle): Paise {
  return PLANS[id].price[cycle];
}

/**
 * A yearly plan expressed as "₹x/month, billed yearly" — the number every
 * competitor advertises, so ours has to be comparable at a glance.
 *
 * Floored to whole rupees, and floored rather than rounded: ₹291 understates
 * the true ₹291.58 by a few paise, and if the headline figure has to be wrong
 * in one direction it should be the direction that cannot surprise the buyer.
 * The exact yearly amount is printed directly underneath either way.
 */
export function yearlyAsMonthly(id: PlanId): Paise {
  const perMonth = divideRoundHalfUp(PLANS[id].price.yearly, 12);
  return (Math.floor(perMonth / 100) * 100) as Paise;
}

/** Whole percent saved by paying yearly. 0 for the free plan. */
export function yearlySavingsPct(id: PlanId): number {
  const monthlyYear = PLANS[id].price.monthly * 12;
  if (monthlyYear <= 0) return 0;
  const saved = monthlyYear - PLANS[id].price.yearly;
  return Math.round((saved / monthlyYear) * 100);
}

export interface GstSplit {
  /** Taxable value. */
  readonly base: Paise;
  /** Total GST (CGST + SGST, or IGST). */
  readonly tax: Paise;
  readonly total: Paise;
}

/**
 * Recovers the taxable value from a GST-inclusive price.
 *
 * We advertise inclusive prices, but the receipt we hand back has to show the
 * split or the buyer cannot claim input credit. Rounding is half away from
 * zero and applied to the base, with the tax taken as the remainder, so
 * base + tax always equals the amount actually charged.
 */
export function splitGstInclusive(
  total: Paise,
  bps: number = GST_BPS,
): GstSplit {
  if (!Number.isInteger(total)) {
    throw new Error(`total must be whole paise, got ${total}`);
  }
  if (!Number.isInteger(bps) || bps < 0) {
    throw new Error(`bps must be a non-negative whole number, got ${bps}`);
  }
  const base = Number(
    (BigInt(total) * 10_000n * 2n + BigInt(10_000 + bps)) /
      (BigInt(10_000 + bps) * 2n),
  );
  return { base: base as Paise, tax: (total - base) as Paise, total };
}

function divideRoundHalfUp(value: number, by: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) / by);
}
