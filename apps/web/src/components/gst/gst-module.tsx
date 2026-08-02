"use client";

import {
  formatPaise,
  type BusinessTypeConfig,
  type GstRate,
  type Paise,
} from "@vyora/core";
import { Badge, Card } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { gstSummary, type GstSummary } from "~/lib/db/repository";

/** A GstRate variant → the short label a shopkeeper reads. */
function rateLabel(rate: GstRate): string {
  switch (rate.kind) {
    case "fixed":
      return `${rate.bps / 100}%`;
    case "range":
      return `${rate.minBps / 100}–${rate.maxBps / 100}%`;
    case "hsn":
      return "As per HSN";
    case "igst":
      return "IGST";
    case "none":
      return "—";
  }
}

/**
 * The GST summary — the monthly position a shop files.
 *
 * Output tax collected on sales, minus input credit paid on purchases, is the
 * net payable. Every figure is tax the engine computed and stored when the
 * invoice or purchase was saved; this screen only sums and nets it, so the
 * number here is the number that already reconciled per document.
 *
 * The full self-serve filing flow (GSTN connect, GSTR-2B reconciliation) is a
 * separate, much larger feature; this is the day-to-day liability view.
 */

interface Period {
  label: string;
  from: string;
  to: string;
}

/** The last few months as inclusive YYYY-MM-DD bounds. */
function recentPeriods(now: Date): Period[] {
  const periods: Period[] = [];
  for (let back = 0; back < 4; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const to = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(last)}`;
    periods.push({
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      from,
      to,
    });
  }
  return periods;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function GstModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  // Computed once from an injected "now" would be cleaner, but the summary is a
  // point-in-time view and re-deriving on mount is cheap.
  const periods = useMemo(() => recentPeriods(new Date()), []);
  const [period, setPeriod] = useState<Period>(periods[0]!);
  const [summary, setSummary] = useState<GstSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSummary(await gstSummary(orgId, period.from, period.to));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const net = summary?.netPayablePaise ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-h1">GST</h1>
            {config ? <Badge tone="primary">{config.label}</Badge> : null}
          </div>
          <p className="text-body text-content-muted">
            Your monthly position — collected, credited, and payable.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-caption uppercase tracking-wide text-content-muted">Period</span>
          <select
            value={period.from}
            onChange={(e) => setPeriod(periods.find((p) => p.from === e.target.value) ?? periods[0]!)}
            className="min-h-touch rounded-input border border-border bg-surface px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
            data-testid="period"
          >
            {periods.map((p) => (
              <option key={p.from} value={p.from}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Output tax"
          hint={`${summary?.invoiceCount ?? 0} sales`}
          value={summary ? formatPaise(summary.outputTaxPaise as Paise) : "—"}
          testid="output-tax"
          tone="info"
        />
        <StatCard
          label="Input credit"
          hint={`${summary?.purchaseCount ?? 0} purchases`}
          value={summary ? formatPaise(summary.inputTaxPaise as Paise) : "—"}
          testid="input-tax"
          tone="info"
        />
        <StatCard
          label={net >= 0 ? "Net payable" : "Credit carried"}
          hint={net >= 0 ? "output − input" : "input exceeds output"}
          value={summary ? formatPaise(Math.abs(net) as Paise) : "—"}
          testid="net-payable"
          tone={net > 0 ? "warning" : "success"}
        />
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-h3">Breakdown</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-body" data-testid="breakdown">
          <dt className="text-content-muted">Taxable sales</dt>
          <dd className="text-right font-mono">
            {summary ? formatPaise(summary.outputTaxablePaise as Paise) : "—"}
          </dd>
          <dt className="text-content-muted">Output tax collected</dt>
          <dd className="text-right font-mono">
            {summary ? formatPaise(summary.outputTaxPaise as Paise) : "—"}
          </dd>
          <dt className="text-content-muted">Taxable purchases</dt>
          <dd className="text-right font-mono">
            {summary ? formatPaise(summary.inputTaxablePaise as Paise) : "—"}
          </dd>
          <dt className="text-content-muted">Input tax credit</dt>
          <dd className="text-right font-mono">
            {summary ? formatPaise(summary.inputTaxPaise as Paise) : "—"}
          </dd>
          <dt className="border-t border-border pt-2 font-semibold text-content">
            {net >= 0 ? "Net GST payable" : "Credit carried forward"}
          </dt>
          <dd className="border-t border-border pt-2 text-right font-mono font-semibold" data-testid="net-breakdown">
            {summary ? formatPaise(Math.abs(net) as Paise) : "—"}
          </dd>
        </dl>
        <p className="text-caption normal-case text-content-muted">
          Computed on this device from saved invoices and purchases. Filing to
          the GST portal is a separate step.
        </p>
      </Card>

      {config ? (
        <Card className="flex flex-col gap-3 p-5" data-testid="gst-profile">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-h3">GST profile · {config.label}</h2>
            <Badge tone="neutral">Default {config.gst.defaultLabel}</Badge>
          </div>
          <p className="text-body text-content-muted">
            The rate posture the engine applies for your trade. Every saved
            invoice is taxed by these rules, not a hardcoded rate.
          </p>
          <div className="flex flex-col divide-y divide-border">
            {config.gst.slabs.map((slab, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 py-2"
                data-testid="gst-slab"
              >
                <span className="text-body">{slab.applies}</span>
                <div className="flex items-center gap-2">
                  {slab.itcBlocked ? <Badge tone="warning">No ITC</Badge> : null}
                  <span className="font-mono text-body">{rateLabel(slab.rate)}</span>
                </div>
              </div>
            ))}
          </div>
          {config.gst.composition ? (
            <p className="text-caption normal-case text-content-muted">
              Composition dealer at {config.gst.composition.rateBps / 100}% —
              bills are a Bill of Supply with no tax breakup.
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function StatCard({
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
  tone: "info" | "warning" | "success";
}) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption uppercase tracking-wide text-content-muted">{label}</span>
        <Badge tone={tone}>{hint}</Badge>
      </div>
      <span className="font-mono text-display" data-testid={testid}>
        {value}
      </span>
    </Card>
  );
}
