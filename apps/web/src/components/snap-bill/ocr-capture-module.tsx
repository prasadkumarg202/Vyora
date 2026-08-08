"use client";

import {
  formatPaise,
  rupeesToPaise,
  type BusinessTypeConfig,
  type Paise,
} from "@vyora/core";
import { Badge, Button, Card, Input } from "@vyora/ui";
import { useMemo, useState } from "react";

import { nextPurchaseNumber, savePurchase } from "~/lib/db/repository";

/**
 * Snap Bill / OCR capture (route: /snap-bill) — a Vyora Edge feature.
 *
 * Photograph a supplier bill; Gemini Vision reads it on the server and returns
 * the supplier, date and line items. The shopkeeper checks the draft and saves
 * it as a Purchase in one tap — no typing a paper bill line by line. This is the
 * OCR moat the big apps don't have: from photo to booked purchase in seconds.
 */

interface DraftLine {
  key: string;
  name: string;
  qty: string;
  rate: string;
  gst: string;
}
interface Extracted {
  supplier?: string | null;
  date?: string | null;
  items?: { name?: string; qty?: number; rate?: number; gstPercent?: number | null }[];
  total?: number | null;
}

const rupee = (p: number) => formatPaise(p as Paise);

async function downscale(file: File, maxDim = 1280, quality = 0.6): Promise<{ base64: string; mime: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { base64: dataUrl.split(",")[1] ?? "", mime: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function lineFigures(l: DraftLine): { taxable: number; tax: number; amount: number; bps: number } {
  const qty = Number(l.qty) || 0;
  let ratePaise = 0;
  try {
    ratePaise = rupeesToPaise(Math.round((Number(l.rate) || 0) * 100) / 100);
  } catch {
    ratePaise = 0;
  }
  const bps = Math.round((Number(l.gst) || 0) * 100);
  const taxable = Math.round(ratePaise * qty);
  const tax = Math.round((taxable * bps) / 10000);
  return { taxable, tax, amount: taxable + tax, bps };
}

export function OcrCaptureModule({ orgId, config }: { orgId: string; config: BusinessTypeConfig | null }) {
  const defaultGst = config?.gst.default.kind === "fixed" ? String(config.gst.default.bps / 100) : "18";
  const [status, setStatus] = useState<"idle" | "reading" | "review">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setSaved(null);
    setStatus("reading");
    setPreview(URL.createObjectURL(file));
    try {
      const { base64, mime } = await downscale(file);
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: mime }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error || `Read failed (${res.status}).`);
        setStatus("idle");
        return;
      }
      const { data } = (await res.json()) as { data: Extracted };
      setSupplier(data.supplier ?? "");
      setDate(data.date ?? new Date().toISOString().slice(0, 10));
      setLines(
        (data.items ?? []).map((it) => ({
          key: crypto.randomUUID(),
          name: it.name ?? "Item",
          qty: String(it.qty ?? 1),
          rate: it.rate != null ? String(it.rate) : "",
          gst: it.gstPercent != null ? String(it.gstPercent) : defaultGst,
        })),
      );
      setStatus("review");
    } catch (err) {
      setError((err as Error).message);
      setStatus("idle");
    }
  }

  const totals = useMemo(() => {
    let taxable = 0, tax = 0;
    for (const l of lines) {
      const f = lineFigures(l);
      taxable += f.taxable;
      tax += f.tax;
    }
    return { taxable, tax, total: taxable + tax };
  }, [lines]);

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  async function save() {
    const filled = lines.filter((l) => Number(l.qty) > 0 && Number(l.rate) > 0);
    if (filled.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      const number = await nextPurchaseNumber(orgId);
      const items = filled.map((l) => {
        const f = lineFigures(l);
        return {
          description: l.name.trim() || "Item",
          qtyMilli: Math.round((Number(l.qty) || 0) * 1000),
          ratePaise: rupeesToPaise(Math.round((Number(l.rate) || 0) * 100) / 100),
          taxBps: f.bps,
          amountPaise: f.amount as Paise,
        };
      });
      const taxable = items.reduce((n, _it, i) => n + lineFigures(filled[i]!).taxable, 0);
      const tax = items.reduce((n, _it, i) => n + lineFigures(filled[i]!).tax, 0);
      await savePurchase({
        id,
        orgId,
        number,
        date: date || new Date().toISOString().slice(0, 10),
        subtotalPaise: taxable as Paise,
        taxPaise: tax as Paise,
        totalPaise: (taxable + tax) as Paise,
        items,
      });
      setSaved(number);
      setStatus("idle");
      setLines([]);
      setPreview(null);
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
          <h1 className="text-h1">Snap Bill</h1>
          <p className="text-body text-content-muted">
            Photograph a supplier bill — AI reads it and books the purchase. No typing.
          </p>
        </div>
        <Badge tone="primary">Vyora Edge · AI</Badge>
      </div>

      {saved ? (
        <div className="rounded-control border border-success-border bg-success-tonal px-3 py-2 text-body text-success">
          Saved purchase {saved}. Snap the next bill.
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">{error}</p>
      ) : null}

      {status !== "review" ? (
        <Card className="flex flex-col items-center gap-4 p-8 text-center">
          <span className="text-4xl">🧾📷</span>
          <p className="max-w-md text-body text-content-muted">
            Take a clear, well-lit photo of the bill, or choose one from your gallery.
          </p>
          <label className="cursor-pointer rounded-control bg-primary px-4 py-2 text-body font-medium text-white">
            {status === "reading" ? "Reading bill…" : "📷 Snap / choose a bill"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={status === "reading"}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.currentTarget.value = ""; }}
            />
          </label>
          {status === "reading" && preview ? (
            /*
             * A plain <img>, deliberately. `preview` is a blob: object URL for
             * a photo taken on this device a moment ago. next/image cannot put
             * a blob: URL through the optimizer, and it requires a fixed width
             * and height — which would squash a portrait bill into whatever box
             * we guessed. `max-h-56` with automatic width is the right
             * treatment for an image of unknown aspect ratio, and there is
             * nothing for the optimizer to do with a local file that was never
             * served over the network.
             */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="The bill being read"
              className="max-h-56 rounded-card border border-border"
            />
          ) : null}
          <p className="text-caption normal-case text-content-muted">
            Needs the AI key configured on the server. Everything else in Vyora works offline.
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-caption font-medium uppercase text-content-muted">Supplier</label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-caption font-medium uppercase text-content-muted">Bill date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-12 gap-2 text-caption font-medium uppercase text-content-muted">
              <span className="col-span-5">Item</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate ₹</span>
              <span className="col-span-2 text-right">GST %</span>
              <span className="col-span-1"></span>
            </div>
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-12 items-center gap-2">
                <Input className="col-span-5" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} />
                <Input className="col-span-2 text-right font-mono" inputMode="decimal" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value.replace(/[^\d.]/g, "") })} />
                <Input className="col-span-2 text-right font-mono" inputMode="decimal" value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0.00" />
                <Input className="col-span-2 text-right font-mono" inputMode="decimal" value={l.gst} onChange={(e) => update(l.key, { gst: e.target.value.replace(/[^\d.]/g, "") })} />
                <button onClick={() => removeLine(l.key)} className="col-span-1 text-content-muted hover:text-danger" aria-label="Remove">×</button>
              </div>
            ))}
            {lines.length === 0 ? <p className="text-body text-content-muted">No items read — add them manually or try a clearer photo.</p> : null}
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <div className="flex justify-between text-body text-content-muted"><span>Taxable</span><span className="font-mono">{rupee(totals.taxable)}</span></div>
            <div className="flex justify-between text-body text-content-muted"><span>GST</span><span className="font-mono">{rupee(totals.tax)}</span></div>
            <div className="flex items-baseline justify-between pt-1"><span className="text-body font-semibold">Total</span><span className="font-mono text-h3">{rupee(totals.total)}</span></div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving || lines.length === 0}>{saving ? "Saving…" : "Save as purchase"}</Button>
            <Button variant="ghost" onClick={() => { setStatus("idle"); setLines([]); setPreview(null); }}>Discard</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
