"use client";

import {
  DAYS_UNTIL_LOCK,
  FEATURES,
  PLANS,
  PLAN_ORDER,
  POST_TRIAL_GRACE_DAYS,
  PURCHASABLE_PLANS,
  TRIAL_DAYS,
  featuresAddedBy,
  isAtLeast,
  priceOf,
  yearlyAsMonthly,
  yearlySavingsPct,
  type BillingCycle,
  type PlanId,
} from "@vyora/core";
import { Badge } from "@vyora/ui";
import Link from "next/link";

import { CheckoutButton } from "~/components/billing/checkout-button";
import { rupees } from "~/lib/billing/format";

/**
 * The price ladder as cards, with the monthly/yearly switch.
 *
 * Only the plans that are actually for sale get a card. "Basic" is what a
 * workspace runs on during the month between the trial ending and the
 * workspace closing — showing it as a tier would read as a free plan, and it
 * is not one.
 *
 * Shared by the public pricing page and the in-app subscription screen so the
 * two cannot drift — a shop that decided on a price before signing up should
 * see that same price inside the app.
 *
 * `currentPlan` is only known inside the app; on the marketing page it is
 * undefined and the cards link to sign-up instead of to checkout.
 */

export function PlanCards({
  cycle,
  onCycleChange,
  currentPlan,
  canPurchase = false,
}: {
  cycle: BillingCycle;
  onCycleChange: (cycle: BillingCycle) => void;
  currentPlan?: PlanId | undefined;
  /** False on the marketing site and for non-owners — the cards then link
   *  rather than open checkout. */
  canPurchase?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CycleToggle cycle={cycle} onChange={onCycleChange} />

      <div className="grid gap-4 lg:grid-cols-2">
        {PURCHASABLE_PLANS.map((id) => (
          <PlanCard
            key={id}
            id={id}
            cycle={cycle}
            currentPlan={currentPlan}
            canPurchase={canPurchase}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-card border border-border bg-canvas p-4">
        <span className="text-body font-medium">
          Before you pay anything: {DAYS_UNTIL_LOCK} days
        </span>
        <span className="text-body text-content-muted">
          Every new workspace gets {TRIAL_DAYS} days of the entire product — no
          card, no sales call. After that you keep {PLANS.free.name} — GST
          billing, stock and all 13 reports, with no invoice cap — for{" "}
          {POST_TRIAL_GRACE_DAYS} more days. If no plan is chosen by day{" "}
          {DAYS_UNTIL_LOCK} the workspace closes, and you can still download
          every record you entered.
        </span>
      </div>

      <p className="text-caption normal-case text-content-muted">
        All prices include 18% GST. You get a GST invoice for every payment,
        with the tax shown separately so you can claim input credit. Cancel any
        time — your plan runs to the end of the period you paid for, and your
        data stays yours either way.
      </p>
    </div>
  );
}

function CycleToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
}) {
  const saving = yearlySavingsPct("pro");
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex w-fit items-center gap-1 rounded-pill border border-border bg-surface p-1"
    >
      {(["monthly", "yearly"] as const).map((value) => {
        const active = cycle === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(value)}
            className={
              "flex min-h-touch items-center gap-2 rounded-pill px-4 text-body transition-colors " +
              (active
                ? "bg-primary text-primary-content"
                : "text-content-muted hover:text-content")
            }
          >
            {value === "monthly" ? "Monthly" : "Yearly"}
            {value === "yearly" ? (
              <span
                className={
                  "text-caption normal-case " +
                  (active ? "text-primary-content/80" : "text-success")
                }
              >
                save {saving}%
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PlanCard({
  id,
  cycle,
  currentPlan,
  canPurchase,
}: {
  id: PlanId;
  cycle: BillingCycle;
  currentPlan?: PlanId | undefined;
  canPurchase: boolean;
}) {
  const plan = PLANS[id];
  const isCurrent = currentPlan === id;
  // A shop on Business seeing "Upgrade" under Pro would be nonsense; below
  // their plan the action is a downgrade, which we handle on renewal.
  const isBelowCurrent = currentPlan
    ? isAtLeast(currentPlan, id) && !isCurrent
    : false;

  const headline =
    cycle === "yearly"
      ? rupees(yearlyAsMonthly(id))
      : rupees(priceOf(id, cycle));

  return (
    <div
      className={
        "flex flex-col gap-4 rounded-card border bg-surface p-5 shadow-card " +
        (plan.highlight ? "border-primary" : "border-border")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3">{plan.name}</h3>
        {isCurrent ? (
          <Badge tone="success" dot>
            Current
          </Badge>
        ) : plan.highlight ? (
          <Badge tone="primary">Most shops pick this</Badge>
        ) : null}
      </div>

      <p className="text-body text-content-muted">{plan.tagline}</p>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-h2">{headline}</span>
          <span className="text-body text-content-muted">/ month</span>
        </div>
        <span className="text-caption normal-case text-content-muted">
          {cycle === "yearly"
            ? `${rupees(priceOf(id, "yearly"))} billed yearly, incl. GST`
            : `billed monthly, incl. GST · ${rupees(priceOf(id, "yearly"))} if you pay yearly`}
        </span>
        <span className="text-caption normal-case text-content-muted">
          {plan.audience}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        <Line strong>Everything in {PLANS[previousPlan(id)].name}, plus:</Line>
        {featuresAddedBy(id)
          .filter((f) => f.status === "shipped")
          .slice(0, 7)
          .map((f) => (
            <Line key={f.key}>{f.label}</Line>
          ))}
        {featuresAddedBy(id).some((f) => f.status === "planned") ? (
          <li className="text-caption normal-case text-content-muted">
            On the roadmap for this plan:{" "}
            {featuresAddedBy(id)
              .filter((f) => f.status === "planned")
              .map((f) => FEATURES[f.key].label)
              .join(", ")}
            .
          </li>
        ) : null}
      </ul>

      <div className="mt-auto pt-2">
        {isCurrent ? (
          <span className="text-caption normal-case text-content-muted">
            This is your plan.
          </span>
        ) : isBelowCurrent ? (
          <span className="text-caption normal-case text-content-muted">
            Switch down at your next renewal.
          </span>
        ) : canPurchase ? (
          <CheckoutButton
            planId={id as Exclude<PlanId, "free">}
            cycle={cycle}
            label={
              currentPlan ? `Upgrade to ${plan.name}` : `Choose ${plan.name}`
            }
            variant={plan.highlight ? "primary" : "outline"}
          />
        ) : (
          <Link
            href="/login"
            className="text-body font-medium text-primary underline underline-offset-2"
          >
            Start free for {TRIAL_DAYS} days →
          </Link>
        )}
      </div>
    </div>
  );
}

function Line({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <li
      className={
        "flex items-start gap-2 text-body " +
        (strong ? "font-medium text-content" : "text-content-muted")
      }
    >
      <span
        aria-hidden
        className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-primary"
      />
      <span>{children}</span>
    </li>
  );
}

function previousPlan(id: PlanId): PlanId {
  const index = PLAN_ORDER.indexOf(id);
  return PLAN_ORDER[Math.max(0, index - 1)]!;
}
