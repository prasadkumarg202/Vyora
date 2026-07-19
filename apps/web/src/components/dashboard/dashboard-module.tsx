"use client";

import {
  formatPaise,
  type BusinessTypeConfig,
  type Paise,
} from "@vyora/core";
import { Badge, Card, EmptyState } from "@vyora/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  gstSummary,
  lowStock,
  reportsSummary,
  type GstSummary,
  type LowStockRow,
  type ReportsSummary,
} from "~/lib/db/repository";

/**
 * The Dashboard (route: /dashboard) — the shop's morning glance.
 *
 * It computes nothing new: every number is a total of what Sales, Purchase,
 * Payments and Inventory already wrote to the offline ledger, so it works with
 * no network and matches every module exactly. Reads only.
 *
 * Low stock uses a fixed 5-unit threshold for now; a per-product reorder level
 * is a later product field and would replace the constant here.
 */

const LOW_STOCK_THRESHOLD_MILLI = 5_000; // 5 units

interface Data {
  today: ReportsSummary;
  month: ReportsSummary;
  gst: GstSummary;
  low: LowStockRow[];
}

export function DashboardModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const today = ymd(now);
      const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

      const [todaySummary, monthSummary, gst, low] = await Promise.all([
        reportsSummary(orgId, today, today),
        reportsSummary(orgId, monthStart, today),
        gstSummary(orgId, monthStart, monthEnd),
        lowStock(orgId, LOW_STOCK_THRESHOLD_MILLI),
      ]);

      setData({ today: todaySummary, month: monthSummary, gst, low });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Dashboard</h1>
          <p className="text-body text-content-muted">
            Today at a glance — sales, money in, dues and stock. Works offline.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
        >
          {error}
        </p>
      ) : null}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          href="/sales"
          label="Sales today"
          value={data ? formatPaise(data.today.salesPaise as Paise) : "…"}
          sub={data ? `${data.today.salesCount} invoice${plural(data.today.salesCount)}` : ""}
        />
        <Kpi
          href="/payments"
          label="Collected today"
          value={data ? formatPaise(data.today.collectedPaise as Paise) : "…"}
          sub="Payments received"
        />
        <Kpi
          href="/payments"
          label="Outstanding"
          tone="warning"
          value={data ? formatPaise(data.today.outstandingPaise as Paise) : "…"}
          sub="Unpaid, all time"
        />
        <Kpi
          href="/sales"
          label="Sales this month"
          value={data ? formatPaise(data.month.salesPaise as Paise) : "…"}
          sub={data ? `${data.month.salesCount} invoice${plural(data.month.salesCount)} MTD` : ""}
        />
        <Kpi
          href="/gst"
          label="GST payable (month)"
          tone={data && data.gst.netPayablePaise > 0 ? "warning" : "default"}
          value={data ? formatPaise(data.gst.netPayablePaise as Paise) : "…"}
          sub={
            data
              ? `Output ${formatPaise(data.gst.outputTaxPaise as Paise)} − input ${formatPaise(data.gst.inputTaxPaise as Paise)}`
              : ""
          }
        />
        <Kpi
          href="/inventory"
          label="Low stock"
          tone={data && data.low.length > 0 ? "warning" : "default"}
          value={data ? String(data.low.length) : "…"}
          sub={`At or below ${LOW_STOCK_THRESHOLD_MILLI / 1000} units`}
        />
      </div>

      {/* Low-stock detail */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h3">Low stock</h2>
          <Link
            href="/inventory"
            className="text-body font-medium text-primary hover:underline"
          >
            Open inventory →
          </Link>
        </div>
        {data === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : data.low.length === 0 ? (
          <EmptyState
            title="Stock looks healthy"
            description="No products are at or below the reorder threshold."
          />
        ) : (
          <Card className="divide-y divide-border p-0">
            {data.low.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <span className="text-body font-medium">{p.name}</span>
                <span className="font-mono text-body-lg text-warning">
                  {formatMilli(p.on_hand_milli)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function Kpi({
  href,
  label,
  value,
  sub,
  tone = "default",
}: {
  href: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning";
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card transition hover:border-primary"
    >
      <span className="text-caption font-medium uppercase text-content-muted">
        {label}
      </span>
      <span
        className={
          "font-mono text-h2 " + (tone === "warning" ? "text-warning" : "")
        }
      >
        {value}
      </span>
      {sub ? (
        <span className="text-caption normal-case text-content-muted">
          {sub}
        </span>
      ) : null}
    </Link>
  );
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function formatMilli(milli: number): string {
  const n = milli / 1000;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}
