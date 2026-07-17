"use client";

import { formatPaise, type Paise, rupeesToPaise } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

import {
  listOutstandingInvoices,
  listPayments,
  recordInvoicePayment,
  type OutstandingInvoiceRow,
  type PaymentRow,
} from "~/lib/db/repository";

/**
 * The Payments module — money in against invoices.
 *
 * Recording a payment updates the invoice's running paid amount and recomputes
 * its status in one transaction, so "paid" means the money actually adds up to
 * the total. This closes the loop from Sales: an invoice raised there becomes
 * outstanding here, and settles as it is paid off.
 */

export function PaymentsModule({ orgId, userId }: { orgId: string; userId: string }) {
  const [outstanding, setOutstanding] = useState<OutstandingInvoiceRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [inv, pays] = await Promise.all([
        listOutstandingInvoices(orgId),
        listPayments(orgId),
      ]);
      setOutstanding(inv);
      setPayments(pays);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function pay(inv: OutstandingInvoiceRow, full: boolean) {
    const due = inv.total_paise - inv.amount_paid_paise;
    const amountPaise = full
      ? (due as Paise)
      : clampPaise(amounts[inv.id] ?? "", due);
    if (amountPaise <= 0) return;

    setBusy(inv.id);
    setError(null);
    try {
      await recordInvoicePayment({
        orgId,
        invoiceId: inv.id,
        amountPaise,
        method: "cash",
        createdBy: userId,
      });
      setAmounts((a) => ({ ...a, [inv.id]: "" }));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Payments</h1>
        <p className="text-body text-content-muted">
          Collect against invoices — updates on this device instantly.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Outstanding</h2>
        {outstanding === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : outstanding.length === 0 ? (
          <EmptyState
            title="Nothing outstanding"
            description="Every invoice is settled. Raise one in Sales and it will appear here to collect."
          />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="outstanding-list">
            {outstanding.map((inv) => {
              const due = inv.total_paise - inv.amount_paid_paise;
              return (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="outstanding-row">
                  <div className="flex flex-col">
                    <span className="text-body font-medium">{inv.number}</span>
                    <span className="text-caption normal-case text-content-muted">
                      {inv.status === "partial" ? (
                        <>
                          Paid {formatPaise(inv.amount_paid_paise as Paise)} of{" "}
                          {formatPaise(inv.total_paise as Paise)}
                        </>
                      ) : (
                        <>Total {formatPaise(inv.total_paise as Paise)}</>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-body-lg" data-testid="due">
                      {formatPaise(due as Paise)}
                    </span>
                    <Input
                      inputMode="decimal"
                      aria-label={`Amount for ${inv.number}`}
                      value={amounts[inv.id] ?? ""}
                      onChange={(e) =>
                        setAmounts((a) => ({ ...a, [inv.id]: e.target.value.replace(/[^\d.]/g, "") }))
                      }
                      placeholder="Part ₹"
                      className="w-24 text-right font-mono"
                    />
                    <Button variant="outline" size="sm" disabled={busy === inv.id} onClick={() => pay(inv, false)} data-testid="pay-part">
                      Pay part
                    </Button>
                    <Button size="sm" disabled={busy === inv.id} onClick={() => pay(inv, true)} data-testid="pay-full">
                      {busy === inv.id ? "…" : "Pay full"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Recent payments</h2>
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" description="Collected payments appear here." />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="payment-list">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 p-4" data-testid="payment-row">
                <div className="flex flex-col">
                  <span className="text-body font-medium capitalize">{p.method}</span>
                  <span className="text-caption normal-case text-content-muted">{p.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  {p.dirty ? <Badge tone="warning" dot>Unsynced</Badge> : null}
                  <span className="font-mono text-body-lg text-success">
                    +{formatPaise(p.amount_paise as Paise)}
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

/** Parse a rupee string to paise, capped at the amount due. */
function clampPaise(rupees: string, duePaise: number): Paise {
  const n = Number(rupees.trim());
  if (!Number.isFinite(n) || n <= 0) return 0 as Paise;
  try {
    const paise = rupeesToPaise(Math.round(n * 100) / 100);
    return Math.min(paise, duePaise) as Paise;
  } catch {
    return 0 as Paise;
  }
}
