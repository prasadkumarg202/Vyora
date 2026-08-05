"use client";

import {
  DAYS_UNTIL_LOCK,
  PLANS,
  POST_TRIAL_GRACE_DAYS,
  TRIAL_DAYS,
  can,
  splitGstInclusive,
  type BillingCycle,
  type BusinessTypeConfig,
  type Entitlement,
} from "@vyora/core";
import { Badge, Button, Card } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

import { PlanCards } from "~/components/billing/plan-cards";
import { billingDate, rupees } from "~/lib/billing/format";
import { pendingCount, reportsSummary } from "~/lib/db/repository";

/**
 * Subscription (route: /subscriptions) — this shop's own plan, usage and
 * receipts.
 *
 * Two sources of truth meet here, and they are deliberately kept apart:
 *   - The plan, the dates and the receipts come from the server. They are
 *     billing facts, and the browser has no business deciding them.
 *   - The usage figures come from the local SQLite ledger, so they are honest
 *     and instant with no network — which is the whole premise of the product.
 */

export interface BillingReceipt {
  readonly id: string;
  readonly number: string;
  readonly totalPaise: number;
  readonly basePaise: number;
  readonly taxPaise: number;
  readonly paidAt: string | null;
  readonly periodEnd: string;
  readonly planId: string;
  readonly cycle: string;
}

export function SubscriptionsModule({
  orgId,
  config,
  entitlement,
  receipts,
  isOwner,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
  entitlement: Entitlement;
  receipts: readonly BillingReceipt[];
  isOwner: boolean;
}) {
  const [invoicesMtd, setInvoicesMtd] = useState<number | null>(null);
  const [unsynced, setUnsynced] = useState<number | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>(
    entitlement.cycle ?? "yearly",
  );

  const load = useCallback(async () => {
    const now = new Date();
    const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const today = ymd(now);
    const [report, pending] = await Promise.all([
      reportsSummary(orgId, monthStart, today),
      pendingCount(orgId),
    ]);
    setInvoicesMtd(report.salesCount);
    setUnsynced(pending);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const effective = PLANS[entitlement.effectivePlanId];
  const trialing = entitlement.isTrial;
  const windingDown = entitlement.isWindingDown;
  const locked = entitlement.isLocked;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Subscription</h1>
          <p className="text-body text-content-muted">
            Your plan, what you are using, and every receipt. A payment made on
            one device shows up on the others as soon as they sync.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-h3">Current plan</h2>
            <span
              data-testid="plan-status"
              data-status={
                locked
                  ? "locked"
                  : windingDown
                    ? "winding_down"
                    : trialing
                      ? "trialing"
                      : entitlement.inGrace
                        ? "past_due"
                        : "active"
              }
            >
              <Badge
                tone={
                  locked
                    ? "danger"
                    : windingDown
                      ? "warning"
                      : trialing
                        ? "info"
                        : "success"
                }
                dot
              >
                {locked
                  ? "Closed"
                  : windingDown
                    ? `Closes in ${entitlement.daysUntilLock} days`
                    : trialing
                      ? "Free trial"
                      : entitlement.inGrace
                        ? "Payment retrying"
                        : "Active"}
              </Badge>
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span data-testid="current-plan" className="text-h2">
              {effective.name}
            </span>
            {!trialing &&
            !windingDown &&
            entitlement.cycle &&
            entitlement.effectivePlanId !== "free" ? (
              <span className="font-mono text-body text-content-muted">
                {rupees(effective.price[entitlement.cycle])} /{" "}
                {entitlement.cycle === "yearly" ? "yr" : "mo"}
              </span>
            ) : null}
          </div>

          <p className="text-body text-content-muted">
            {trialing
              ? `${entitlement.trialDaysLeft} of your ${TRIAL_DAYS} free days left — the full product until ${billingDate(trialEndIso(entitlement))}. After that you keep billing, stock and reports for ${POST_TRIAL_GRACE_DAYS} more days.`
              : locked
                ? "This workspace is closed. Choose a plan and everything comes back exactly as you left it — nothing has been deleted, and you can download all your data at any time."
                : windingDown
                  ? `You are on the basics for ${entitlement.daysUntilLock} more days. On day ${DAYS_UNTIL_LOCK} the workspace closes until a plan is chosen. Nothing gets deleted, and your data stays exportable.`
                  : entitlement.inGrace
                    ? "The last renewal did not go through. Everything keeps working for a few more days while the bank retries."
                    : `Renews on ${billingDate(periodEndIso(entitlement))} · auto-renew on.`}
          </p>

          {!isOwner ? (
            <p className="text-caption normal-case text-content-muted">
              Only the workspace owner can change the plan.
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-h3">Usage</h2>
          <div className="grid grid-cols-2 gap-3">
            <Usage
              label="Invoices this month"
              value={invoicesMtd === null ? "…" : String(invoicesMtd)}
              note="Never capped, on any plan"
            />
            <Usage
              label="Users"
              value={`${entitlement.seatsUsed} / ${limitLabel(entitlement.limits.maxUsers)}`}
            />
            <Usage
              label="Devices"
              value={`${entitlement.devicesUsed} / ${limitLabel(entitlement.limits.maxDevices)}`}
            />
            <Usage
              label="Waiting to sync"
              value={
                unsynced === null
                  ? "…"
                  : can(entitlement, "cloud_sync")
                    ? String(unsynced)
                    : "Sync off"
              }
              note={
                can(entitlement, "cloud_sync")
                  ? undefined
                  : "Your records are safe on this device"
              }
            />
          </div>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Plans</h2>
        <PlanCards
          cycle={cycle}
          onCycleChange={setCycle}
          currentPlan={entitlement.effectivePlanId}
          canPurchase={isOwner}
        />
      </section>

      <Receipts receipts={receipts} />
    </div>
  );
}

function Receipts({ receipts }: { receipts: readonly BillingReceipt[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3">Receipts</h2>
      {receipts.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-5 text-body text-content-muted shadow-card">
          Nothing here yet. Every payment produces a GST invoice, with the tax
          shown separately so your accountant can claim the input credit.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase text-content-muted">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 text-right font-medium">Taxable</th>
                <th className="px-4 py-3 text-right font-medium">GST</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => {
                // Recomputed rather than trusted: if the stored split and the
                // stored total ever disagree, this shows the arithmetic that
                // matches what was charged instead of printing a wrong tax.
                const split = splitGstInclusive(receipt.totalPaise);
                return (
                  <tr
                    key={receipt.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-mono">{receipt.number}</td>
                    <td className="px-4 py-3">{billingDate(receipt.paidAt)}</td>
                    <td className="px-4 py-3">
                      {planLabel(receipt.planId)} · {receipt.cycle}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {rupees(split.base)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {rupees(split.tax)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {rupees(receipt.totalPaise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {receipts.length > 0 ? (
        <div>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            Print receipts
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Usage({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-canvas p-4">
      <span className="text-caption normal-case text-content-muted">
        {label}
      </span>
      <span className="font-mono text-body-lg">{value}</span>
      {note ? (
        <span className="text-caption normal-case text-content-muted">
          {note}
        </span>
      ) : null}
    </div>
  );
}

function planLabel(planId: string): string {
  return planId in PLANS ? PLANS[planId as keyof typeof PLANS].name : planId;
}

function limitLabel(limit: number | null): string {
  return limit === null ? "Unlimited" : String(limit);
}

function ymd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The entitlement deliberately carries day counts rather than dates — it is
 * computed on the server and rendered in the browser, and a serialised Date
 * would be a timezone bug waiting to happen. The display dates are rebuilt
 * from those counts here, at the only place that needs them.
 */
function trialEndIso(entitlement: Entitlement): string | null {
  if (entitlement.trialDaysLeft === null) return null;
  return new Date(
    Date.now() + entitlement.trialDaysLeft * 86_400_000,
  ).toISOString();
}

function periodEndIso(entitlement: Entitlement): string | null {
  if (entitlement.daysUntilRenewal === null) return null;
  return new Date(
    Date.now() + entitlement.daysUntilRenewal * 86_400_000,
  ).toISOString();
}
