"use client";

import {
  buildMatches,
  formatPaise,
  parseStatement,
  type BusinessTypeConfig,
  type MatchConfidence,
  type Paise,
  type StatementTxn,
} from "@vyora/core";
import { Badge, Button, Card, EmptyState } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  listCustomers,
  listInvoices,
  listOutstandingInvoices,
  listReconciledReferences,
  recordInvoicePayment,
  type CustomerRow,
  type InvoiceRow,
  type OutstandingInvoiceRow,
} from "~/lib/db/repository";

/**
 * UPI Auto-Match / Reconciliation (route: /reconcile) — a Vyora Edge feature.
 *
 * The shop pastes (or uploads) the day's UPI / bank statement and Vyora matches
 * each credit to an open invoice — by the invoice number in the payment note,
 * then by an exact amount — and marks them paid in one tap. Entirely on-device:
 * no gateway, no contract, works offline.
 *
 * The matching itself lives in @vyora/core (`buildMatches`), unit-tested and
 * ready to run on a gateway webhook feed later. This module is the screen around
 * it. Idempotency is enforced end to end: each applied credit stores its bank
 * reference, and a re-imported statement shows those credits as already done
 * instead of paying the invoice twice.
 */

const rupee = (p: number): string => formatPaise(p as Paise);
const SAMPLE = `Date,Narration,Credit,Type
18/07/2026,UPI/INV-0007/Ravi Kumar 425011234567,1180.00,CR
18/07/2026,UPI/425011/GPay,2500.00,CR
17/07/2026,NEFT INV-0005 Sharma Traders,999.00,CR`;

export function ReconcileModule({
  orgId,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [outstanding, setOutstanding] = useState<OutstandingInvoiceRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [reconciledRefs, setReconciledRefs] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [txns, setTxns] = useState<StatementTxn[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [o, i, c, refs] = await Promise.all([
        listOutstandingInvoices(orgId, 2000),
        listInvoices(orgId, 2000),
        listCustomers(orgId, 2000),
        listReconciledReferences(orgId),
      ]);
      setOutstanding(o);
      setInvoices(i);
      setCustomers(c);
      setReconciledRefs(refs);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const custName = useCallback(
    (invId: string) => {
      const inv = invoices.find((i) => i.id === invId);
      const c = inv?.customer_id ? customers.find((x) => x.id === inv.customer_id) : null;
      return c?.name ?? "—";
    },
    [invoices, customers],
  );

  /** Run the shared, tested engine over the parsed statement. */
  const result = useMemo(() => {
    if (!txns) return null;
    return buildMatches({
      txns,
      openInvoices: outstanding.map((o) => ({
        id: o.id,
        number: o.number,
        totalPaise: o.total_paise,
        amountPaidPaise: o.amount_paid_paise,
      })),
      reconciledRefs,
    });
  }, [txns, outstanding, reconciledRefs]);

  const matched = result?.matched ?? [];
  const alreadyReconciled = result?.alreadyReconciled ?? [];
  const unmatched = result?.unmatched ?? [];

  function runMatch() {
    setError(null);
    setFlash(null);
    setTxns(parseStatement(text));
    setChecked(new Set());
  }

  // Once matches are computed for the freshly parsed txns, auto-select the
  // high-confidence rows (exact + ref) so "Apply" is one tap.
  useEffect(() => {
    if (!txns) return;
    const pre = new Set<number>();
    matched.forEach((m, i) => {
      if (m.confidence === "exact" || m.confidence === "ref") pre.add(i);
    });
    setChecked(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns]);

  function toggle(i: number) {
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function applySelected() {
    if (checked.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = matched.filter((_, i) => checked.has(i));
      let count = 0;
      let total = 0;
      for (const m of chosen) {
        if (m.applyPaise <= 0) continue;
        await recordInvoicePayment({
          orgId,
          invoiceId: m.invoiceId,
          amountPaise: m.applyPaise as Paise,
          method: "upi",
          reference: m.txn.reference,
        });
        count += 1;
        total += m.applyPaise;
      }
      await load();
      setTxns(null);
      setChecked(new Set());
      setText("");
      setFlash(`Reconciled ${count} payment${count === 1 ? "" : "s"} · ${rupee(total)} marked received.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  const totalOutstanding = outstanding.reduce(
    (n, o) => n + (o.total_paise - o.amount_paid_paise),
    0,
  );
  const selectedTotal = matched.filter((_, i) => checked.has(i)).reduce((n, m) => n + m.applyPaise, 0);
  const badgeTone = (c: MatchConfidence): "success" | "info" | "warning" =>
    c === "exact" ? "success" : c === "ref" ? "info" : "warning";
  const badgeLabel = (c: MatchConfidence) =>
    c === "exact" ? "Ref + amount" : c === "ref" ? "Invoice ref" : "Amount match";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">UPI Auto-Match</h1>
          <p className="text-body text-content-muted">
            Paste your UPI or bank statement — Vyora matches each credit to an open invoice and marks it paid.
          </p>
        </div>
        <Badge tone="primary">Vyora Edge</Badge>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">{error}</p>
      ) : null}
      {flash ? (
        <p className="rounded-control border border-success-border bg-success-tonal px-3 py-2 text-body text-success">{flash}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open invoices" value={String(outstanding.length)} />
        <Kpi label="Total outstanding" value={rupee(totalOutstanding)} tone="warning" />
        <Kpi label="Credits found" value={txns ? String(txns.length) : "—"} />
        <Kpi label="Auto-matched" value={txns ? String(matched.length) : "—"} tone="success" />
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3">Statement</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setText(SAMPLE)} className="text-caption font-medium text-primary hover:underline">Load sample</button>
            <button onClick={() => fileRef.current?.click()} className="text-caption font-medium text-primary hover:underline">Upload CSV</button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="hidden" />
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"Paste rows from your UPI / bank statement.\nWith headers (Date, Narration, Credit) or plain \"note, amount\" lines both work."}
          className="w-full rounded-input border border-border bg-surface p-3 font-mono text-caption"
        />
        <div className="flex items-center gap-3">
          <Button onClick={runMatch} disabled={!text.trim()}>Match</Button>
          <span className="text-caption normal-case text-content-muted">
            Tip: your Vyora UPI QRs already carry the invoice number in the payment note, so most match exactly.
          </span>
        </div>
      </Card>

      {txns ? (
        matched.length === 0 && unmatched.length === 0 && alreadyReconciled.length === 0 ? (
          <EmptyState title="No credits found" description="Check that the statement has a credit / deposit column, or paste 'note, amount' lines." />
        ) : (
          <>
            {matched.length > 0 ? (
              <Card className="flex flex-col gap-3 p-0">
                <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                  <h2 className="text-h3">Matched ({matched.length})</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-caption normal-case text-content-muted">
                      {checked.size} selected · {rupee(selectedTotal)}
                    </span>
                    <Button size="sm" onClick={applySelected} disabled={busy || checked.size === 0}>
                      {busy ? "Applying…" : `Mark ${checked.size} paid`}
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-body">
                    <thead>
                      <tr className="border-b border-border text-caption uppercase text-content-muted">
                        <th className="p-3"></th>
                        <th className="p-3">Payment note</th>
                        <th className="p-3 text-right">Credit</th>
                        <th className="p-3">Invoice</th>
                        <th className="p-3">Customer</th>
                        <th className="p-3 text-right">Balance</th>
                        <th className="p-3 text-center">Match</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {matched.map((m, i) => (
                        <tr key={m.txn.raw + i}>
                          <td className="p-3">
                            <input type="checkbox" className="h-4 w-4 accent-primary" checked={checked.has(i)} onChange={() => toggle(i)} aria-label={`Select ${m.invoiceNumber ?? "invoice"}`} />
                          </td>
                          <td className="max-w-[220px] truncate p-3 font-mono text-caption text-content-muted" title={m.txn.note}>{m.txn.note || "—"}</td>
                          <td className="p-3 text-right font-mono">{rupee(m.txn.amountPaise)}</td>
                          <td className="p-3 font-medium">{m.invoiceNumber ?? "—"}</td>
                          <td className="p-3">{custName(m.invoiceId)}</td>
                          <td className="p-3 text-right font-mono text-content-muted">{rupee(m.remainingPaise)}</td>
                          <td className="p-3 text-center"><Badge tone={badgeTone(m.confidence)}>{badgeLabel(m.confidence)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            {alreadyReconciled.length > 0 ? (
              <Card className="flex flex-col gap-2 p-5">
                <h2 className="text-h3">Already reconciled ({alreadyReconciled.length})</h2>
                <p className="text-caption normal-case text-content-muted">
                  These credits were applied in an earlier import (matched on the bank reference), so Vyora skipped them — no invoice is paid twice.
                </p>
                <div className="flex flex-col divide-y divide-border">
                  {alreadyReconciled.map((t, i) => (
                    <div key={t.raw + i} className="flex items-center justify-between gap-3 py-2">
                      <span className="max-w-[70%] truncate font-mono text-caption text-content-muted" title={t.note}>{t.note || t.raw}</span>
                      <span className="font-mono text-body text-content-muted">{rupee(t.amountPaise)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {unmatched.length > 0 ? (
              <Card className="flex flex-col gap-2 p-5">
                <h2 className="text-h3">Unmatched credits ({unmatched.length})</h2>
                <p className="text-caption normal-case text-content-muted">
                  No open invoice matched these — an advance, a non-sale credit, or an invoice already settled. Record them manually from Payments if needed.
                </p>
                <div className="flex flex-col divide-y divide-border">
                  {unmatched.map((t, i) => (
                    <div key={t.raw + i} className="flex items-center justify-between gap-3 py-2">
                      <span className="max-w-[70%] truncate font-mono text-caption text-content-muted" title={t.note}>{t.note || t.raw}</span>
                      <span className="font-mono text-body">{rupee(t.amountPaise)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </>
        )
      ) : null}

      <p className="text-caption normal-case text-content-muted">
        Matching is offline and on-device. Exact = invoice number in the note and the amount agrees; Invoice ref = number matched, amount differed (a part-payment); Amount match = a single open invoice with that exact balance. You confirm before anything is marked paid, and a credit already applied in a past import is never paid again.
      </p>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" | "success" }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
      <span className="text-caption font-medium uppercase text-content-muted">{label}</span>
      <span className={"font-mono text-h2 " + (tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "")}>{value}</span>
    </div>
  );
}
