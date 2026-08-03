"use client";

import {
  formatPaise,
  rupeesToPaise,
  type BusinessTypeConfig,
  type Paise,
} from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { ModuleDataActions } from "~/components/common/module-data-actions";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listProducts, saveProduct, type ProductRow } from "~/lib/db/repository";

/**
 * The Products / Catalog module (route: /products).
 *
 * Where Inventory is about *stock* (movements, on-hand, +/- adjustments), this
 * screen is about the *catalogue* — the sellable items, their SKU, HSN/SAC code
 * and tax rate. Both read and write the same offline-first `products` table
 * through the repository, so an item added here is immediately available to
 * Inventory, Sales and Purchase. On-hand is still the CRDT sum of movements,
 * shown read-only here for reference.
 *
 * HSN/SAC is a first-class field here (Inventory's quick-add omits it) because
 * correct HSN is what makes GST filing downstream trustworthy.
 */

const MILLI = 1000;

export function ProductsModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  // New-product draft.
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [hsn, setHsn] = useState("");
  const [price, setPrice] = useState("");
  const [gst, setGst] = useState("18");
  const [opening, setOpening] = useState("0");

  const refresh = useCallback(async () => {
    try {
      setProducts(await listProducts(orgId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!products) return null;
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.hsn ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  async function handleCreate() {
    if (name.trim().length < 1) return;
    setSaving(true);
    setError(null);
    try {
      const trimmedSku = sku.trim();
      const trimmedHsn = hsn.trim();
      await saveProduct({
        id: crypto.randomUUID(),
        orgId,
        name: name.trim(),
        ...(trimmedSku ? { sku: trimmedSku } : {}),
        ...(trimmedHsn ? { hsn: trimmedHsn } : {}),
        pricePaise: safePaise(price),
        taxBps: Math.round(Number(gst || "0") * 100),
        openingMilli: Math.round(Number(opening || "0") * MILLI),
      });
      setName("");
      setSku("");
      setHsn("");
      setPrice("");
      setOpening("0");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Products</h1>
          <p className="text-body text-content-muted">
            Your catalogue — items, SKU, HSN and tax. Shared with Sales,
            Purchase and Inventory, on this device and once it syncs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModuleDataActions module="products" orgId={orgId} />
          {config ? <Badge tone="primary">{config.label}</Badge> : null}
        </div>
      </div>

      {/* Add product */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-12 items-end gap-2">
          <div className="col-span-3 flex flex-col gap-1">
            <Label htmlFor="p-name">Product</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="p-sku">SKU</Label>
            <Input
              id="p-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="optional"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="p-hsn">HSN / SAC</Label>
            <Input
              id="p-hsn"
              inputMode="numeric"
              value={hsn}
              onChange={(e) => setHsn(e.target.value.replace(/[^\d]/g, ""))}
              className="font-mono"
              placeholder="e.g. 6109"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="p-price">Price ₹</Label>
            <Input
              id="p-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
              className="text-right font-mono"
              placeholder="0.00"
            />
          </div>
          <div className="col-span-1 flex flex-col gap-1">
            <Label htmlFor="p-gst">GST %</Label>
            <Input
              id="p-gst"
              inputMode="decimal"
              value={gst}
              onChange={(e) => setGst(e.target.value.replace(/[^\d.]/g, ""))}
              className="text-right font-mono"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="p-open">Opening qty</Label>
            <Input
              id="p-open"
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value.replace(/[^\d.]/g, ""))}
              className="text-right font-mono"
            />
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger"
          >
            {error}
          </p>
        ) : null}

        <Button
          onClick={handleCreate}
          disabled={saving || name.trim().length < 1}
          data-testid="add-product"
          className="self-start"
        >
          {saving ? "Adding…" : "Add product"}
        </Button>
      </Card>

      {/* Catalogue */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-h3">Catalogue</h2>
          <Input
            aria-label="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, SKU or HSN…"
            className="max-w-xs"
          />
        </div>

        {filtered === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={query ? "No matches" : "No products yet"}
            description={
              query
                ? "No product matches that search."
                : "Add your first item above — it stays on this device and syncs when you reconnect."
            }
          />
        ) : (
          <Card className="p-0" data-testid="product-list">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-caption font-medium uppercase text-content-muted">
              <span className="col-span-4">Product</span>
              <span className="col-span-2">HSN / SAC</span>
              <span className="col-span-2 text-right">Price</span>
              <span className="col-span-2 text-right">GST</span>
              <span className="col-span-2 text-right">On hand</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-12 items-center gap-3 px-4 py-3"
                  data-testid="product-row"
                >
                  <div className="col-span-4 flex flex-col">
                    <span className="flex items-center gap-2 text-body font-medium">
                      {p.name}
                      {p.dirty ? (
                        <Badge tone="warning" dot>
                          Unsynced
                        </Badge>
                      ) : null}
                    </span>
                    {p.sku ? (
                      <span className="text-caption normal-case text-content-muted">
                        {p.sku}
                      </span>
                    ) : null}
                  </div>
                  <span className="col-span-2 font-mono text-body text-content-muted">
                    {p.hsn ?? "—"}
                  </span>
                  <span className="col-span-2 text-right font-mono text-body">
                    {p.price_paise !== null
                      ? formatPaise(p.price_paise as Paise)
                      : "—"}
                  </span>
                  <span className="col-span-2 text-right font-mono text-body text-content-muted">
                    {p.tax_bps !== null ? `${p.tax_bps / 100}%` : "—"}
                  </span>
                  <span
                    className="col-span-2 text-right font-mono text-body"
                    data-testid="on-hand"
                  >
                    {formatMilli(p.on_hand_milli)}
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

/** milli-units -> a plain quantity string, trimming a trailing .000. */
function formatMilli(milli: number): string {
  const n = milli / 1000;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
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
