"use client";

import { formatPaise, rupeesToPaise, type Paise } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  convertDocumentToInvoice,
  listCustomers,
  listSaleDocuments,
  nextDocumentNumber,
  saveSaleDocument,
  type CustomerRow,
  type SaleDocType,
  type SaleDocumentRow,
} from "~/lib/db/repository";

/**
 * Offers & Orders — everything that comes before the bill.
 *
 * Quotations, proforma bills, order bookings and delivery notes are the same
 * document wearing four hats, so they share one screen and one table. None of
 * them is revenue: a quotation must never show up in sales, GST or outstanding,
 * which is exactly why they live apart from invoices. The one action that
 * matters is Convert — the lines become a real invoice in a single tap, and
 * from that moment it behaves like any other sale.
 *
 * Local-first like everything else: saves offline, syncs when connected.
 */

interface DraftLine {
  key: string;
  description: string;
  qty: string;
  rate: string;
  gst: string;
}

const blank = (): DraftLine => ({
  key: crypto.randomUUID(),
  description: "",
  qty: "1",
  rate: "",
  gst: "0",
});

function paiseOf(rupees: string): Paise {
  const n = Number(rupees.trim());
  if (!Number.isFinite(n) || n < 0) return 0 as Paise;
  try {
    return rupeesToPaise(Math.round(n * 100) / 100);
  } catch {
    return 0 as Paise;
  }
}

/**
 * Four kinds of paperwork that all end the same way — as an invoice. They differ
 * only in what the shop is promising: a price, a bill in advance, a booking, or
 * goods already on their way.
 */
const TABS: {
  type: SaleDocType;
  label: string;
  noun: string;
  blurb: string;
}[] = [
  {
    type: "estimate",
    label: "Quotation",
    noun: "quotation",
    blurb: "A price offered, nothing committed. Send it and follow up.",
  },
  {
    type: "proforma",
    label: "Proforma bill",
    noun: "proforma bill",
    blurb: "A bill raised before supply — for advances, exports and approvals.",
  },
  {
    type: "order",
    label: "Order booking",
    noun: "order",
    blurb: "The customer has said yes. Goods still to go out.",
  },
  {
    type: "challan",
    label: "Delivery note",
    noun: "delivery note",
    blurb: "Goods moving now, the bill following later.",
  },
];

export function QuotesModule({ orgId, userId }: { orgId: string; userId: string }) {
  const [docType, setDocType] = useState<SaleDocType>("estimate");
  const [docs, setDocs] = useState<SaleDocumentRow[] | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDocs(await listSaleDocuments(orgId, docType));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId, docType]);

  useEffect(() => {
    setDocs(null);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void listCustomers(orgId).then(setCustomers).catch(() => {});
  }, [orgId]);

  const tab = TABS.find((t) => t.type === docType)!;

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const qty = Number(l.qty || "0");
      const rate = paiseOf(l.rate);
      if (qty <= 0 || rate <= 0) continue;
      const amount = Math.round(qty * rate);
      const bps = Math.round(Number(l.gst || "0") * 100);
      subtotal += amount;
      tax += Math.round((amount * bps) / 10000);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function handleSave() {
    const active = lines.filter(
      (l) => l.description.trim() && Number(l.qty) > 0 && paiseOf(l.rate) > 0,
    );
    if (active.length === 0) {
      setError("Add at least one line with a description, qty and rate.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const number = await nextDocumentNumber(orgId, docType);
      await saveSaleDocument({
        id: crypto.randomUUID(),
        orgId,
        docType,
        number,
        date: new Date().toISOString().slice(0, 10),
        customerId: customerId || undefined,
        createdBy: userId,
        subtotalPaise: totals.subtotal as Paise,
        taxPaise: totals.tax as Paise,
        totalPaise: totals.total as Paise,
        items: active.map((l) => {
          const qty = Number(l.qty);
          const rate = paiseOf(l.rate);
          const amount = Math.round(qty * rate);
          const bps = Math.round(Number(l.gst || "0") * 100);
          return {
            description: l.description.trim(),
            qtyMilli: Math.round(qty * 1000),
            ratePaise: rate,
            taxBps: bps,
            amountPaise: (amount + Math.round((amount * bps) / 10000)) as Paise,
          };
        }),
      });
      setLines([blank()]);
      setCustomerId("");
      setFlash(`${number} saved.`);
      window.setTimeout(() => setFlash(null), 2500);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConvert(doc: SaleDocumentRow) {
    setBusy(true);
    setError(null);
    try {
      const invoiceId = await convertDocumentToInvoice({
        orgId,
        documentId: doc.id,
        createdBy: userId,
      });
      setFlash(invoiceId ? `${doc.number ?? "Document"} converted to invoice.` : "Already converted.");
      window.setTimeout(() => setFlash(null), 2500);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function shareWhatsApp(doc: SaleDocumentRow) {
    const cust = customers.find((c) => c.id === doc.customer_id);
    const phone = cust?.phone?.replace(/\D/g, "");
    const noun =
      TABS.find((t) => t.type === doc.doc_type)?.noun ?? "document";
    const text = `Hello ${cust?.name ?? "Customer"},\n\nHere is your ${noun} ${doc.number ?? ""} for ${formatPaise(doc.total_paise as Paise)} dated ${doc.date}.\n\nThank you!`;
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noreferrer");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Offers &amp; Orders</h1>
        <p className="text-body text-content-muted">
          Everything that comes before the bill — quote a price, raise a
          proforma, book an order, send goods out. Each one becomes a GST
          invoice the moment it should.
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => setDocType(t.type)}
            className={
              "rounded-control px-4 py-2 text-body font-medium " +
              (docType === t.type
                ? "bg-primary text-white"
                : "border border-border bg-surface text-content-muted hover:text-primary")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-body text-content-muted">{tab.blurb}</p>

      {/* New document */}
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-h3">New {tab.noun}</h2>

        <div className="flex flex-col gap-1 sm:max-w-xs">
          <Label htmlFor="doc-customer">Customer (optional)</Label>
          <select
            id="doc-customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
          >
            <option value="">Walk-in / not selected</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={l.key} className="grid grid-cols-2 gap-3 rounded-card border border-border p-4 sm:grid-cols-5">
              <div className="col-span-2 flex flex-col gap-1">
                <Label htmlFor={`d-${l.key}`}>Description *</Label>
                <Input id={`d-${l.key}`} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder={`Item ${i + 1}`} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`q-${l.key}`}>Qty *</Label>
                <Input id={`q-${l.key}`} inputMode="decimal" className="text-right font-mono" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[^\d.]/g, "") })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`r-${l.key}`}>Rate *</Label>
                <Input id={`r-${l.key}`} inputMode="decimal" className="text-right font-mono" placeholder="0.00" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value.replace(/[^\d.]/g, "") })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`g-${l.key}`}>GST %</Label>
                <div className="flex items-center gap-2">
                  <Input id={`g-${l.key}`} inputMode="decimal" className="text-right font-mono" value={l.gst} onChange={(e) => setLine(l.key, { gst: e.target.value.replace(/[^\d.]/g, "") })} />
                  {lines.length > 1 ? (
                    <Button variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      ✕
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
            + Add line
          </Button>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-baseline justify-between text-body text-content-muted">
            <span>Subtotal</span>
            <span className="font-mono">{formatPaise(totals.subtotal as Paise)}</span>
          </div>
          <div className="flex items-baseline justify-between text-body text-content-muted">
            <span>GST</span>
            <span className="font-mono">{formatPaise(totals.tax as Paise)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-body font-semibold">Total</span>
            <span className="font-mono text-h3">{formatPaise(totals.total as Paise)}</span>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
            {error}
          </p>
        ) : null}
        {flash ? <p className="text-body text-success">{flash}</p> : null}

        <Button onClick={handleSave} disabled={busy}>
          {busy ? "Saving…" : `Save ${tab.noun}`}
        </Button>
      </Card>

      {/* List */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Recent {tab.label.toLowerCase()}s</h2>
        {docs === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : docs.length === 0 ? (
          <EmptyState
            title={`No ${tab.label.toLowerCase()}s yet`}
            description="Create one above — it stays on this device, connected or not, and converts to an invoice in one tap."
          />
        ) : (
          <Card className="divide-y divide-border p-0">
            {docs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex flex-col">
                  <span className="text-body font-medium">{d.number}</span>
                  <span className="text-caption normal-case text-content-muted">{d.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  {d.dirty ? (
                    <Badge tone="warning" dot>
                      Unsynced
                    </Badge>
                  ) : null}
                  {d.status === "converted" ? (
                    <Badge tone="success">Converted</Badge>
                  ) : (
                    <Badge tone="primary">Open</Badge>
                  )}
                  <span className="font-mono text-body-lg">{formatPaise(d.total_paise as Paise)}</span>
                  <button onClick={() => shareWhatsApp(d)} className="text-caption font-medium text-primary hover:underline">
                    WhatsApp
                  </button>
                  {d.status === "open" ? (
                    <Button size="sm" onClick={() => handleConvert(d)} disabled={busy}>
                      Convert to invoice
                    </Button>
                  ) : d.converted_invoice_id ? (
                    <Link href={`/invoice/${d.converted_invoice_id}`} className="text-caption font-medium text-primary hover:underline">
                      View invoice
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
