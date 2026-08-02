"use client";

import { formatPaise, type BusinessTypeConfig, type Paise } from "@vyora/core";
import { Badge, Card, EmptyState } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listProducts,
  salesByProduct,
  type ProductRow,
  type ProductSales,
} from "~/lib/db/repository";

/**
 * Dead-Stock & Expiry Radar (route: /stock-radar) — a Vyora Edge feature.
 *
 * The big apps show stock; none tell you which stock is quietly losing you
 * money. This flags items with stock on hand that haven't sold recently, totals
 * the capital stuck, and suggests a clearance discount by how stale each item is
 * — so a shop can act before it becomes a write-off. Computed offline from
 * Products and the sales history.
 */

const SLOW_DAYS = 30;
const DEAD_DAYS = 90;

const rupee = (p: number) => formatPaise(p as Paise);

function daysSince(dateISO: string | null): number | null {
  if (!dateISO) return null;
  const a = new Date(dateISO + "T00:00:00Z").getTime();
  const b = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

interface Row {
  product: ProductRow;
  onHand: number;
  valueAtRisk: number;
  lastSold: string | null;
  days: number | null;
  severity: "dead" | "slow" | "ok";
  discountPct: number;
}

export function StockRadarModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [sales, setSales] = useState<ProductSales[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([listProducts(orgId, 1000), salesByProduct(orgId)]);
      setProducts(p);
      setSales(s);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    if (!products) return [];
    const salesById = new Map(sales.map((s) => [s.product_id, s]));
    return products
      .filter((p) => p.on_hand_milli > 0)
      .map((p) => {
        const s = salesById.get(p.id);
        const last = s?.last_sold ?? null;
        const days = daysSince(last);
        const onHand = p.on_hand_milli / 1000;
        const valueAtRisk = Math.round((p.on_hand_milli * (p.price_paise ?? 0)) / 1000);
        const neverSold = !s || s.sale_count === 0;
        const severity: Row["severity"] =
          neverSold || (days !== null && days >= DEAD_DAYS) ? "dead" : days !== null && days >= SLOW_DAYS ? "slow" : "ok";
        const discountPct = severity === "dead" ? 25 : severity === "slow" ? 10 : 0;
        return { product: p, onHand, valueAtRisk, lastSold: last, days, severity, discountPct };
      })
      .filter((r) => r.severity !== "ok")
      .sort((a, b) => b.valueAtRisk - a.valueAtRisk);
  }, [products, sales]);

  const totalAtRisk = rows.reduce((n, r) => n + r.valueAtRisk, 0);
  const deadCount = rows.filter((r) => r.severity === "dead").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Stock Radar</h1>
          <p className="text-body text-content-muted">
            Dead and slow-moving stock, the money it&apos;s locking up, and what to do about it.
          </p>
        </div>
        <Badge tone="primary">Vyora Edge</Badge>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Capital stuck" value={rupee(totalAtRisk)} tone="warning" />
        <Kpi label="Dead items" value={String(deadCount)} tone="danger" />
        <Kpi label="Slow / dead lines" value={String(rows.length)} />
      </div>

      {products === null ? (
        <p className="text-body text-content-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Stock is moving well" description="Nothing is sitting idle — no dead or slow stock right now." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-border text-caption uppercase text-content-muted">
                <th className="p-3">Item</th>
                <th className="p-3 text-right">On hand</th>
                <th className="p-3 text-right">Value stuck</th>
                <th className="p-3 text-right">Last sold</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Suggested action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.product.id}>
                  <td className="p-3 font-medium">{r.product.name}</td>
                  <td className="p-3 text-right font-mono">{r.onHand}</td>
                  <td className="p-3 text-right font-mono">{rupee(r.valueAtRisk)}</td>
                  <td className="p-3 text-right text-content-muted">{r.days === null ? "never" : `${r.days}d ago`}</td>
                  <td className="p-3 text-center">
                    <Badge tone={r.severity === "dead" ? "danger" : "warning"}>{r.severity === "dead" ? "Dead" : "Slow"}</Badge>
                  </td>
                  <td className="p-3 text-right text-content-muted">
                    {r.discountPct > 0 ? `Clear at ${r.discountPct}% off` : "Watch"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-caption normal-case text-content-muted">
        {config?.reports.includes("Expiry alerts")
          ? "Your trade also tracks expiry — batch/expiry captured at billing will surface here as near-expiry alerts."
          : "“Slow” = no sale in 30+ days, “Dead” = 90+ days or never sold. Suggested discounts are a starting point, not a rule."}
      </p>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
      <span className="text-caption font-medium uppercase text-content-muted">{label}</span>
      <span className={"font-mono text-h2 " + (tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "")}>{value}</span>
    </div>
  );
}
