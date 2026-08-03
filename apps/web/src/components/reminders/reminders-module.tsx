"use client";

import { formatPaise, type Paise } from "@vyora/core";
import { Badge, Card, EmptyState } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

import {
  getSetting,
  listOverdueInvoices,
  type OverdueInvoiceRow,
} from "~/lib/db/repository";

/**
 * Payment reminders — the "who owes me money" screen with a one-tap chase.
 *
 * Reads the same unpaid-invoice data Payments uses, joins the customer, and
 * turns each row into a ready-to-send WhatsApp reminder (the channel Indian
 * shops actually collect on). Fully offline: the list always renders; only the
 * send itself needs the network.
 */

function daysSince(ymd: string): number {
  const then = new Date(`${ymd}T00:00:00`);
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86_400_000));
}

export function RemindersModule({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<OverdueInvoiceRow[] | null>(null);
  const [shopName, setShopName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await listOverdueInvoices(orgId));
      setShopName((await getSetting("shop_name")) ?? "");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function remind(row: OverdueInvoiceRow) {
    const due = row.total_paise - row.amount_paid_paise;
    const days = daysSince(row.date);
    const text =
      `Hello ${row.customer_name ?? "Customer"},\n\n` +
      `A gentle reminder: invoice ${row.number ?? ""} dated ${row.date} has ` +
      `${formatPaise(due as Paise)} pending${days > 0 ? ` (${days} days)` : ""}.\n\n` +
      `Kindly arrange the payment at your convenience. Thank you!` +
      (shopName ? `\n— ${shopName}` : "");
    const phone = row.customer_phone?.replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noreferrer");
  }

  const totalDue = (rows ?? []).reduce(
    (sum, r) => sum + (r.total_paise - r.amount_paid_paise),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Payment Reminders</h1>
          <p className="text-body text-content-muted">
            Every unpaid invoice, oldest first — send a polite WhatsApp reminder
            in one tap.
          </p>
        </div>
        {rows && rows.length > 0 ? (
          <div className="flex flex-col items-end">
            <span className="text-caption normal-case text-content-muted">Total pending</span>
            <span className="font-mono text-h3">{formatPaise(totalDue as Paise)}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p className="text-body text-content-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing pending 🎉"
          description="Every invoice is fully paid. New unpaid invoices will appear here automatically."
        />
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((r) => {
            const due = r.total_paise - r.amount_paid_paise;
            const days = daysSince(r.date);
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex flex-col">
                  <span className="text-body font-medium">
                    {r.customer_name ?? "Walk-in customer"}
                  </span>
                  <span className="text-caption normal-case text-content-muted">
                    {r.number ?? "—"} · {r.date}
                    {r.customer_phone ? ` · ${r.customer_phone}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {days >= 30 ? (
                    <Badge tone="danger">{days}d overdue</Badge>
                  ) : days >= 7 ? (
                    <Badge tone="warning">{days}d</Badge>
                  ) : null}
                  <span className="font-mono text-body-lg">{formatPaise(due as Paise)}</span>
                  <button
                    onClick={() => remind(r)}
                    className="rounded-control bg-primary px-4 py-2 text-body font-medium text-white hover:opacity-90"
                  >
                    Remind on WhatsApp
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
