"use client";

import {
  formatPaise,
  type BusinessTypeConfig,
  type Paise,
} from "@vyora/core";
import { Badge, Button, Card, Input } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
 * This answers real questions about the shop today — offline, with no API key —
 * by reading the same local ledger every module writes to. Ask "sales today",
 * "GST this month", "who owes me", "low stock" and it replies from
 * money-exact figures, not an estimate. When an AI provider key is added, the
 * same panel gains free-form natural-language chat and OCR bill capture; the
 * deterministic answers here become the copilot's grounded tools so it can never
 * hallucinate a number that disagrees with the books.
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

const SUGGESTIONS = [
  "Sales today",
  "This month",
  "GST payable",
  "Who owes me",
  "Low stock",
  "Profit this month",
] as const;

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      text:
        "Hi! I read your shop's live books on this device — even offline. Ask me about sales, GST, dues or stock, or tap a suggestion below.",
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
  }, [msgs]);

  const answer = useMemo(() => makeAnswerer(snap), [snap]);

  function ask(qRaw: string) {
    const q = qRaw.trim();
    if (!q) return;
    const reply = answer(q);
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "assistant", text: reply }]);
    setInput("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">AI Assistant</h1>
          <p className="text-body text-content-muted">
            Your copilot — answers from this device&apos;s books, online or not.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <div
          ref={listRef}
          className="flex max-h-[22rem] flex-col gap-3 overflow-y-auto"
          data-testid="assistant-thread"
        >
          {msgs.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <span
                className={
                  "max-w-[80%] whitespace-pre-line rounded-card px-4 py-2.5 text-body " +
                  (m.role === "user"
                    ? "bg-primary text-white"
                    : "border border-border bg-canvas text-content")
                }
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-pill border border-border bg-surface px-3 py-1 text-caption text-content-muted transition-colors hover:border-primary hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={snap ? "Ask about sales, GST, dues, stock…" : "Loading your books…"}
            aria-label="Ask the assistant"
          />
          <Button type="submit" disabled={!snap || input.trim().length === 0}>
            Ask
          </Button>
        </form>
      </Card>

      <p className="text-caption normal-case text-content-muted">
        Answers are computed from your saved records — always money-exact. Free-form
        chat and bill-photo (OCR) capture switch on once an AI provider key is added
        in Administration.
      </p>
    </div>
  );
}

/** Deterministic intent → grounded answer. The copilot's toolset. */
function makeAnswerer(snap: Snapshot | null): (q: string) => string {
  return (qRaw: string) => {
    if (!snap) return "One moment — still loading your books.";
    const q = qRaw.toLowerCase();
    const rupee = (p: number) => formatPaise(p as Paise);

    const has = (...ws: string[]) => ws.some((w) => q.includes(w));

    if (has("today") && has("sale", "sold", "revenue", "business")) {
      return `Today you've billed ${rupee(snap.today.salesPaise)} across ${snap.today.salesCount} invoice(s), and collected ${rupee(snap.today.collectedPaise)}.`;
    }
    if (has("today")) {
      return `Today: ${rupee(snap.today.salesPaise)} sales (${snap.today.salesCount} invoices), ${rupee(snap.today.collectedPaise)} collected.`;
    }
    if (has("month", "mtd") && has("sale", "revenue")) {
      return `This month so far: ${rupee(snap.month.salesPaise)} in sales across ${snap.month.salesCount} invoices.`;
    }
    if (has("gst", "tax")) {
      return `GST this month — output ${rupee(snap.gst.outputTaxPaise)} on sales, input credit ${rupee(snap.gst.inputTaxPaise)} on purchases. Net payable: ${rupee(snap.gst.netPayablePaise)}.`;
    }
    if (has("owe", "outstanding", "due", "receivable", "pending payment")) {
      return `Customers owe you ${rupee(snap.today.outstandingPaise)} in unpaid invoices. Open Payments to send reminders.`;
    }
    if (has("expense", "spend", "spent")) {
      return `Expenses this month: ${rupee(snap.expenses.totalPaise)} across ${snap.expenses.count} entr${snap.expenses.count === 1 ? "y" : "ies"}.`;
    }
    if (has("profit", "margin", "net", "earning")) {
      const profit = snap.month.salesPaise - snap.month.purchasesPaise - snap.expenses.totalPaise;
      return `Rough profit this month: ${rupee(profit)} — sales ${rupee(snap.month.salesPaise)} minus purchases ${rupee(snap.month.purchasesPaise)} and expenses ${rupee(snap.expenses.totalPaise)}. (Cash view; accountant P&L in Accounting.)`;
    }
    if (has("low", "stock", "reorder", "out of")) {
      if (snap.low.length === 0) return "Stock looks healthy — nothing at or below the reorder level.";
      const names = snap.low.slice(0, 5).map((p) => p.name).join(", ");
      return `${snap.low.length} item(s) running low: ${names}${snap.low.length > 5 ? "…" : ""}. Open Inventory to restock.`;
    }
    if (has("collect")) {
      return `Collected today: ${rupee(snap.today.collectedPaise)}.`;
    }
    if (has("hi", "hello", "help", "what can")) {
      return "I can tell you: sales today or this month, GST payable, who owes you money, expenses, rough profit, and what's low on stock. Try a suggestion below.";
    }
    return "I can answer about sales, GST, outstanding dues, expenses, profit and low stock right now. Free-form questions unlock with an AI provider key. Try one of the suggestions below.";
  };
}
