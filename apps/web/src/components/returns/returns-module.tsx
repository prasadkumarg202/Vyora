"use client";

import { formatPaise, type Paise } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getInvoicePrintData,
  listInvoices,
  listSaleDocuments,
  nextDocumentNumber,
  saveSaleReturn,
  type InvoiceItemRow,
  type InvoiceRow,
  type SaleDocumentRow,
} from "~/lib/db/repository";

/**
 * Returns Desk — goods coming back, handled honestly.
 *
 * A return is three things at once, and shops get burned when an app does only
 * one of them: paperwork the customer can hold (a GST credit note), stock that
 * is genuinely back on the shelf, and money the customer no longer owes. Saving
 * here does all three in a single transaction, so Inventory, Payments and
 * Reminders can never disagree about a return.
 *
 * Part-returns are the normal case — two of five packets came back — so every
 * line carries its own quantity rather than assuming the whole bill reversed.
 */

const milliToQty = (milli: number): string => {
  const n = milli / 1000;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
};

interface ReturnLine {
  item: InvoiceItemRow;
  qty: string;
}

export function ReturnsModule({ orgId, userId }: { orgId: string; userId: string }) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>("");
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<SaleDocumentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [inv, credits] = await Promise.all([
        listInvoices(orgId, 100),
        listSaleDocuments(orgId, "return"),
      ]);
      setInvoices(inv);
      setNotes(credits);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Pull the chosen bill's lines in, each defaulting to a full return. */
  async function loadInvoice(id: string) {
    setInvoiceId(id);
    setLines([]);
    setCustomerId(null);
    setCustomerName("");
    if (!id) return;
    setBusy(true);
    try {
      const data = await getInvoicePrintData(orgId, id);
      setLines(data.items.map((item) => ({ item, qty: milliToQty(item.qty_milli) })));
      setCustomerId(data.customer?.id ?? null);
      setCustomerName(data.customer?.name ?? "Walk-in customer");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Per-line credit, priced exactly as the original bill priced it. */
  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    const priced = lines.map((l) => {
      const qty = Number(l.qty || "0");
      const original = l.item.qty_milli / 1000;
      const capped = Math.min(Math.max(qty, 0), original);
      const taxable = Math.round(capped * l.item.rate_paise);
      const lineTax = Math.round((taxable * l.item.tax_bps) / 10000);
      subtotal += taxable;
      tax += lineTax;
      return { line: l, capped, taxable, lineTax, total: taxable + lineTax };
    });
    return { priced, subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const returning = totals.priced.filter((p) => p.capped > 0);

  async function handleSave() {
    if (!invoiceId || returning.length === 0) {
      setError("Choose a bill and set a quantity on at least one line.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const number = await nextDocumentNumber(orgId, "return");
      await saveSaleReturn({
        orgId,
        invoiceId,
        customerId,
        number,
        note: note.trim() || undefined,
        createdBy: userId,
        subtotalPaise: totals.subtotal as Paise,
        taxPaise: totals.tax as Paise,
        totalPaise: totals.total as Paise,
        items: returning.map((p) => ({
          description: p.line.item.description ?? "Item",
          productId: p.line.item.product_id ?? undefined,
          qtyMilli: Math.round(p.capped * 1000),
          ratePaise: p.line.item.rate_paise as Paise,
          taxBps: p.line.item.tax_bps,
          amountPaise: p.total as Paise,
          meta: p.line.item.meta,
        })),
      });
      setFlash(`${number} recorded — stock restored and ${formatPaise(totals.total as Paise)} credited.`);
      window.setTimeout(() => setFlash(null), 4000);
      setInvoiceId("");
      setLines([]);
      setNote("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Returns Desk</h1>
        <p className="text-body text-content-muted">
          When goods come back: raise the credit note, put the stock back and
          clear what the customer owes — in one step.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}
      {flash ? <p className="text-body text-success">{flash}</p> : null}

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-h3">New return</h2>

        <div className="flex flex-col gap-1 sm:max-w-md">
          <Label htmlFor="ret-invoice">Which bill is coming back?</Label>
          <select
            id="ret-invoice"
            value={invoiceId}
            onChange={(e) => void loadInvoice(e.target.value)}
            className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
          >
            <option value="">Select an invoice…</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number ?? "—"} · {i.date} · {formatPaise(i.total_paise as Paise)}
              </option>
            ))}
          </select>
          {customerName ? (
            <span className="text-caption normal-case text-content-muted">
              Customer: {customerName}
            </span>
          ) : null}
        </div>

        {lines.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body">
                <thead>
                  <tr>
                    <th className="border-b border-border px-2 py-1 text-caption font-semibold uppercase text-content-muted">Item</th>
                    <th className="border-b border-border px-2 py-1 text-caption font-semibold uppercase text-content-muted">Sold</th>
                    <th className="border-b border-border px-2 py-1 text-caption font-semibold uppercase text-content-muted">Rate</th>
                    <th className="border-b border-border px-2 py-1 text-caption font-semibold uppercase text-content-muted">Coming back</th>
                    <th className="border-b border-border px-2 py-1 text-right text-caption font-semibold uppercase text-content-muted">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.priced.map((p, i) => (
                    <tr key={p.line.item.id}>
                      <td className="border-b border-border px-2 py-2">
                        {p.line.item.description ?? "Item"}
                      </td>
                      <td className="border-b border-border px-2 py-2 font-mono">
                        {milliToQty(p.line.item.qty_milli)}
                      </td>
                      <td className="border-b border-border px-2 py-2 font-mono">
                        {formatPaise(p.line.item.rate_paise as Paise)}
                      </td>
                      <td className="border-b border-border px-2 py-2">
                        <Input
                          aria-label={`Quantity returned, line ${i + 1}`}
                          inputMode="decimal"
                          className="w-24 text-right font-mono"
                          value={p.line.qty}
                          onChange={(e) =>
                            setLines((ls) =>
                              ls.map((l) =>
                                l.item.id === p.line.item.id
                                  ? { ...l, qty: e.target.value.replace(/[^\d.]/g, "") }
                                  : l,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="border-b border-border px-2 py-2 text-right font-mono">
                        {formatPaise(p.total as Paise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-1 sm:max-w-md">
              <Label htmlFor="ret-note">Reason (optional)</Label>
              <Input
                id="ret-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Damaged in transit, wrong size, expired…"
              />
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <div className="flex items-baseline justify-between text-body text-content-muted">
                <span>Taxable value</span>
                <span className="font-mono">{formatPaise(totals.subtotal as Paise)}</span>
              </div>
              <div className="flex items-baseline justify-between text-body text-content-muted">
                <span>GST reversed</span>
                <span className="font-mono">{formatPaise(totals.tax as Paise)}</span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-body font-semibold">Total credit</span>
                <span className="font-mono text-h3">{formatPaise(totals.total as Paise)}</span>
              </div>
            </div>

            <p className="text-caption normal-case text-content-muted">
              Saving puts {returning.length} line{returning.length === 1 ? "" : "s"} back
              into stock and credits the customer against this bill. Paying cash
              back instead? Record that as a payment out in Payments.
            </p>

            <Button onClick={handleSave} disabled={busy || returning.length === 0}>
              {busy ? "Saving…" : "Record return & credit note"}
            </Button>
          </>
        ) : invoiceId && !busy ? (
          <p className="text-body text-content-muted">That bill has no lines to return.</p>
        ) : null}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Credit notes issued</h2>
        {notes === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : notes.length === 0 ? (
          <EmptyState
            title="No returns yet"
            description="Nothing has come back so far. When it does, the credit note, the stock and the customer's balance are handled together."
          />
        ) : (
          <Card className="divide-y divide-border p-0">
            {notes.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex flex-col">
                  <span className="text-body font-medium">{n.number}</span>
                  <span className="text-caption normal-case text-content-muted">{n.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  {n.dirty ? (
                    <Badge tone="warning" dot>
                      Unsynced
                    </Badge>
                  ) : null}
                  <span className="font-mono text-body-lg">
                    {formatPaise(n.total_paise as Paise)}
                  </span>
                  {n.ref_invoice_id ? (
                    <Link
                      href={`/invoice/${n.ref_invoice_id}`}
                      className="text-caption font-medium text-primary hover:underline"
                    >
                      Original bill
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
