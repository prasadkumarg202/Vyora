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
  listInvoices,
  nextInvoiceNumber,
  saveInvoice,
  type InvoiceRow,
} from "~/lib/db/repository";

/**
 * The Sales till.
 *
 * Everything here is local-first: adding a line and saving an invoice write to
 * the on-device database and complete whether or not there is a network. GST is
 * computed by @vyora/core — the same money-exact engine the tests cover — so a
 * total shown here is a total that will reconcile. Pushing the saved invoice to
 * the server is the sync engine's job and needs the unlocked DEK, so it is not
 * wired yet; a saved invoice is durable locally and marked dirty for that flush.
 */

interface DraftLine {
  key: string;
  description: string;
  qty: string;
  rate: string;
  gstPercent: string;
}

const blankLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  description: "",
  qty: "1",
  rate: "",
  gstPercent: "18",
});

export function SalesModule({
  orgId,
  userId,
  config,
  supplierStateCode,
}: {
  orgId: string;
  userId: string;
  config: BusinessTypeConfig | null;
  supplierStateCode: string;
}) {
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setInvoices(await listInvoices(orgId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Turn the draft into engine LineItems, dropping anything not yet fillable.
  const items = useMemo<LineItem[]>(() => {
    return lines
      .filter((l) => l.rate.trim() !== "" && Number(l.qty) > 0)
      .map((l) => ({
        qty: Number(l.qty),
        unitPricePaise: safePaise(l.rate),
        gstBps: Math.round(Number(l.gstPercent || "0") * 100),
      }));
  }, [lines]);

  // Live GST. The engine is the single source of truth for the arithmetic, so
  // the number on screen is the number that gets saved.
  const tax = useMemo<TaxBreakup | null>(() => {
    if (!config || items.length === 0) return null;
    try {
      return computeTax(config, items, {
        supplierStateCode,
        placeOfSupplyStateCode: supplierStateCode, // intra-state until customer capture lands
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
      const number = await nextInvoiceNumber(orgId);
      const filled = lines.filter((l) => l.rate.trim() !== "" && Number(l.qty) > 0);

      await saveInvoice({
        id,
        orgId,
        number,
        date: new Date().toISOString().slice(0, 10),
        createdBy: userId,
        subtotalPaise: tax.taxableValuePaise,
        taxPaise: tax.totalTaxPaise,
        totalPaise: tax.grandTotalPaise,
        items: filled.map((l, i) => ({
          description: l.description.trim() || `Item ${i + 1}`,
          qtyMilli: Math.round(Number(l.qty) * 1000),
          ratePaise: safePaise(l.rate),
          taxBps: Math.round(Number(l.gstPercent || "0") * 100),
          amountPaise: tax.lines[i]?.totalPaise ?? (0 as Paise),
        })),
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
          <h1 className="text-h1">Sales</h1>
          <p className="text-body text-content-muted">
            {config
              ? `New ${config.label} invoice — saves on this device, syncs when online.`
              : "New invoice — saves on this device, syncs when online."}
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3">
          {lines.map((line, i) => (
            <div key={line.key} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-5 flex flex-col gap-1">
                {i === 0 ? <Label htmlFor={`desc-${line.key}`}>Item</Label> : null}
                <Input
                  id={`desc-${line.key}`}
                  value={line.description}
                  onChange={(e) => update(line.key, { description: e.target.value })}
                  placeholder="Item name"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                {i === 0 ? <Label htmlFor={`qty-${line.key}`}>Qty</Label> : null}
                <Input
                  id={`qty-${line.key}`}
                  inputMode="decimal"
                  value={line.qty}
                  onChange={(e) => update(line.key, { qty: e.target.value.replace(/[^\d.]/g, "") })}
                  className="text-right font-mono"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                {i === 0 ? <Label htmlFor={`rate-${line.key}`}>Rate ₹</Label> : null}
                <Input
                  id={`rate-${line.key}`}
                  inputMode="decimal"
                  value={line.rate}
                  onChange={(e) => update(line.key, { rate: e.target.value.replace(/[^\d.]/g, "") })}
                  placeholder="0.00"
                  className="text-right font-mono"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                {i === 0 ? <Label htmlFor={`gst-${line.key}`}>GST %</Label> : null}
                <Input
                  id={`gst-${line.key}`}
                  inputMode="decimal"
                  value={line.gstPercent}
                  onChange={(e) => update(line.key, { gstPercent: e.target.value.replace(/[^\d.]/g, "") })}
                  className="text-right font-mono"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                {lines.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                  >
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
            {tax.roundOffPaise !== 0 ? (
              <Row label="Round off" value={formatPaise(tax.roundOffPaise)} />
            ) : null}
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

        <Button onClick={handleSave} disabled={!canSave} data-testid="save-invoice">
          {saving ? "Saving…" : "Save invoice"}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Recent invoices</h2>
        {invoices === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Add a line above and save — it stays on this device, connected or not."
          />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="invoice-list">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 p-4" data-testid="invoice-row">
                <div className="flex flex-col">
                  <span className="text-body font-medium">{inv.number}</span>
                  <span className="text-caption normal-case text-content-muted">{inv.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  {inv.dirty ? <Badge tone="warning" dot>Unsynced</Badge> : null}
                  <span className="font-mono text-body-lg">{formatPaise(inv.total_paise as Paise)}</span>
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

/** Rupee string -> paise, tolerant of an empty or partial entry. */
function safePaise(rupees: string): Paise {
  const n = Number(rupees.trim());
  if (!Number.isFinite(n) || n < 0) return 0 as Paise;
  try {
    // rupeesToPaise takes a number and guards against float noise itself.
    return rupeesToPaise(Math.round(n * 100) / 100);
  } catch {
    return 0 as Paise;
  }
}
