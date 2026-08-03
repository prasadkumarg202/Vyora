"use client";

import { formatPaise, rupeesToPaise, type Paise } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  convertOrderToPurchase,
  getPurchaseDetail,
  listPurchaseDocuments,
  listPurchases,
  listSupplierPayments,
  listSuppliers,
  nextPurchaseDocNumber,
  recordSupplierPayment,
  savePurchaseDocument,
  savePurchaseReturn,
  type PurchaseDocumentRow,
  type PurchaseItemRow,
  type PurchaseRow,
  type SupplierPaymentRow,
  type SupplierRow,
} from "~/lib/db/repository";

/**
 * Supply Desk — the buying side, in one place.
 *
 * Three jobs that all point at the same supplier and would otherwise be three
 * scattered screens: order goods, send goods back, pay for goods. Each writes
 * through the ledgers the rest of the app already reads, so a supply order that
 * arrives becomes real stock, a return takes stock away and shrinks the bill,
 * and a payment shows up against the payable — with nothing to reconcile after.
 */

type Tab = "orders" | "returns" | "payments";

const TABS: { key: Tab; label: string; blurb: string }[] = [
  { key: "orders", label: "Supply orders", blurb: "Order goods from a supplier. Mark it received and the stock lands with a purchase bill." },
  { key: "returns", label: "Supplier returns", blurb: "Send goods back: the debit note, the stock leaving and the money you no longer owe." },
  { key: "payments", label: "Payments out", blurb: "Settle what you owe a supplier, in part or in full." },
];

const PAY_METHODS = ["cash", "upi", "bank", "cheque", "card"];

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
  const n = Number((rupees ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return 0 as Paise;
  try {
    return rupeesToPaise(Math.round(n * 100) / 100);
  } catch {
    return 0 as Paise;
  }
}

const milliToQty = (milli: number): string => {
  const n = milli / 1000;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
};

export function SupplyModule({ orgId, userId }: { orgId: string; userId: string }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Orders
  const [orders, setOrders] = useState<PurchaseDocumentRow[] | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blank()]);

  // Returns
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchaseId, setPurchaseId] = useState("");
  const [retLines, setRetLines] = useState<{ item: PurchaseItemRow; qty: string }[]>([]);
  const [retSupplier, setRetSupplier] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [retNote, setRetNote] = useState("");
  const [notes, setNotes] = useState<PurchaseDocumentRow[] | null>(null);

  // Payments out
  const [paySupplier, setPaySupplier] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payments, setPayments] = useState<SupplierPaymentRow[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [sup, ord, pur, ret, pay] = await Promise.all([
        listSuppliers(orgId),
        listPurchaseDocuments(orgId, "order"),
        listPurchases(orgId, 100),
        listPurchaseDocuments(orgId, "return"),
        listSupplierPayments(orgId),
      ]);
      setSuppliers(sup);
      setOrders(ord);
      setPurchases(pur);
      setNotes(ret);
      setPayments(pay);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function say(message: string) {
    setFlash(message);
    window.setTimeout(() => setFlash(null), 3500);
  }

  // ---- Supply orders -------------------------------------------------------

  const orderTotals = useMemo(() => {
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

  async function saveOrder() {
    const active = lines.filter(
      (l) => l.description.trim() && Number(l.qty) > 0 && paiseOf(l.rate) > 0,
    );
    if (active.length === 0) {
      setError("Add at least one line with a description, quantity and rate.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const number = await nextPurchaseDocNumber(orgId, "order");
      await savePurchaseDocument({
        id: crypto.randomUUID(),
        orgId,
        docType: "order",
        number,
        date: new Date().toISOString().slice(0, 10),
        supplierId: supplierId || undefined,
        createdBy: userId,
        subtotalPaise: orderTotals.subtotal as Paise,
        taxPaise: orderTotals.tax as Paise,
        totalPaise: orderTotals.total as Paise,
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
      setSupplierId("");
      say(`${number} placed.`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function receiveOrder(doc: PurchaseDocumentRow) {
    setBusy(true);
    setError(null);
    try {
      const id = await convertOrderToPurchase({ orgId, documentId: doc.id });
      say(id ? `${doc.number} received — stock added and a purchase bill created.` : "Already received.");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Supplier returns ----------------------------------------------------

  async function loadPurchase(id: string) {
    setPurchaseId(id);
    setRetLines([]);
    setRetSupplier({ id: null, name: null });
    if (!id) return;
    setBusy(true);
    try {
      const detail = await getPurchaseDetail(orgId, id);
      setRetLines(detail.items.map((item) => ({ item, qty: milliToQty(item.qty_milli) })));
      setRetSupplier({ id: detail.supplierId, name: detail.supplierName });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const retTotals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    const priced = retLines.map((l) => {
      const qty = Number(l.qty || "0");
      const original = l.item.qty_milli / 1000;
      const capped = Math.min(Math.max(qty, 0), original);
      const taxable = Math.round(capped * l.item.rate_paise);
      const lineTax = Math.round((taxable * l.item.tax_bps) / 10000);
      subtotal += taxable;
      tax += lineTax;
      return { line: l, capped, total: taxable + lineTax };
    });
    return { priced, subtotal, tax, total: subtotal + tax };
  }, [retLines]);

  const returning = retTotals.priced.filter((p) => p.capped > 0);

  async function saveReturn() {
    if (!purchaseId || returning.length === 0) {
      setError("Choose a purchase bill and set a quantity on at least one line.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const number = await nextPurchaseDocNumber(orgId, "return");
      await savePurchaseReturn({
        orgId,
        purchaseId,
        supplierId: retSupplier.id,
        number,
        note: retNote.trim() || undefined,
        createdBy: userId,
        subtotalPaise: retTotals.subtotal as Paise,
        taxPaise: retTotals.tax as Paise,
        totalPaise: retTotals.total as Paise,
        items: returning.map((p) => ({
          description: p.line.item.description ?? "Item",
          productId: p.line.item.product_id ?? undefined,
          qtyMilli: Math.round(p.capped * 1000),
          ratePaise: p.line.item.rate_paise as Paise,
          taxBps: p.line.item.tax_bps,
          amountPaise: p.total as Paise,
        })),
      });
      say(`${number} raised — stock removed and ${formatPaise(retTotals.total as Paise)} off what you owe.`);
      setPurchaseId("");
      setRetLines([]);
      setRetNote("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Payments out --------------------------------------------------------

  const payable = suppliers.find((s) => s.id === paySupplier)?.payable_paise ?? 0;

  async function payOut(full: boolean) {
    const amount = full ? (payable as Paise) : paiseOf(payAmount);
    if (!paySupplier || amount <= 0) {
      setError("Choose a supplier and an amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordSupplierPayment({
        orgId,
        supplierId: paySupplier,
        amountPaise: amount,
        method: payMethod,
        createdBy: userId,
      });
      say(`${formatPaise(amount)} paid.`);
      setPayAmount("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Supply Desk</h1>
        <p className="text-body text-content-muted">
          Ordering, returning and paying — everything that happens between you
          and a supplier.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "rounded-control border px-4 py-2 text-body font-medium transition-colors " +
              (tab === t.key
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-content-muted hover:border-primary hover:text-primary")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-body text-content-muted">{current.blurb}</p>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}
      {flash ? <p className="text-body text-success">{flash}</p> : null}

      {/* ---------- Supply orders ---------- */}
      {tab === "orders" ? (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-h3">New supply order</h2>

            <div className="flex flex-col gap-1 sm:max-w-md">
              <Label htmlFor="ord-supplier">Supplier</Label>
              <select
                id="ord-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
              >
                <option value="">Not selected</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3">
              {lines.map((l, i) => (
                <div key={l.key} className="grid grid-cols-2 gap-3 rounded-card border border-border p-4 sm:grid-cols-5">
                  <div className="col-span-2 flex flex-col gap-1">
                    <Label htmlFor={`sd-${l.key}`}>Item *</Label>
                    <Input id={`sd-${l.key}`} value={l.description} placeholder={`Item ${i + 1}`}
                      onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, description: e.target.value } : x))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`sq-${l.key}`}>Qty *</Label>
                    <Input id={`sq-${l.key}`} inputMode="decimal" className="text-right font-mono" value={l.qty}
                      onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, qty: e.target.value.replace(/[^\d.]/g, "") } : x))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`sr-${l.key}`}>Rate *</Label>
                    <Input id={`sr-${l.key}`} inputMode="decimal" className="text-right font-mono" placeholder="0.00" value={l.rate}
                      onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, rate: e.target.value.replace(/[^\d.]/g, "") } : x))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`sg-${l.key}`}>GST %</Label>
                    <div className="flex items-center gap-2">
                      <Input id={`sg-${l.key}`} inputMode="decimal" className="text-right font-mono" value={l.gst}
                        onChange={(e) => setLines((ls) => ls.map((x) => x.key === l.key ? { ...x, gst: e.target.value.replace(/[^\d.]/g, "") } : x))} />
                      {lines.length > 1 ? (
                        <Button variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`}
                          onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
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
              <Row label="Subtotal" value={formatPaise(orderTotals.subtotal as Paise)} />
              <Row label="GST" value={formatPaise(orderTotals.tax as Paise)} />
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-body font-semibold">Order value</span>
                <span className="font-mono text-h3">{formatPaise(orderTotals.total as Paise)}</span>
              </div>
            </div>

            <Button onClick={saveOrder} disabled={busy}>
              {busy ? "Saving…" : "Place order"}
            </Button>
          </Card>

          <DocList
            title="Open & received orders"
            empty="No supply orders yet"
            emptyHint="Place one above. When the goods arrive, one tap turns it into a purchase bill and adds the stock."
            docs={orders}
            action={(d) =>
              d.status === "open" ? (
                <Button size="sm" onClick={() => receiveOrder(d)} disabled={busy}>
                  Mark received
                </Button>
              ) : (
                <Badge tone="success">Received</Badge>
              )
            }
          />
        </>
      ) : null}

      {/* ---------- Supplier returns ---------- */}
      {tab === "returns" ? (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-h3">Send goods back</h2>

            <div className="flex flex-col gap-1 sm:max-w-md">
              <Label htmlFor="ret-purchase">Which purchase bill?</Label>
              <select
                id="ret-purchase"
                value={purchaseId}
                onChange={(e) => void loadPurchase(e.target.value)}
                className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
              >
                <option value="">Select a purchase…</option>
                {purchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number ?? "—"} · {p.date} · {formatPaise(p.total_paise as Paise)}
                  </option>
                ))}
              </select>
              {retSupplier.name ? (
                <span className="text-caption normal-case text-content-muted">
                  Supplier: {retSupplier.name}
                </span>
              ) : null}
            </div>

            {retLines.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-body">
                    <thead>
                      <tr>
                        {["Item", "Bought", "Rate", "Sending back", "Debit"].map((h, i) => (
                          <th key={h} className={"border-b border-border px-2 py-1 text-caption font-semibold uppercase text-content-muted" + (i === 4 ? " text-right" : "")}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {retTotals.priced.map((p, i) => (
                        <tr key={p.line.item.id}>
                          <td className="border-b border-border px-2 py-2">{p.line.item.description ?? "Item"}</td>
                          <td className="border-b border-border px-2 py-2 font-mono">{milliToQty(p.line.item.qty_milli)}</td>
                          <td className="border-b border-border px-2 py-2 font-mono">{formatPaise(p.line.item.rate_paise as Paise)}</td>
                          <td className="border-b border-border px-2 py-2">
                            <Input
                              aria-label={`Quantity returned, line ${i + 1}`}
                              inputMode="decimal"
                              className="w-24 text-right font-mono"
                              value={p.line.qty}
                              onChange={(e) =>
                                setRetLines((ls) =>
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
                  <Label htmlFor="ret-why">Reason (optional)</Label>
                  <Input id="ret-why" value={retNote} onChange={(e) => setRetNote(e.target.value)}
                    placeholder="Damaged, short supply, wrong item…" />
                </div>

                <div className="flex flex-col gap-1 border-t border-border pt-3">
                  <Row label="Taxable value" value={formatPaise(retTotals.subtotal as Paise)} />
                  <Row label="GST reversed" value={formatPaise(retTotals.tax as Paise)} />
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-body font-semibold">Debit note total</span>
                    <span className="font-mono text-h3">{formatPaise(retTotals.total as Paise)}</span>
                  </div>
                </div>

                <Button onClick={saveReturn} disabled={busy || returning.length === 0}>
                  {busy ? "Saving…" : "Raise debit note"}
                </Button>
              </>
            ) : purchaseId && !busy ? (
              <p className="text-body text-content-muted">That bill has no lines to return.</p>
            ) : null}
          </Card>

          <DocList
            title="Debit notes raised"
            empty="No returns yet"
            emptyHint="Nothing has gone back to a supplier so far."
            docs={notes}
          />
        </>
      ) : null}

      {/* ---------- Payments out ---------- */}
      {tab === "payments" ? (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-h3">Pay a supplier</h2>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="pay-supplier">Supplier</Label>
                <select
                  id="pay-supplier"
                  value={paySupplier}
                  onChange={(e) => setPaySupplier(e.target.value)}
                  className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
                >
                  <option value="">Select a supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {formatPaise(s.payable_paise as Paise)} due
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pay-method">Paid by</Label>
                <select
                  id="pay-method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
                >
                  {PAY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {paySupplier ? (
              <div className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-canvas p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-caption font-medium uppercase text-content-muted">Outstanding</span>
                  <span className="font-mono text-h3">{formatPaise(payable as Paise)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="pay-amt">Amount</Label>
                  <Input id="pay-amt" inputMode="decimal" className="text-right font-mono" placeholder="0.00"
                    value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.]/g, ""))} />
                </div>
                <Button onClick={() => void payOut(false)} disabled={busy}>
                  Record payment
                </Button>
                {payable > 0 ? (
                  <Button variant="outline" onClick={() => void payOut(true)} disabled={busy}>
                    Settle in full
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="text-h3">Recent payments out</h2>
            {payments === null ? (
              <p className="text-body text-content-muted">Loading…</p>
            ) : payments.length === 0 ? (
              <EmptyState title="Nothing paid out yet" description="Supplier payments you record will be listed here." />
            ) : (
              <Card className="divide-y divide-border p-0">
                {payments.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex flex-col">
                      <span className="text-body font-medium">{p.supplier_name ?? "Supplier"}</span>
                      <span className="text-caption normal-case text-content-muted">
                        {p.date} · {p.method === "debit-note" ? "debit note" : p.method.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.dirty ? <Badge tone="warning" dot>Unsynced</Badge> : null}
                      <span className="font-mono text-body-lg">{formatPaise(p.amount_paise as Paise)}</span>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-body text-content-muted">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function DocList({
  title,
  empty,
  emptyHint,
  docs,
  action,
}: {
  title: string;
  empty: string;
  emptyHint: string;
  docs: PurchaseDocumentRow[] | null;
  action?: (doc: PurchaseDocumentRow) => React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3">{title}</h2>
      {docs === null ? (
        <p className="text-body text-content-muted">Loading…</p>
      ) : docs.length === 0 ? (
        <EmptyState title={empty} description={emptyHint} />
      ) : (
        <Card className="divide-y divide-border p-0">
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex flex-col">
                <span className="text-body font-medium">{d.number}</span>
                <span className="text-caption normal-case text-content-muted">
                  {d.date}
                  {d.supplier_name ? ` · ${d.supplier_name}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {d.dirty ? <Badge tone="warning" dot>Unsynced</Badge> : null}
                <span className="font-mono text-body-lg">
                  {formatPaise(d.total_paise as Paise)}
                </span>
                {action ? action(d) : null}
              </div>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
