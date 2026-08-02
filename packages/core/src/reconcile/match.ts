import type { Paise } from "../types";

/**
 * UPI / bank-statement reconciliation — the pure engine.
 *
 * Kept in @vyora/core (not the web component) so the money-matching logic is
 * unit-tested and shared: the same `buildMatches` runs on a pasted statement
 * today and on a payment-gateway webhook feed later. No I/O, no React here.
 *
 * Three concerns, each a pure function:
 *   1. `parseStatement` — text → credit transactions (header-aware, tolerant).
 *   2. `extractReference` — pull the bank UTR/RRN so a credit is applied once.
 *   3. `buildMatches` — match credits to open invoices + dedupe already-applied.
 */

export type MatchConfidence = "exact" | "ref" | "amount";

export interface StatementTxn {
  date: string;
  note: string;
  amountPaise: number;
  raw: string;
  /** Bank UTR/RRN when present — the idempotency key. `null` if none found. */
  reference: string | null;
}

export interface ReconcileInvoice {
  id: string;
  number: string | null;
  totalPaise: number;
  amountPaidPaise: number;
}

export interface Match {
  txn: StatementTxn;
  invoiceId: string;
  invoiceNumber: string | null;
  remainingPaise: number;
  confidence: MatchConfidence;
  /** Applied amount, capped at the invoice's remaining balance. */
  applyPaise: number;
}

export interface ReconcileResult {
  matched: Match[];
  /** Credits whose reference was already reconciled — shown, never re-applied. */
  alreadyReconciled: StatementTxn[];
  /** Credits with no matching open invoice. */
  unmatched: StatementTxn[];
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Parse a rupee-ish cell ("1,200.00", "₹1200", "1200 Cr") into paise. Tolerant
 *  by design: bank exports are messy, and a cell we can't read is worth 0, not a
 *  thrown error that drops the whole statement. */
export function cellToPaise(cell: string): number {
  const cleaned = cell.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Extract a bank reference (UTR / RRN) from a payment note.
 *
 * A UTR is 12 digits, an RRN 12, an IMPS/NEFT ref up to 16 alphanumerics. We
 * take the longest digit run of nine or more — long enough to skip invoice
 * numbers (INV-0007), amounts (1180.00 → 118000, six digits) and dates, so what
 * remains is the transaction's own unique id. Returns `null` when there is no
 * such run, in which case the credit is matched but never deduped (we will not
 * guess an idempotency key we do not have).
 */
export function extractReference(note: string): string | null {
  const runs = note.match(/\d{9,}/g);
  if (!runs || runs.length === 0) return null;
  // Longest run wins; ties resolve to the first (left-most) occurrence.
  return runs.reduce((best, r) => (r.length > best.length ? r : best));
}

const HEADER_HINT =
  /date|narration|particular|description|remark|detail|ref|credit|deposit|amount|withdrawal|debit|balance|type/i;

/**
 * Parse a pasted statement into credit transactions.
 *
 * Header-aware: if the first row names columns we map Date / Narration / Credit
 * (or Amount + a Dr/Cr type) by name. Otherwise "last number on the line is the
 * amount, the rest is the note". Only money coming IN (credits) is kept.
 */
export function parseStatement(text: string): StatementTxn[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delim = lines[0]!.includes("\t") ? "\t" : ",";
  const split = (l: string): string[] => l.split(delim).map((c) => c.trim());

  const first = split(lines[0]!);
  const looksLikeHeader =
    first.some((c) => HEADER_HINT.test(c)) &&
    !first.some((c) => /\d{2,}/.test(c.replace(/[/-]/g, "")));

  let dateIdx = -1,
    noteIdx = -1,
    creditIdx = -1,
    amountIdx = -1,
    typeIdx = -1;

  if (looksLikeHeader) {
    first.forEach((c, i) => {
      if (dateIdx < 0 && /date/i.test(c)) dateIdx = i;
      if (noteIdx < 0 && /narration|particular|description|remark|detail|to\b|info/i.test(c)) noteIdx = i;
      // A credit column is named "credit"/"deposit", or literally "Cr" — but NOT
      // a "Dr/Cr" type column, whose "Cr" would otherwise be read as the amount.
      if (creditIdx < 0 && (/credit|deposit/i.test(c) || (/\bcr\b/i.test(c) && !/\bdr\b/i.test(c)))) creditIdx = i;
      if (amountIdx < 0 && /amount/i.test(c)) amountIdx = i;
      if (typeIdx < 0 && /type|dr.?cr|dr\/cr/i.test(c)) typeIdx = i;
    });
  }

  const rows = looksLikeHeader ? lines.slice(1) : lines;
  const out: StatementTxn[] = [];

  for (const line of rows) {
    const cells = split(line);
    let amountPaise = 0;

    if (creditIdx >= 0) {
      amountPaise = cellToPaise(cells[creditIdx] ?? "");
    } else if (amountIdx >= 0) {
      const isCredit = typeIdx >= 0 ? /cr|credit|deposit/i.test(cells[typeIdx] ?? "") : true;
      if (isCredit) amountPaise = cellToPaise(cells[amountIdx] ?? "");
    } else {
      for (let i = cells.length - 1; i >= 0; i--) {
        const p = cellToPaise(cells[i]!);
        if (p > 0) {
          amountPaise = p;
          break;
        }
      }
    }

    if (amountPaise <= 0) continue;

    const date = dateIdx >= 0 ? (cells[dateIdx] ?? "") : "";
    const note =
      noteIdx >= 0
        ? (cells[noteIdx] ?? "")
        : cells
            .filter((c) => cellToPaise(c) === 0 && !/^\d{1,2}[/-]\d{1,2}/.test(c))
            .sort((a, b) => b.length - a.length)[0] ?? line;

    out.push({ date, note, amountPaise, raw: line, reference: extractReference(note) });
  }

  return out;
}

export interface BuildMatchesInput {
  txns: StatementTxn[];
  openInvoices: ReconcileInvoice[];
  /** References already applied (from prior imports) — for idempotency. */
  reconciledRefs?: ReadonlySet<string>;
}

/**
 * Match credits to open invoices. Each invoice is claimed at most once. A credit
 * whose bank reference was already reconciled is separated out so it can never
 * be applied twice — the guarantee that re-importing an overlapping statement
 * does not double-pay an invoice.
 *
 * Precedence: invoice number in the note + amount agrees (`exact`) → number
 * matched, amount differs, i.e. a part-payment (`ref`) → a single open invoice
 * whose balance equals the credit (`amount`).
 */
export function buildMatches(input: BuildMatchesInput): ReconcileResult {
  const reconciledRefs = input.reconciledRefs ?? new Set<string>();
  const used = new Set<string>();
  const matched: Match[] = [];
  const alreadyReconciled: StatementTxn[] = [];
  const unmatched: StatementTxn[] = [];

  const open = input.openInvoices.map((o) => ({
    ...o,
    remaining: o.totalPaise - o.amountPaidPaise,
    numNorm: o.number ? normalize(o.number) : "",
  }));

  for (const txn of input.txns) {
    // Idempotency guard first: a credit we have already applied is never re-matched.
    if (txn.reference && reconciledRefs.has(txn.reference)) {
      alreadyReconciled.push(txn);
      continue;
    }

    const noteNorm = normalize(txn.note);

    // 1) Invoice number present in the note.
    const refCandidates = open.filter(
      (o) => !used.has(o.id) && o.numNorm.length >= 3 && noteNorm.includes(o.numNorm),
    );
    let picked = refCandidates.find((o) => o.remaining === txn.amountPaise) ?? refCandidates[0];
    let confidence: MatchConfidence | null = picked
      ? picked.remaining === txn.amountPaise
        ? "exact"
        : "ref"
      : null;

    // 2) No ref — a unique open invoice whose balance equals the credit.
    if (!picked) {
      const amtCandidates = open.filter(
        (o) => !used.has(o.id) && o.remaining === txn.amountPaise,
      );
      if (amtCandidates.length === 1) {
        picked = amtCandidates[0];
        confidence = "amount";
      }
    }

    if (picked && confidence) {
      used.add(picked.id);
      matched.push({
        txn,
        invoiceId: picked.id,
        invoiceNumber: picked.number,
        remainingPaise: picked.remaining,
        confidence,
        applyPaise: Math.min(txn.amountPaise, picked.remaining) as Paise,
      });
    } else {
      unmatched.push(txn);
    }
  }

  return { matched, alreadyReconciled, unmatched };
}
