"use client";

import {
  formatPaise,
  rupeesToPaise,
  type BusinessTypeConfig,
  type Paise,
} from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

import {
  listProducts,
  recordMovement,
  saveProduct,
  type ProductRow,
} from "~/lib/db/repository";

/**
 * The Inventory / Catalog module.
 *
 * Products are created and stocked on-device, offline-first, like every write
 * in the app. On-hand is never a stored number — it is the running sum of stock
 * movements, so a receipt here and a sale on another counter both count once
 * they merge. Adjustments record a signed movement rather than overwriting a
 * level, which is the CRDT-counter rule made visible.
 */

const MILLI = 1000;

export function InventoryModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // New-product draft.
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
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

  async function handleCreate() {
    if (name.trim().length < 1) return;
    setSaving(true);
    setError(null);
    try {
      const trimmedSku = sku.trim();
      await saveProduct({
        id: crypto.randomUUID(),
        orgId,
        name: name.trim(),
        ...(trimmedSku ? { sku: trimmedSku } : {}),
        pricePaise: safePaise(price),
        taxBps: Math.round(Number(gst || "0") * 100),
        openingMilli: Math.round(Number(opening || "0") * MILLI),
      });
      setName("");
      setSku("");
      setPrice("");
      setOpening("0");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function adjust(productId: string, deltaMilli: number) {
    setError(null);
    try {
      await recordMovement({
        orgId,
        productId,
        type: deltaMilli < 0 ? "adjustment-out" : "adjustment-in",
        qtyMilli: deltaMilli,
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Inventory</h1>
          <p className="text-body text-content-muted">
            Products and live stock — on this device, connected or not.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-12 items-end gap-2">
          <div className="col-span-4 flex flex-col gap-1">
            <Label htmlFor="p-name">Product</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="p-sku">SKU</Label>
            <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="optional" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="p-price">Price ₹</Label>
            <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} className="text-right font-mono" placeholder="0.00" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="p-gst">GST %</Label>
            <Input id="p-gst" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value.replace(/[^\d.]/g, ""))} className="text-right font-mono" />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="p-open">Opening qty</Label>
            <Input id="p-open" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d.]/g, ""))} className="text-right font-mono" />
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
            {error}
          </p>
        ) : null}

        <Button onClick={handleCreate} disabled={saving || name.trim().length < 1} data-testid="add-product" className="self-start">
          {saving ? "Adding…" : "Add product"}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Stock</h2>
        {products === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : products.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add a product above with its opening quantity — it stays on this device."
          />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="product-list">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 p-4" data-testid="product-row">
                <div className="flex flex-col">
                  <span className="text-body font-medium">{p.name}</span>
                  <span className="text-caption normal-case text-content-muted">
                    {p.sku ? `${p.sku} · ` : ""}
                    {p.price_paise !== null ? formatPaise(p.price_paise as Paise) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {p.dirty ? <Badge tone="warning" dot>Unsynced</Badge> : null}
                  <Button variant="ghost" size="icon" aria-label={`Remove one ${p.name}`} onClick={() => adjust(p.id, -MILLI)}>
                    −
                  </Button>
                  <span className="w-16 text-right font-mono text-body-lg" data-testid="on-hand">
                    {formatMilli(p.on_hand_milli)}
                  </span>
                  <Button variant="ghost" size="icon" aria-label={`Add one ${p.name}`} onClick={() => adjust(p.id, MILLI)}>
                    +
                  </Button>
                </div>
              </div>
            ))}
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
