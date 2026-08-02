"use client";

import {
  computeTax,
  formatPaise,
  rupeesToPaise,
  type BusinessTypeConfig,
  type LineItem,
  type Paise,
  type TaxBreakup,
} from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listProducts,
  listPurchases,
  nextPurchaseNumber,
  savePurchase,
  type ProductRow,
  type PurchaseRow,
} from "~/lib/db/repository";

/**
 * The Purchase module — the supplier-side mirror of Sales.
 *
 * A purchase line can be tied to a product; receiving it adds a positive stock
 * movement, so goods bought here flow into the same ledger the Inventory screen
 * sums. Buying and selling are opposite signs on one counter. GST is the same
 * money-exact engine computation, here representing input tax.
 */

const MILLI = 1000;

interface DraftLine {
  key: string;
  productId: string; // "" = free-text (no stock effect)
  description: string;
  qty: string;
  rate: string;
  gstPercent: string;
}

const blankLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  productId: "",
  description: "",
  qty: "1",
  rate: "",
  gstPercent: "18",
});

export function PurchaseModule({
  orgId,
  config,
  supplierStateCode,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
  supplierStateCode: string;
}) {
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ps, prods] = await Promise.all([listPurchases(orgId), listProducts(orgId)]);
      setPurchases(ps);
      setProducts(prods);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = useMemo<LineItem[]>(
    () =>
      lines
        .filter((l) => l.rate.trim() !== "" && Number(l.qty) > 0)
        .map((l) => ({
          qty: Number(l.qty),
          unitPricePaise: safePaise(l.rate),
          gstBps: Math.round(Number(l.gstPercent || "0") * 100),
        })),
    [lines],
  );

  const tax = useMemo<TaxBreakup | null>(() => {
    if (!config || items.length === 0) return null;
    try {
      return computeTax(config, items, {
        supplierStateCode,
        placeOfSupplyStateCode: supplierStateCode,
        roundOff: true,
      });
    } catch {
      return null;
    }
  }, [config, items, supplierStateCode]);

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function handleSave() {
    if (!tax || items.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      const number = await nextPurchaseNumber(orgId);
      const filled = lines.filter((l) => l.rate.trim() !== "" && Number(l.qty) > 0);

      await savePurchase({
        id,
        orgId,
        number,
        date: new Date().toISOString().slice(0, 10),
        subtotalPaise: tax.taxableValuePaise,
        taxPaise: tax.totalTaxPaise,
        totalPaise: tax.grandTotalPaise,
        items: filled.map((l, i) => {
          const product = products.find((p) => p.id === l.productId);
          return {
            ...(l.productId ? { productId: l.productId } : {}),
            description: product?.name ?? l.description.trim() ?? `Item ${i + 1}`,
            qtyMilli: Math.round(Number(l.qty) * MILLI),
            ratePaise: safePaise(l.rate),
            taxBps: Math.round(Number(l.gstPercent || "0") * 100),
            amountPaise: tax.lines[i]?.totalPaise ?? (0 as Paise),
          };
        }),
      });

      setLines([blankLine()]);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canSave = tax !== null && items.length > 0 && !saving;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Purchase</h1>
          <p className="text-body text-content-muted">
            Record goods in — lines linked to a product add to its stock.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3">
          {lines.map((line, i) => (
            <div key={line.key} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-4 flex flex-col gap-1">
                {i === 0 ? <Label htmlFor={`prod-${line.key}`}>Item</Label> : null}
                <select
                  id={`prod-${line.key}`}
                  value={line.productId}
                  onChange={(e) => {
                    const p = products.find((x) => x.id === e.target.value);
                    update(line.key, {
                      productId: e.target.value,
                      ...(p ? { description: p.name } : {}),
                    });
                  }}
                  className="min-h-touch rounded-input border border-border bg-surface px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
                >
                  <option value="">Other (no stock)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                {i === 0 ? <Label htmlFor={`pq-${line.key}`}>Qty</Label> : null}
                <Input id={`pq-${line.key}`} inputMode="decimal" value={line.qty} onChange={(e) => update(line.key, { qty: e.target.value.replace(/[^\d.]/g, "") })} className="text-right font-mono" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                {i === 0 ? <Label htmlFor={`pr-${line.key}`}>Rate ₹</Label> : null}
                <Input id={`pr-${line.key}`} inputMode="decimal" value={line.rate} onChange={(e) => update(line.key, { rate: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0.00" className="text-right font-mono" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                {i === 0 ? <Label htmlFor={`pg-${line.key}`}>GST %</Label> : null}
                <Input id={`pg-${line.key}`} inputMode="decimal" value={line.gstPercent} onChange={(e) => update(line.key, { gstPercent: e.target.value.replace(/[^\d.]/g, "") })} className="text-right font-mono" />
              </div>
              <div className="col-span-2 flex justify-end">
                {lines.length > 1 ? (
                  <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}>
                    ×
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div>
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            + Add line
          </Button>
        </div>

        {tax ? (
          <div className="flex flex-col gap-1 border-t border-border pt-3" data-testid="totals">
            <Row label="Taxable" value={formatPaise(tax.taxableValuePaise)} />
            {tax.igstPaise > 0 ? (
              <Row label="IGST" value={formatPaise(tax.igstPaise)} />
            ) : (
              <>
                <Row label="CGST" value={formatPaise(tax.cgstPaise)} />
                <Row label="SGST" value={formatPaise(tax.sgstPaise)} />
              </>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-body font-semibold">Total</span>
              <span className="font-mono text-h3" data-testid="grand-total">
                {formatPaise(tax.grandTotalPaise)}
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
            {error}
          </p>
        ) : null}

        <Button onClick={handleSave} disabled={!canSave} data-testid="save-purchase">
          {saving ? "Saving…" : "Save purchase"}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Recent purchases</h2>
        {purchases === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : purchases.length === 0 ? (
          <EmptyState title="No purchases yet" description="Record goods received above — it stays on this device." />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="purchase-list">
            {purchases.map((pur) => (
              <div key={pur.id} className="flex items-center justify-between gap-4 p-4" data-testid="purchase-row">
                <div className="flex flex-col">
                  <span className="text-body font-medium">{pur.number}</span>
                  <span className="text-caption normal-case text-content-muted">{pur.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  {pur.dirty ? <Badge tone="warning" dot>Unsynced</Badge> : null}
                  <span className="font-mono text-body-lg">{formatPaise(pur.total_paise as Paise)}</span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
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

function safePaise(rupees: string): Paise {
  const n = Number(rupees.trim());
  if (!Number.isFinite(n) || n < 0) return 0 as Paise;
  try {
    return rupeesToPaise(Math.round(n * 100) / 100);
  } catch {
    return 0 as Paise;
  }
}
