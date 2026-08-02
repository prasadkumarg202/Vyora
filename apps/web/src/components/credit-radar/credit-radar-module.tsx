"use client";

import { formatPaise, type BusinessTypeConfig, type Paise } from "@vyora/core";
import { Badge, Card, EmptyState } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listCustomers,
  listInvoices,
  listOutstandingInvoices,
  type CustomerRow,
  type InvoiceRow,
  type OutstandingInvoiceRow,
} from "~/lib/db/repository";

/**
 * Credit Radar / Bharosa Score (route: /credit-radar) — a Vyora Edge feature.
 *
 * Every shop gives udhaar; none of the big apps tell you *how much is safe*.
 * This scores each customer 0–100 from their real payment history on this device
 * — how much they've cleared vs what they owe, and how old the oldest due is —
 * and recommends a credit limit. One tap sends a WhatsApp reminder with the
 * amount. All computed offline from the same ledger Sales and Payments write.
 */

interface Scored {
  customer: CustomerRow;
  billed: number;
  due: number;
  agingDays: number;
  invoiceCount: number;
  score: number;
  limit: number;
}

function agingDays(dateISO: string): number {
  const a = new Date(dateISO + "T00:00:00Z").getTime();
  const b = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

const rupee = (p: number) => formatPaise(p as Paise);

export function CreditRadarModule({
  orgId,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingInvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, i, o] = await Promise.all([
        listCustomers(orgId, 1000),
        listInvoices(orgId, 1000),
        listOutstandingInvoices(orgId, 1000),
      ]);
      setCustomers(c);
      setInvoices(i);
      setOutstanding(o);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const scored = useMemo<Scored[]>(() => {
    if (!customers) return [];
    const custByInvoice = new Map(invoices.map((i) => [i.id, i.customer_id]));
    // Aggregate per customer.
    return customers
      .map((c) => {
        const custInvoices = invoices.filter((i) => i.customer_id === c.id);
        const billed = custInvoices.reduce((n, i) => n + i.total_paise, 0);
        const custOut = outstanding.filter((o) => custByInvoice.get(o.id) === c.id);
        const due = custOut.reduce((n, o) => n + (o.total_paise - o.amount_paid_paise), 0);
        const oldest = custOut.reduce<string | null>((min, o) => (!min || o.date < min ? o.date : min), null);
        const aging = oldest ? agingDays(oldest) : 0;
        const paid = Math.max(0, billed - due);
        const paidRatio = billed > 0 ? paid / billed : 1;
        const agingPenalty = Math.min(45, aging / 2);
        const raw = billed === 0 ? 60 : Math.round(100 * paidRatio - agingPenalty);
        const score = Math.max(0, Math.min(100, raw));
        const avgTicket = custInvoices.length ? billed / custInvoices.length : 0;
        const limit = Math.round(avgTicket * (score / 100) * 3);
        return { customer: c, billed, due, agingDays: aging, invoiceCount: custInvoices.length, score, limit };
      })
      .sort((a, b) => b.due - a.due || a.score - b.score);
  }, [customers, invoices, outstanding]);

  const totalReceivable = scored.reduce((n, s) => n + s.due, 0);
  const withDues = scored.filter((s) => s.due > 0).length;

  function remind(s: Scored) {
    const phone = s.customer.phone?.replace(/\D/g, "");
    const text = `Hello ${s.customer.name}, a gentle reminder that ${rupee(s.due)} is outstanding on your account. Kindly clear it at your convenience. Thank you!`;
    const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noreferrer");
  }

  const tone = (score: number): "success" | "warning" | "danger" => (score >= 75 ? "success" : score >= 50 ? "warning" : "danger");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Credit Radar</h1>
          <p className="text-body text-content-muted">
            A Bharosa score and a safe udhaar limit for every customer — from their own payment history.
          </p>
        </div>
        <Badge tone="primary">Vyora Edge</Badge>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Total receivable" value={rupee(totalReceivable)} tone="warning" />
        <Kpi label="Customers with dues" value={String(withDues)} />
        <Kpi label="Customers" value={String(scored.length)} />
      </div>

      {customers === null ? (
        <p className="text-body text-content-muted">Loading…</p>
      ) : scored.length === 0 ? (
        <EmptyState title="No customers yet" description="Add customers and bill them — their scores build automatically." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-body">
            <thead>
              <tr className="border-b border-border text-caption uppercase text-content-muted">
                <th className="p-3">Customer</th>
                <th className="p-3 text-right">Billed</th>
                <th className="p-3 text-right">Outstanding</th>
                <th className="p-3 text-right">Oldest due</th>
                <th className="p-3 text-center">Bharosa</th>
                <th className="p-3 text-right">Safe limit</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {scored.map((s) => (
                <tr key={s.customer.id}>
                  <td className="p-3 font-medium">{s.customer.name}</td>
                  <td className="p-3 text-right font-mono text-content-muted">{rupee(s.billed)}</td>
                  <td className="p-3 text-right font-mono">{s.due > 0 ? rupee(s.due) : "—"}</td>
                  <td className="p-3 text-right">
                    {s.due > 0 ? <Badge tone={s.agingDays > 30 ? "danger" : s.agingDays > 7 ? "warning" : "neutral"}>{s.agingDays}d</Badge> : "—"}
                  </td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-pill bg-canvas">
                        <span className="block h-full rounded-pill" style={{ width: `${s.score}%`, backgroundColor: s.score >= 75 ? "oklch(0.62 0.17 150)" : s.score >= 50 ? "oklch(0.7 0.16 75)" : "oklch(0.58 0.22 25)" }} />
                      </span>
                      <Badge tone={tone(s.score)}>{s.score}</Badge>
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono">{rupee(s.limit)}</td>
                  <td className="p-3 text-right">
                    {s.due > 0 ? (
                      <button onClick={() => remind(s)} className="text-caption font-medium text-primary hover:underline">Remind</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-caption normal-case text-content-muted">
        Score = how much they&apos;ve cleared vs what they owe, minus a penalty for how long dues have aged. New customers start neutral. Guidance only — you decide.
      </p>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
      <span className="text-caption font-medium uppercase text-content-muted">{label}</span>
      <span className={"font-mono text-h2 " + (tone === "warning" ? "text-warning" : "")}>{value}</span>
    </div>
  );
}
