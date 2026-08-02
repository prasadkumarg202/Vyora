"use client";

import {
  formatPaise,
  rupeesToPaise,
  type BusinessTypeConfig,
  type Paise,
} from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  expensesSummary,
  listExpenses,
  saveExpense,
  type ExpenseRow,
  type ExpensesSummary,
} from "~/lib/db/repository";

/**
 * The Expenses module (route: /expenses).
 *
 * Every rupee that leaves the business that is not a supplier bill — rent,
 * salaries, transport, utilities. Recorded offline-first like every write: the
 * row is marked dirty until the sync engine flushes it. Money is integer paise
 * end to end, so the month total is exact. Receipt OCR (snap a bill, auto-fill
 * amount and category) is the AI enhancement that lands with the copilot; the
 * manual entry here is the ground truth it will pre-fill.
 */

const CATEGORIES = [
  "Rent",
  "Salaries",
  "Utilities",
  "Transport",
  "Supplies",
  "Marketing",
  "Repairs",
  "Bank charges",
  "Other",
] as const;

function todayYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function monthStartYmd(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-01`;
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

export function ExpensesModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [monthTotal, setMonthTotal] = useState<ExpensesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState("");
  const [recurring, setRecurring] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [list, summary] = await Promise.all([
        listExpenses(orgId),
        expensesSummary(orgId, monthStartYmd(), todayYmd()),
      ]);
      setRows(list);
      setMonthTotal(summary);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canSave = useMemo(
    () => safePaise(amount) > 0 && date.length === 10,
    [amount, date],
  );

  async function handleCreate() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const trimmedNote = note.trim();
      await saveExpense({
        id: crypto.randomUUID(),
        orgId,
        category,
        amountPaise: safePaise(amount),
        date,
        recurring,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      setAmount("");
      setNote("");
      setRecurring(false);
      setDate(todayYmd());
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
          <h1 className="text-h1">Expenses</h1>
          <p className="text-body text-content-muted">
            Money out that is not a supplier bill. Works offline; totals feed
            your profit view.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
          <span className="text-caption font-medium uppercase text-content-muted">
            Spent this month
          </span>
          <span className="font-mono text-h2">
            {monthTotal ? formatPaise(monthTotal.totalPaise as Paise) : "…"}
          </span>
          <span className="text-caption normal-case text-content-muted">
            {monthTotal
              ? `${monthTotal.count} ${monthTotal.count === 1 ? "entry" : "entries"}`
              : ""}
          </span>
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-12 items-end gap-2">
          <div className="col-span-3 flex flex-col gap-1">
            <Label htmlFor="e-amount">Amount (₹)</Label>
            <Input
              id="e-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              className="font-mono"
              placeholder="0.00"
            />
          </div>
          <div className="col-span-3 flex flex-col gap-1">
            <Label htmlFor="e-category">Category</Label>
            <select
              id="e-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-h-touch rounded-input border border-border bg-surface px-3 text-body-lg text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-3 flex flex-col gap-1">
            <Label htmlFor="e-date">Date</Label>
            <Input
              id="e-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="col-span-3 flex items-center gap-2 pb-2.5">
            <input
              id="e-recurring"
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <Label htmlFor="e-recurring" className="cursor-pointer">
              Recurring
            </Label>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="e-note">Note</Label>
          <Input
            id="e-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional — what was this for?"
          />
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
          disabled={saving || !canSave}
          data-testid="add-expense"
          className="self-start"
        >
          {saving ? "Saving…" : "Add expense"}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Recent expenses</h2>

        {rows === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No expenses yet"
            description="Record your first expense above — it stays on this device and syncs when you reconnect."
          />
        ) : (
          <Card className="p-0" data-testid="expense-list">
            <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-caption font-medium uppercase text-content-muted">
              <span className="col-span-2">Date</span>
              <span className="col-span-3">Category</span>
              <span className="col-span-4">Note</span>
              <span className="col-span-3 text-right">Amount</span>
            </div>
            <div className="divide-y divide-border">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-12 items-center gap-3 px-4 py-3"
                  data-testid="expense-row"
                >
                  <span className="col-span-2 font-mono text-body text-content-muted">
                    {r.date}
                  </span>
                  <span className="col-span-3 flex items-center gap-2 text-body">
                    {r.category ?? "—"}
                    {r.recurring ? (
                      <Badge tone="neutral">Recurring</Badge>
                    ) : null}
                    {r.dirty ? (
                      <Badge tone="warning" dot>
                        Unsynced
                      </Badge>
                    ) : null}
                  </span>
                  <span className="col-span-4 truncate text-body text-content-muted">
                    {r.note ?? "—"}
                  </span>
                  <span className="col-span-3 text-right font-mono text-body font-medium">
                    {formatPaise(r.amount_paise as Paise)}
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
