"use client";

import type { Paise } from "@vyora/core";

import { all, batch, get, openDatabase } from "./client";

/**
 * Typed access to the local database.
 *
 * Screens call these, never raw SQL — so the sync bookkeeping (version,
 * dirty, updated_at, org_id, tombstones) is applied in one place instead of
 * being forgotten at a call site. Every write here is a local write: it
 * completes whether or not there is a network, which is the offline-first
 * promise. Flushing these dirty rows to the server is the sync engine's job and
 * needs the unlocked DEK, so it is deliberately not here yet.
 */

export interface InvoiceRow {
  id: string;
  number: string | null;
  customer_id: string | null;
  date: string;
  status: string;
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  updated_at: string;
  version: number;
  dirty: number;
}

export interface InvoiceItemInput {
  description: string;
  productId?: string;
  qtyMilli: number;
  ratePaise: Paise;
  taxBps: number;
  amountPaise: Paise;
}

export interface NewInvoice {
  id: string;
  orgId: string;
  number: string;
  date: string;
  customerId?: string;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  createdBy?: string;
  items: InvoiceItemInput[];
}

let opened: Promise<unknown> | null = null;

/** Open once per tab; every repository call awaits it. */
export function ready(): Promise<unknown> {
  opened ??= openDatabase();
  return opened;
}

/**
 * Persist an invoice and its lines atomically, marked dirty.
 *
 * dirty = 1 and version = 0 say "created locally, not yet acknowledged by the
 * server". The sync engine keys off exactly those columns to find what to
 * flush; version becomes authoritative only when the server assigns it.
 *
 * The invoice goes first, then its items: invoice_items.invoice_id references
 * invoices(id), so with foreign_keys ON the items would fail if their parent
 * did not exist yet. The whole set runs in one worker transaction, so a reader
 * never catches a half-written invoice and a failure rolls the lot back.
 */
export async function saveInvoice(invoice: NewInvoice): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  const statements = [
    {
      sql: `INSERT INTO invoices
              (id, number, customer_id, date, status, subtotal_paise, tax_paise,
               total_paise, created_by, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        invoice.id,
        invoice.number,
        invoice.customerId ?? null,
        invoice.date,
        "issued",
        invoice.subtotalPaise,
        invoice.taxPaise,
        invoice.totalPaise,
        invoice.createdBy ?? null,
        invoice.orgId,
        now,
      ],
    },
    ...invoice.items.map((item) => ({
      sql: `INSERT INTO invoice_items
              (id, invoice_id, product_id, description, qty_milli, rate_paise,
               tax_bps, amount_paise, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        invoice.id,
        item.productId ?? null,
        item.description,
        item.qtyMilli,
        item.ratePaise,
        item.taxBps,
        item.amountPaise,
        invoice.orgId,
        now,
      ],
    })),
  ];

  await batch(statements);
}

/** Recent invoices for an org, newest first, tombstones hidden. */
export function listInvoices(orgId: string, limit = 50): Promise<InvoiceRow[]> {
  return ready().then(() =>
    all<InvoiceRow>(
      `SELECT id, number, customer_id, date, status,
              subtotal_paise, tax_paise, total_paise, updated_at, version, dirty
       FROM invoices
       WHERE org_id = ? AND deleted_at IS NULL
       ORDER BY date DESC, updated_at DESC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

/** Count of invoices with un-flushed local changes — feeds the sync pill. */
export async function pendingCount(orgId: string): Promise<number> {
  await ready();
  const row = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND dirty = 1`,
    [orgId],
  );
  return row?.n ?? 0;
}

/**
 * The next invoice number for an org.
 *
 * Local and monotonic per device. This is a *display* sequence, not an identity
 * — the spec resolves cross-device number collisions server-side while the UUID
 * stays stable, so two offline devices both minting "INV-42" is expected and
 * harmless.
 */
export async function nextInvoiceNumber(orgId: string): Promise<string> {
  await ready();
  const row = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM invoices WHERE org_id = ?`,
    [orgId],
  );
  return `INV-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}
