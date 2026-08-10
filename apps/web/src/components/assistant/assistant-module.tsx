"use client";

import {
  formatPaise,
  type BusinessTypeConfig,
  type Paise,
} from "@vyora/core";
import { Badge, Button, Card, Input } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { suggestedQuestions } from "~/components/assistant/assistant-questions";
import {
  expensesSummary,
  gstSummary,
  lowStock,
  reportsSummary,
  type ExpensesSummary,
  type GstSummary,
  type LowStockRow,
  type ReportsSummary,
} from "~/lib/db/repository";

/**
 * The AI Assistant / Copilot (route: /assistant).
 *
 * Online, free-form questions go to Gemini through the server route /api/ai,
 * grounded in a compact summary of THIS shop's own numbers — so it answers "how
 * are my sales", "which customer should I chase", "how do I lower my GST" with
 * real figures, in the owner's language. The Gemini key stays on the server. If
 * there's no network or no key, the same panel falls back to a deterministic
 * on-device answer, so the copilot always replies.
 */

const LOW_STOCK_THRESHOLD_MILLI = 5_000;

interface Snapshot {
  today: ReportsSummary;
  month: ReportsSummary;
  gst: GstSummary;
  expenses: ExpensesSummary;
  low: LowStockRow[];
}

interface Msg {
  role: "user" | "assistant";
  text: string;
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const rupee = (p: number) => formatPaise(p as Paise);

function buildContext(config: BusinessTypeConfig | null, s: Snapshot | null): string {
  if (!s) return "";
  return [
    `Business type: ${config?.label ?? "shop"}.`,
    `Today: sales ${rupee(s.today.salesPaise)} across ${s.today.salesCount} invoices, collected ${rupee(s.today.collectedPaise)}.`,
    `This month so far: sales ${rupee(s.month.salesPaise)} (${s.month.salesCount} invoices), purchases ${rupee(s.month.purchasesPaise)}.`,
    `GST this month: output tax ${rupee(s.gst.outputTaxPaise)}, input credit ${rupee(s.gst.inputTaxPaise)}, net payable ${rupee(s.gst.netPayablePaise)}.`,
    `Expenses this month: ${rupee(s.expenses.totalPaise)}.`,
    `Outstanding from all customers: ${rupee(s.today.outstandingPaise)}.`,
    `Low-stock items: ${s.low.length ? s.low.map((l) => l.name).join(", ") : "none"}.`,
  ].join("\n");
}

export function AssistantModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiOn, setAiOn] = useState(false);
  // Names the trade in the greeting. A Medical Store owner opening a panel that
  // says "your shop" is being spoken to by software; one that says "your medical
  // store" is being spoken to by something that knows what they sell.
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    {
      role: "assistant",
      text:
        `Hi! I'm your Vyora copilot. Ask me anything about your ${
          config ? config.label.toLowerCase() : "shop"
        } — sales, GST, who owes you, what to stock, ideas to grow. ` +
        "Online I use AI on your live numbers; offline I still answer the essentials.",
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const today = ymd(now);
      const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      const monthEnd = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const [t, m, gst, expenses, low] = await Promise.all([
        reportsSummary(orgId, today, today),
        reportsSummary(orgId, monthStart, today),
        gstSummary(orgId, monthStart, monthEnd),
        expensesSummary(orgId, monthStart, monthEnd),
        lowStock(orgId, LOW_STOCK_THRESHOLD_MILLI),
      ]);
      setSnap({ today: t, month: m, gst, expenses, low });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, busy]);

  const offline = useMemo(() => makeAnswerer(snap), [snap]);

  /** The chips, chosen from the fields this trade actually declares. */
  const suggestions = useMemo(() => suggestedQuestions(config), [config]);

  async function ask(qRaw: string) {
    const q = qRaw.trim();
    if (!q || busy) return;
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "…" }]);
    setInput("");
    setBusy(true);

    let reply = "";
    try {
      if (typeof navigator === "undefined" || navigator.onLine) {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: q, context: buildContext(config, snap), history }),
        });
        if (res.ok) {
          const d = (await res.json()) as { text?: string };
          if (d.text && d.text.trim()) {
            reply = d.text.trim();
            setAiOn(true);
          }
        }
      }
    } catch {
      /* fall through to offline */
    }
    if (!reply) reply = offline(q);

    setMsgs((m) => {
      const copy = [...m];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i]!.role === "assistant" && copy[i]!.text === "…") {
          copy[i] = { role: "assistant", text: reply };
          break;
        }
      }
      return copy;
    });
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">AI Assistant</h1>
          <p className="text-body text-content-muted">
            Your copilot — answers from your live books. {aiOn ? "AI is on." : "Works offline too."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config ? <Badge tone="primary">{config.label}</Badge> : null}
          <Badge tone={aiOn ? "success" : "neutral"} dot>{aiOn ? "Gemini AI" : "Ready"}</Badge>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">{error}</p>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <div ref={listRef} className="flex max-h-[24rem] flex-col gap-3 overflow-y-auto" data-testid="assistant-thread">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <span
                className={
                  "max-w-[80%] whitespace-pre-line rounded-card px-4 py-2.5 text-body " +
                  (m.role === "user" ? "bg-primary text-white" : "border border-border bg-canvas text-content")
                }
              >
                {m.text === "…" ? <span className="text-content-muted">Thinking…</span> : m.text}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={busy}
              className="rounded-pill border border-border bg-surface px-3 py-1 text-caption text-content-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={snap ? "Ask anything about your shop…" : "Loading your books…"} aria-label="Ask the assistant" />
          <Button type="submit" disabled={busy || input.trim().length === 0}>{busy ? "…" : "Ask"}</Button>
        </form>
      </Card>

      <p className="text-caption normal-case text-content-muted">
        Free-form questions use Gemini AI on the server (your key never leaves it), grounded in your own numbers.
        Offline, the assistant still answers sales, GST, dues, expenses and stock from your device.
      </p>
    </div>
  );
}

/** Deterministic on-device fallback — used offline or if AI isn't configured. */
function makeAnswerer(snap: Snapshot | null): (q: string) => string {
  return (qRaw: string) => {
    if (!snap) return "One moment — still loading your books.";
    const q = qRaw.toLowerCase();
    const has = (...ws: string[]) => ws.some((w) => q.includes(w));
    if (has("today")) return `Today: ${rupee(snap.today.salesPaise)} sales (${snap.today.salesCount} invoices), ${rupee(snap.today.collectedPaise)} collected.`;
    if (has("month", "mtd")) return `This month so far: ${rupee(snap.month.salesPaise)} across ${snap.month.salesCount} invoices.`;
    if (has("gst", "tax")) return `GST this month — output ${rupee(snap.gst.outputTaxPaise)}, input credit ${rupee(snap.gst.inputTaxPaise)}. Net payable: ${rupee(snap.gst.netPayablePaise)}.`;
    if (has("owe", "outstanding", "due", "chase", "receivable")) return `Customers owe you ${rupee(snap.today.outstandingPaise)}. Open Credit Radar to see who to chase first.`;
    if (has("expense", "spend")) return `Expenses this month: ${rupee(snap.expenses.totalPaise)}.`;
    if (has("profit", "margin", "net")) { const p = snap.month.salesPaise - snap.month.purchasesPaise - snap.expenses.totalPaise; return `Rough profit this month: ${rupee(p)} (sales − purchases − expenses).`; }
    if (has("stock", "low", "dead")) return snap.low.length ? `${snap.low.length} item(s) low: ${snap.low.slice(0, 5).map((p) => p.name).join(", ")}. See Stock Radar.` : "Stock looks healthy.";
    return "Offline, I can answer sales, GST, dues, expenses, profit and stock. Connect to the internet for full AI answers.";
  };
}
