"use client";

import {
  computeTax,
  formatPaise,
  rupeesToPaise,
  type BusinessTypeConfig,
  type LineItem,
  type Paise,
} from "@vyora/core";
import { Badge, Button, Card, Input } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { UpiPay } from "~/components/sales/upi-pay";
import {
  listProducts,
  nextInvoiceNumber,
  saveInvoice,
  saveProduct,
  type ProductRow,
} from "~/lib/db/repository";

/**
 * Scan & Sell (route: /scan-sell) — the phone is the scanner and the till.
 *
 * Point the camera at a product barcode; it matches your catalogue and drops
 * onto the bill. Scan, scan, tap Charge — then the customer scans your UPI QR to
 * pay. No scanner gun, no typing, and it runs offline using the browser's own
 * BarcodeDetector. Unknown barcode? Quick-add it once and it's remembered. This
 * is the fastest way to bill in India, and no competitor pairs camera scanning
 * with instant UPI collection in one offline flow.
 */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetector(): BarcodeDetectorLike | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
  } catch {
    return null;
  }
}

interface CartLine {
  product: ProductRow;
  qty: number;
}

const rupee = (p: number) => formatPaise(p as Paise);

export function ScanSellModule({
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
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [quickAdd, setQuickAdd] = useState<{ code: string; name: string; price: string } | null>(null);
  const [saved, setSaved] = useState<{ number: string; totalPaise: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const supported = useMemo(() => getDetector() !== null, []);

  const bySku = useMemo(() => {
    const m = new Map<string, ProductRow>();
    for (const p of products) if (p.sku) m.set(p.sku.trim(), p);
    return m;
  }, [products]);

  const reload = useCallback(async () => {
    setProducts(await listProducts(orgId, 2000));
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addToCart = useCallback((product: ProductRow) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === product.id);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i]!, qty: next[i]!.qty + 1 };
        return next;
      }
      return [...c, { product, qty: 1 }];
    });
    setFlash(`Added ${product.name}`);
    window.setTimeout(() => setFlash(null), 1200);
  }, []);

  const handleCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (lastRef.current.code === code && now - lastRef.current.at < 1500) return; // debounce
      lastRef.current = { code, at: now };
      const p = bySku.get(code);
      if (p) addToCart(p);
      else setQuickAdd({ code, name: "", price: "" });
    },
    [bySku, addToCart],
  );

  // Camera + detection loop.
  useEffect(() => {
    if (!scanning) return;
    let raf = 0;
    let cancelled = false;
    const detector = getDetector();

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const tick = async () => {
          if (cancelled || !detector || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]) handleCode(codes[0].rawValue);
          } catch {
            /* frame not ready */
          }
          raf = window.setTimeout(tick, 350) as unknown as number;
        };
        void tick();
      } catch (err) {
        setCameraError((err as Error).message || "Camera unavailable");
        setScanning(false);
      }
    }
    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [scanning, handleCode]);

  const changeQty = (id: string, delta: number) =>
    setCart((c) => c.flatMap((l) => (l.product.id === id ? (l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]) : [l])));

  const items = useMemo<LineItem[]>(
    () => cart.map((l) => ({ qty: l.qty, unitPricePaise: (l.product.price_paise ?? 0) as Paise, gstBps: l.product.tax_bps ?? 0 })),
    [cart],
  );
  const tax = useMemo(() => {
    if (!config || items.length === 0) return null;
    try {
      return computeTax(config, items, { supplierStateCode, placeOfSupplyStateCode: supplierStateCode, roundOff: true });
    } catch {
      return null;
    }
  }, [config, items, supplierStateCode]);

  async function charge() {
    if (!tax || cart.length === 0) return;
    const id = crypto.randomUUID();
    const number = await nextInvoiceNumber(orgId);
    await saveInvoice({
      id,
      orgId,
      number,
      date: new Date().toISOString().slice(0, 10),
      createdBy: userId,
      subtotalPaise: tax.taxableValuePaise,
      taxPaise: tax.totalTaxPaise,
      totalPaise: tax.grandTotalPaise,
      items: cart.map((l, i) => ({
        description: l.product.name,
        productId: l.product.id,
        qtyMilli: l.qty * 1000,
        ratePaise: (l.product.price_paise ?? 0) as Paise,
        taxBps: l.product.tax_bps ?? 0,
        amountPaise: tax.lines[i]?.totalPaise ?? (0 as Paise),
      })),
    });
    setSaved({ number, totalPaise: tax.grandTotalPaise });
    setCart([]);
    setScanning(false);
  }

  async function quickAddSave() {
    if (!quickAdd) return;
    const price = Number(quickAdd.price);
    if (!quickAdd.name.trim() || !Number.isFinite(price) || price <= 0) return;
    const id = crypto.randomUUID();
    await saveProduct({
      id,
      orgId,
      name: quickAdd.name.trim(),
      sku: quickAdd.code,
      pricePaise: rupeesToPaise(Math.round(price * 100) / 100),
      taxBps: config?.gst.default.kind === "fixed" ? config.gst.default.bps : 1800,
      openingMilli: 0,
    });
    await reload();
    const row: ProductRow = {
      id, name: quickAdd.name.trim(), sku: quickAdd.code,
      price_paise: rupeesToPaise(Math.round(price * 100) / 100),
      tax_bps: config?.gst.default.kind === "fixed" ? config.gst.default.bps : 1800,
      hsn: null, on_hand_milli: 0, dirty: 1,
    };
    addToCart(row);
    setQuickAdd(null);
  }

  // --- Collected screen ---
  if (saved) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-h1">Sale complete</h1>
          <Badge tone="primary">Vyora Edge</Badge>
        </div>
        <Card className="flex flex-col items-center gap-4 p-8 text-center">
          <span className="text-3xl">✅</span>
          <div className="flex flex-col gap-1">
            <span className="text-h2 font-mono">{rupee(saved.totalPaise)}</span>
            <span className="text-body text-content-muted">Invoice {saved.number} saved</span>
          </div>
          <UpiPay amountPaise={saved.totalPaise} note={saved.number} />
          <Button onClick={() => setSaved(null)}>New sale</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Scan &amp; Sell</h1>
          <p className="text-body text-content-muted">
            Your camera is the scanner. Point at a barcode → it&apos;s on the bill. Works offline.
          </p>
        </div>
        <Badge tone="primary">Vyora Edge</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Scanner */}
        <Card className="flex flex-col gap-3 p-4">
          <div className="relative overflow-hidden rounded-card bg-black" style={{ aspectRatio: "4 / 3" }}>
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            {!scanning ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Button onClick={() => { setCameraError(null); setScanning(true); }} disabled={!supported}>
                  {supported ? "🎥 Start scanning" : "Camera scan unsupported"}
                </Button>
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-24 w-3/4 rounded-card border-2 border-white/80" />
              </div>
            )}
            {flash ? (
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-pill bg-primary px-3 py-1 text-caption text-white">{flash}</span>
            ) : null}
          </div>

          {scanning ? (
            <Button variant="outline" size="sm" onClick={() => setScanning(false)}>Stop camera</Button>
          ) : null}
          {cameraError ? <p className="text-caption normal-case text-danger">{cameraError}</p> : null}
          {!supported ? (
            <p className="text-caption normal-case text-content-muted">This browser can&apos;t scan with the camera — type or paste the barcode below.</p>
          ) : null}

          {/* Manual entry fallback */}
          <form onSubmit={(e) => { e.preventDefault(); handleCode(manual); setManual(""); }} className="flex gap-2">
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Enter barcode / SKU" className="font-mono" />
            <Button type="submit" variant="outline" disabled={!manual.trim()}>Add</Button>
          </form>

          {quickAdd ? (
            <div className="flex flex-col gap-2 rounded-card border border-border bg-canvas p-3">
              <span className="text-caption font-medium uppercase text-content-muted">New barcode <span className="font-mono">{quickAdd.code}</span> — add it once</span>
              <Input value={quickAdd.name} onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })} placeholder="Product name" />
              <Input value={quickAdd.price} onChange={(e) => setQuickAdd({ ...quickAdd, price: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Price ₹" className="font-mono" inputMode="decimal" />
              <div className="flex gap-2">
                <Button size="sm" onClick={quickAddSave}>Save &amp; add</Button>
                <Button size="sm" variant="ghost" onClick={() => setQuickAdd(null)}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </Card>

        {/* Cart */}
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-h3">Cart</h2>
            <span className="text-caption normal-case text-content-muted">{cart.reduce((n, l) => n + l.qty, 0)} items</span>
          </div>

          {cart.length === 0 ? (
            <p className="py-8 text-center text-body text-content-muted">Scan a product to start the bill.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {cart.map((l) => (
                <div key={l.product.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex flex-col">
                    <span className="text-body font-medium">{l.product.name}</span>
                    <span className="font-mono text-caption text-content-muted">{rupee(l.product.price_paise ?? 0)} × {l.qty}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(l.product.id, -1)} className="size-7 rounded-control border border-border">−</button>
                    <span className="w-6 text-center font-mono">{l.qty}</span>
                    <button onClick={() => changeQty(l.product.id, 1)} className="size-7 rounded-control border border-border">+</button>
                    <span className="w-20 text-right font-mono">{rupee((l.product.price_paise ?? 0) * l.qty)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tax ? (
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <div className="flex justify-between text-body text-content-muted"><span>Taxable</span><span className="font-mono">{rupee(tax.taxableValuePaise)}</span></div>
              <div className="flex justify-between text-body text-content-muted"><span>GST</span><span className="font-mono">{rupee(tax.totalTaxPaise)}</span></div>
              <div className="flex items-baseline justify-between pt-1"><span className="text-body font-semibold">Total</span><span className="font-mono text-h3">{rupee(tax.grandTotalPaise)}</span></div>
            </div>
          ) : null}

          <Button onClick={charge} disabled={!tax || cart.length === 0}>Charge &amp; collect</Button>
        </Card>
      </div>
    </div>
  );
}
