"use client";

import { formatPaise, type BusinessTypeConfig, type Paise } from "@vyora/core";
import { Badge, Card, EmptyState } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  expensesSummary,
  listExpenses,
  listInvoices,
  listPayments,
  listPurchases,
  reportsSummary,
  type ExpensesSummary,
  type ReportsSummary,
} from "~/lib/db/repository";

/**
 * Accounting (route: /accounting) — the day book and a plain-English P&L.
 *
 * No new numbers are invented: Sales, Purchases, Payments and Expenses each
 * already wrote money-exact rows to the local ledger, so this screen just merges
 * them into a chronological day book and nets them into a monthly profit view.
 * Because it reads the same source as every module, it can never disagree with
 * them — and it works offline like everything else.
 */

interface Entry {
  date: string;
  kind: "Sales" | "Purchase" | "Payment in" | "Payment out" | "Expense";
  label: string;
  amountPaise: number;
  inflow: boolean;
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function AccountingModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpensesSummary | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monthLabel = useMemo(
    () => new Date().toLocaleString("en-IN", { month: "long", year: "numeric" }),
    [],
  );

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const today = ymd(now);

      const [rep, exp, invoices, purchases, payments, expenseRows] = await Promise.all([
        reportsSummary(orgId, monthStart, today),
        expensesSummary(orgId, monthStart, monthEnd),
        listInvoices(orgId, 40),
        listPurchases(orgId, 40),
        listPayments(orgId, 40),
        listExpenses(orgId, 40),
      ]);

      const merged: Entry[] = [
        ...invoices.map((i) => ({
          date: i.date,
          kind: "Sales" as const,
          label: i.number ?? "Invoice",
          amountPaise: i.total_paise,
          inflow: true,
        })),
        ...purchases.map((p) => ({
          date: p.date,
          kind: "Purchase" as const,
          label: p.number ?? "Purchase",
          amountPaise: p.total_paise,
          inflow: false,
        })),
        ...payments.map((p) => ({
          date: p.date,
          kind: p.direction === "in" ? ("Payment in" as const) : ("Payment out" as const),
          label: `${p.method} payment`,
          amountPaise: p.amount_paise,
          inflow: p.direction === "in",
        })),
        ...expenseRows.map((e) => ({
          date: e.date,
          kind: "Expense" as const,
          label: e.category ?? e.note ?? "Expense",
          amountPaise: e.amount_paise,
          inflow: false,
        })),
      ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      setSummary(rep);
      setExpenses(exp);
      setEntries(merged.slice(0, 40));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pl = useMemo(() => {
    if (!summary || !expenses) return null;
    const revenue = summary.salesPaise;
    const purchases = summary.purchasesPaise;
    const gross = revenue - purchases;
    const net = gross - expenses.totalPaise;
    return { revenue, purchases, gross, expenses: expenses.totalPaise, net };
  }, [summary, expenses]);

  const rupee = (p: number) => formatPaise(p as Paise);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Accounting</h1>
          <p className="text-body text-content-muted">
            {monthLabel} · day book and profit, summed from your ledger. Works offline.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      {/* P&L */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-h3">Profit &amp; loss · {monthLabel}</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-body">
          <dt className="text-content-muted">Revenue (sales)</dt>
          <dd className="text-right font-mono">{pl ? rupee(pl.revenue) : "—"}</dd>
          <dt className="text-content-muted">Purchases</dt>
          <dd className="text-right font-mono">− {pl ? rupee(pl.purchases) : "—"}</dd>
          <dt className="border-t border-border pt-2 font-medium">Gross</dt>
          <dd className="border-t border-border pt-2 text-right font-mono font-medium">{pl ? rupee(pl.gross) : "—"}</dd>
          <dt className="text-content-muted">Expenses</dt>
          <dd className="text-right font-mono">− {pl ? rupee(pl.expenses) : "—"}</dd>
          <dt className="border-t border-border pt-2 text-body-lg font-semibold">
            {pl && pl.net >= 0 ? "Net profit" : "Net loss"}
          </dt>
          <dd
            className={
              "border-t border-border pt-2 text-right font-mono text-body-lg font-semibold " +
              (pl && pl.net < 0 ? "text-danger" : "text-success")
            }
            data-testid="net-profit"
          >
            {pl ? rupee(Math.abs(pl.net)) : "—"}
          </dd>
        </dl>
        <p className="text-caption normal-case text-content-muted">
          A cash-basis view for the shop owner. Ledger-grade journals and a chart
          of accounts build on these same entries.
        </p>
      </Card>

      {/* Day book */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Day book</h2>
        {entries === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No entries yet"
            description="Bill a sale, record a purchase, payment or expense — it lands here automatically."
          />
        ) : (
          <Card className="p-0" data-testid="day-book">
            <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-caption font-medium uppercase text-content-muted">
              <span className="col-span-2">Date</span>
              <span className="col-span-3">Type</span>
              <span className="col-span-4">Detail</span>
              <span className="col-span-3 text-right">Amount</span>
            </div>
            <div className="divide-y divide-border">
              {entries.map((e, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                  <span className="col-span-2 font-mono text-caption text-content-muted">{e.date}</span>
                  <span className="col-span-3">
                    <Badge tone={e.inflow ? "success" : "neutral"}>{e.kind}</Badge>
                  </span>
                  <span className="col-span-4 truncate text-body">{e.label}</span>
                  <span
                    className={
                      "col-span-3 text-right font-mono text-body " +
                      (e.inflow ? "text-success" : "text-content")
                    }
                  >
                    {e.inflow ? "+" : "−"} {rupee(e.amountPaise)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
