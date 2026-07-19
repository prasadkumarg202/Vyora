"use client";

import { formatPaise, type BusinessTypeConfig, type Paise } from "@vyora/core";
import { Badge, Card, EmptyState } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  lowStock,
  reportsSummary,
  type LowStockRow,
  type ReportsSummary,
} from "~/lib/db/repository";

/**
 * The Reports dashboard — the headline numbers a shop checks daily.
 *
 * Sales, collected, and outstanding for the month, plus which products are
 * running low. Everything is summed from what the transactional modules already
 * wrote; Reports computes nothing new, which is why its totals always agree with
 * the screens they came from.
 */

const LOW_STOCK_THRESHOLD_MILLI = 10_000; // 10 units

function monthBounds(now: Date): { from: string; to: string; label: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(last)}`,
    label: now.toLocaleString("en-IN", { month: "long", year: "numeric" }),
  };
}

export function ReportsModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const month = useMemo(() => monthBounds(new Date()), []);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [low, setLow] = useState<LowStockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        reportsSummary(orgId, month.from, month.to),
        lowStock(orgId, LOW_STOCK_THRESHOLD_MILLI),
      ]);
      setSummary(s);
      setLow(l);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId, month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Reports</h1>
          <p className="text-body text-content-muted">{month.label} · on this device</p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Sales"
          hint={`${summary?.salesCount ?? 0} invoices`}
          value={summary ? formatPaise(summary.salesPaise as Paise) : "—"}
          testid="sales-total"
          tone="info"
        />
        <Stat
          label="Collected"
          hint="payments in"
          value={summary ? formatPaise(summary.collectedPaise as Paise) : "—"}
          testid="collected-total"
          tone="success"
        />
        <Stat
          label="Outstanding"
          hint="unpaid, all time"
          value={summary ? formatPaise(summary.outstandingPaise as Paise) : "—"}
          testid="outstanding-total"
          tone={(summary?.outstandingPaise ?? 0) > 0 ? "warning" : "neutral"}
        />
        <Stat
          label="Purchases"
          hint={`${summary?.purchaseCount ?? 0} bills`}
          value={summary ? formatPaise(summary.purchasesPaise as Paise) : "—"}
          testid="purchases-total"
          tone="neutral"
        />
      </div>

      {config && config.reports.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-h3">Reports for your {config.label}</h2>
          <p className="text-body text-content-muted">
            The report set your trade files and reviews — the same list the
            business engine declares for a {config.label.toLowerCase()}.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {config.reports.map((name) => (
              <div
                key={name}
                className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-card"
                data-testid="trade-report"
              >
                <span className="text-body font-medium">{name}</span>
                <span className="text-caption normal-case text-content-muted">
                  Reads your saved sales, purchases &amp; captured fields.
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Low stock</h2>
        {low === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : low.length === 0 ? (
          <EmptyState
            title="Nothing running low"
            description="Every tracked product is above the reorder threshold."
          />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="low-stock-list">
            {low.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 p-4" data-testid="low-stock-row">
                <span className="text-body font-medium">{p.name}</span>
                <div className="flex items-center gap-3">
                  {p.on_hand_milli <= 0 ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : (
                    <Badge tone="warning">Low</Badge>
                  )}
                  <span className="w-16 text-right font-mono text-body-lg" data-testid="low-on-hand">
                    {formatMilli(p.on_hand_milli)}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  hint,
  value,
  testid,
  tone,
}: {
  label: string;
  hint: string;
  value: string;
  testid: string;
  tone: "info" | "success" | "warning" | "neutral";
}) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption uppercase tracking-wide text-content-muted">{label}</span>
        <Badge tone={tone}>{hint}</Badge>
      </div>
      <span className="font-mono text-h1" data-testid={testid}>
        {value}
      </span>
    </Card>
  );
}

function formatMilli(milli: number): string {
  const n = milli / 1000;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}
