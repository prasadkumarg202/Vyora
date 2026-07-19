"use client";

import { formatPaise, type BusinessTypeConfig, type Paise } from "@vyora/core";
import { Badge, Button, Card } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

import { pendingCount, reportsSummary } from "~/lib/db/repository";

/**
 * Subscriptions (route: /subscriptions) — this shop's own plan, usage and
 * billing, per the Licensing spec.
 *
 * Usage figures (invoices this month, unsynced records) are read live from the
 * local ledger; the plan, cycle and price are the licensing catalogue — sample
 * values until the billing backend is connected. The tiers below are the real
 * price ladder a shop upgrades along.
 */

const CURRENT_PLAN = "3 users";
const PLANS = [
  { name: "1 user", pricePaise: 99900, seats: "1 device", blurb: "Solo shop" },
  { name: "3 users", pricePaise: 249900, seats: "3 devices", blurb: "Small team" },
  { name: "5 users", pricePaise: 399900, seats: "5 devices", blurb: "Busy counter" },
  { name: "10 users", pricePaise: 699900, seats: "10 devices", blurb: "Multi-till" },
  { name: "Unlimited", pricePaise: 1199900, seats: "Unlimited", blurb: "Chain / franchise" },
];
const RENEWAL = "12 Apr 2027";

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function SubscriptionsModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [invoicesMtd, setInvoicesMtd] = useState<number | null>(null);
  const [unsynced, setUnsynced] = useState<number | null>(null);

  const load = useCallback(async () => {
    const now = new Date();
    const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const today = ymd(now);
    const [rep, pending] = await Promise.all([
      reportsSummary(orgId, monthStart, today),
      pendingCount(orgId),
    ]);
    setInvoicesMtd(rep.salesCount);
    setUnsynced(pending);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rupee = (p: number) => formatPaise(p as Paise);
  const current = PLANS.find((p) => p.name === CURRENT_PLAN);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Subscription</h1>
          <p className="text-body text-content-muted">
            Your plan, usage and billing. Vyora keeps billing offline — sync resumes automatically.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {/* Current plan + usage */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-h3">Current plan</h2>
            <Badge tone="success" dot>Active</Badge>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-h2">{CURRENT_PLAN}</span>
            <span className="font-mono text-body text-content-muted">
              {current ? `${rupee(current.pricePaise)} / yr` : ""}
            </span>
          </div>
          <p className="text-body text-content-muted">Renews on {RENEWAL} · auto-renew on.</p>
          <div>
            <Button variant="outline" size="sm">Manage billing</Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-h3">Usage</h2>
          <div className="grid grid-cols-2 gap-3">
            <Usage label="Invoices this month" value={invoicesMtd === null ? "…" : String(invoicesMtd)} />
            <Usage label="Seats used" value="2 / 3" />
            <Usage label="Unsynced records" value={unsynced === null ? "…" : String(unsynced)} />
            <Usage label="Storage" value="18%" />
          </div>
        </Card>
      </div>

      {/* Plan ladder */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Plans</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p) => {
            const isCurrent = p.name === CURRENT_PLAN;
            return (
              <div
                key={p.name}
                className="flex flex-col gap-2 rounded-card border bg-surface p-4 shadow-card"
                style={isCurrent ? { borderColor: "oklch(0.55 0.2 285)" } : undefined}
              >
                <div className="flex items-center justify-between">
                  <span className="text-body font-semibold">{p.name}</span>
                  {isCurrent ? <Badge tone="primary">Current</Badge> : null}
                </div>
                <span className="font-mono text-body-lg">{rupee(p.pricePaise)}</span>
                <span className="text-caption normal-case text-content-muted">per year · {p.seats}</span>
                <span className="text-caption normal-case text-content-muted">{p.blurb}</span>
                {!isCurrent ? (
                  <Button variant="outline" size="sm" className="mt-1">
                    {p.pricePaise > (current?.pricePaise ?? 0) ? "Upgrade" : "Switch"}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="text-caption normal-case text-content-muted">
          Plan pricing is the licensing catalogue; live billing, invoices and
          upgrades activate when the payments backend is connected.
        </p>
      </section>
    </div>
  );
}

function Usage({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-canvas p-4">
      <span className="text-caption normal-case text-content-muted">{label}</span>
      <span className="font-mono text-body-lg">{value}</span>
    </div>
  );
}
