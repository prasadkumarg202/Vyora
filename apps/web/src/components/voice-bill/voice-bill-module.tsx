"use client";

import {
  computeTax,
  formatPaise,
  rupeesToPaise,
  type BusinessTypeConfig,
  type LineItem,
  type Paise,
} from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  listProducts,
  nextInvoiceNumber,
  saveInvoice,
  type ProductRow,
} from "~/lib/db/repository";

/**
 * Voice Billing (route: /voice-bill) — "bolo aur bill banao".
 *
 * Speak the sale in your language ("do Dolo 650, ek Crocin 40") and it drafts
 * the invoice lines; edit and save. No competitor bills by voice. Speech uses
 * the browser's recognition where available; where it isn't, the same parser
 * runs on typed text, so the feature works everywhere. GST is the same
 * money-exact engine as the Sales till.
 */

interface Draft {
  key: string;
  name: string;
  qty: string;
  rate: string;
  gst: string;
}

interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognition(): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

const NUM_WORDS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, che: 6, cheh: 6, saat: 7, aath: 8, nau: 9, das: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Turn "do Dolo 650 rupaye 45, ek Crocin 40" into editable lines. */
function parseLines(text: string, defaultGst: string): Draft[] {
  return text
    .split(/,|;|\band\b|\baur\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const tokens = chunk.split(/\s+/);
      let qty = 1;
      const nums: number[] = [];
      const nameParts: string[] = [];
      for (const t of tokens) {
        const low = t.toLowerCase().replace(/[^a-z0-9.]/gi, "");
        if (/^\d+(\.\d+)?$/.test(low)) {
          nums.push(Number(low));
        } else if (NUM_WORDS[low] !== undefined) {
          qty = NUM_WORDS[low]!;
        } else if (!/^(rupees?|rs|rupaye|rupaya|ka|ke|ki|piece|pcs|nos|no|at)$/i.test(low) && low) {
          nameParts.push(t);
        }
      }
      // If two numbers, first is qty, last is rate. If one, it's the rate.
      let rate = 0;
      if (nums.length >= 2) {
        qty = nums[0]!;
        rate = nums[nums.length - 1]!;
      } else if (nums.length === 1) {
        rate = nums[0]!;
      }
      const name = nameParts.join(" ").trim() || "Item";
      return { key: crypto.randomUUID(), name, qty: String(qty), rate: rate ? String(rate) : "", gst: defaultGst };
    })
    .filter((l) => l.name !== "Item" || l.rate !== "");
}

function safePaise(rupees: string): Paise {
  const n = Number((rupees ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return 0 as Paise;
  try {
    return rupeesToPaise(Math.round(n * 100) / 100);
  } catch {
    return 0 as Paise;
  }
}

export function VoiceBillModule({
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
  const defaultGst = config?.gst.default.kind === "fixed" ? String(config.gst.default.bps / 100) : "18";
  const [transcript, setTranscript] = useState("");
  const [lines, setLines] = useState<Draft[]>([]);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [aiOn, setAiOn] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const supported = useMemo(() => getRecognition() !== null, []);

  useEffect(() => () => recRef.current?.stop(), []);
  useEffect(() => {
    void (async () => {
      try {
        setProducts(await listProducts(orgId, 2000));
      } catch {
        /* catalogue is optional for parsing */
      }
    })();
  }, [orgId]);

  function toggleListen() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i]![0]!.transcript + " ";
      setTranscript(text.trim());
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  const parse = useCallback(async () => {
    const text = transcript.trim();
    if (!text) return;
    setParsing(true);
    setError(null);
    try {
      if (typeof navigator === "undefined" || navigator.onLine) {
        const catalog = products.map((p) => ({
          name: p.name,
          price: p.price_paise != null ? p.price_paise / 100 : undefined,
          gst: p.tax_bps != null ? p.tax_bps / 100 : undefined,
        }));
        const res = await fetch("/api/voice-bill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transcript: text, products: catalog }),
        });
        if (res.ok) {
          const { data } = (await res.json()) as {
            data?: { items?: { name?: string; qty?: number; rate?: number; gstPercent?: number | null }[] };
          };
          const items = data?.items ?? [];
          if (items.length) {
            setLines(
              items.map((it) => ({
                key: crypto.randomUUID(),
                name: it.name ?? "Item",
                qty: String(it.qty ?? 1),
                rate: it.rate != null ? String(it.rate) : "",
                gst: it.gstPercent != null ? String(it.gstPercent) : defaultGst,
              })),
            );
            setAiOn(true);
            return;
          }
        }
      }
    } catch {
      /* fall back to the on-device parser */
    } finally {
      setParsing(false);
    }
    // Offline / AI unavailable — deterministic parse.
    setParsing(false);
    setLines(parseLines(text, defaultGst));
  }, [transcript, defaultGst, products]);

  const items = useMemo<LineItem[]>(
    () =>
      lines
        .filter((l) => safePaise(l.rate) > 0 && Number(l.qty) > 0)
        .map((l) => ({ qty: Number(l.qty), unitPricePaise: safePaise(l.rate), gstBps: Math.round(Number(l.gst || "0") * 100) })),
    [lines],
  );
  const tax = useMemo(() => {
    if (!config || items.length === 0) return null;
    try {
      return computeTax(config, items, { supplierStateCode, placeOfSupplyStateCode: supplierStateCode, roundOff: true });
    } catch {
      return null;
    }
  }, [config, items, supplierStateCode]);

  const update = (key: string, patch: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function handleSave() {
    if (!tax || items.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      const number = await nextInvoiceNumber(orgId);
      const filled = lines.filter((l) => safePaise(l.rate) > 0 && Number(l.qty) > 0);
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
          description: l.name || `Item ${i + 1}`,
          qtyMilli: Math.round(Number(l.qty) * 1000),
          ratePaise: safePaise(l.rate),
          taxBps: Math.round(Number(l.gst || "0") * 100),
          amountPaise: tax.lines[i]?.totalPaise ?? (0 as Paise),
        })),
      });
      setSaved(number);
      setLines([]);
      setTranscript("");
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
          <h1 className="text-h1">Voice Billing</h1>
          <p className="text-body text-content-muted">
            Speak the sale — “do Dolo 650, ek Crocin 40” — and it becomes an invoice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="primary">Vyora Edge</Badge>
          <Badge tone={aiOn ? "success" : "neutral"} dot>{aiOn ? "AI parsing" : "Ready"}</Badge>
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={toggleListen} disabled={!supported} data-testid="mic">
            {listening ? "◼ Stop listening" : "🎙 Speak the sale"}
          </Button>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="min-h-touch rounded-input border border-border bg-surface px-3 text-body"
          >
            <option value="en-IN">English (India)</option>
            <option value="hi-IN">हिन्दी</option>
            <option value="te-IN">తెలుగు</option>
            <option value="ta-IN">தமிழ்</option>
          </select>
          {listening ? <Badge tone="danger" dot>Listening…</Badge> : null}
        </div>

        {!supported ? (
          <p className="text-caption normal-case text-content-muted">
            Voice input isn&apos;t available in this browser — type the sale below in the same way and tap Parse.
          </p>
        ) : null}

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={2}
          placeholder="e.g. do Dolo 650 45, ek Crocin 40"
          className="rounded-input border border-border bg-surface px-3 py-2 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
        />
        <div>
          <Button variant="outline" size="sm" onClick={() => void parse()} disabled={!transcript.trim() || parsing}>
            {parsing ? "Reading…" : "Parse into items"}
          </Button>
        </div>
      </Card>

      {saved ? (
        <div className="rounded-control border border-success-border bg-success-tonal px-3 py-2 text-body text-success">
          Saved invoice {saved}. Speak the next sale.
        </div>
      ) : null}

      {lines.length > 0 ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-12 gap-2 text-caption font-medium uppercase text-content-muted">
            <span className="col-span-5">Item</span>
            <span className="col-span-2 text-right">Qty</span>
            <span className="col-span-3 text-right">Rate ₹</span>
            <span className="col-span-2 text-right">GST %</span>
          </div>
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-12 items-center gap-2">
              <Input className="col-span-5" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} />
              <Input className="col-span-2 text-right font-mono" inputMode="decimal" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value.replace(/[^\d.]/g, "") })} />
              <Input className="col-span-3 text-right font-mono" inputMode="decimal" value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0.00" />
              <Input className="col-span-2 text-right font-mono" inputMode="decimal" value={l.gst} onChange={(e) => update(l.key, { gst: e.target.value.replace(/[^\d.]/g, "") })} />
            </div>
          ))}

          {tax ? (
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-body font-semibold">Total</span>
              <span className="font-mono text-h3">{formatPaise(tax.grandTotalPaise)}</span>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">{error}</p>
          ) : null}

          <Button onClick={handleSave} disabled={!tax || saving} className="self-start">
            {saving ? "Saving…" : "Save invoice"}
          </Button>
        </Card>
      ) : transcript ? (
        <EmptyState title="Tap “Parse into items”" description="I'll turn what you said into editable invoice lines." />
      ) : null}
    </div>
  );
}
