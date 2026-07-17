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

// --- Reports -----------------------------------------------------------------

export interface ReportsSummary {
  salesPaise: number;
  salesCount: number;
  purchasesPaise: number;
  purchaseCount: number;
  /** Money actually collected in the period (payments in). */
  collectedPaise: number;
  /** All-time unpaid balance across invoices, regardless of period. */
  outstandingPaise: number;
}

export interface LowStockRow {
  id: string;
  name: string;
  on_hand_milli: number;
}

/**
 * The headline numbers for a period plus the all-time outstanding.
 *
 * Sales and purchases sum their stored grand totals; collected sums payments in;
 * outstanding is total minus paid across every unsettled invoice. All from data
 * the transactional modules already wrote — Reports computes nothing new, it
 * just totals what is there.
 */
export async function reportsSummary(
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<ReportsSummary> {
  await ready();

  const sales = await get<{ total: number; n: number }>(
    `SELECT COALESCE(SUM(total_paise),0) AS total, COUNT(*) AS n
     FROM invoices
     WHERE org_id = ? AND deleted_at IS NULL AND date >= ? AND date <= ?`,
    [orgId, fromDate, toDate],
  );
  const purchases = await get<{ total: number; n: number }>(
    `SELECT COALESCE(SUM(total_paise),0) AS total, COUNT(*) AS n
     FROM purchases
     WHERE org_id = ? AND deleted_at IS NULL AND date >= ? AND date <= ?`,
    [orgId, fromDate, toDate],
  );
  const collected = await get<{ total: number }>(
    `SELECT COALESCE(SUM(amount_paise),0) AS total
     FROM payments
     WHERE org_id = ? AND deleted_at IS NULL AND direction = 'in'
       AND date >= ? AND date <= ?`,
    [orgId, fromDate, toDate],
  );
  const outstanding = await get<{ total: number }>(
    `SELECT COALESCE(SUM(total_paise - amount_paid_paise),0) AS total
     FROM invoices
     WHERE org_id = ? AND deleted_at IS NULL AND amount_paid_paise < total_paise`,
    [orgId],
  );

  return {
    salesPaise: sales?.total ?? 0,
    salesCount: sales?.n ?? 0,
    purchasesPaise: purchases?.total ?? 0,
    purchaseCount: purchases?.n ?? 0,
    collectedPaise: collected?.total ?? 0,
    outstandingPaise: outstanding?.total ?? 0,
  };
}

/**
 * Products at or below a stock threshold, lowest first.
 *
 * On-hand is summed from the movement ledger, same as Inventory, so a shop that
 * bought stock in Purchase and never sold it sees the true level here — the two
 * screens read the same source.
 */
export function lowStock(
  orgId: string,
  thresholdMilli: number,
  limit = 20,
): Promise<LowStockRow[]> {
  return ready().then(() =>
    all<LowStockRow>(
      `SELECT p.id, p.name,
              COALESCE((
                SELECT SUM(m.qty_milli) FROM stock_movements m
                WHERE m.product_id = p.id AND m.deleted_at IS NULL
              ), 0) AS on_hand_milli
       FROM products p
       WHERE p.org_id = ? AND p.deleted_at IS NULL
       GROUP BY p.id
       HAVING on_hand_milli <= ?
       ORDER BY on_hand_milli ASC
       LIMIT ?`,
      [orgId, thresholdMilli, limit],
    ),
  );
}

// --- GST summary -------------------------------------------------------------

export interface GstSummary {
  /** Tax collected on sales in the period (output GST, from GSTR-1 supplies). */
  outputTaxPaise: number;
  outputTaxablePaise: number;
  invoiceCount: number;
  /** Tax paid on purchases in the period (input tax credit). */
  inputTaxPaise: number;
  inputTaxablePaise: number;
  purchaseCount: number;
  /** Output minus input — what is actually payable (or a credit, if negative). */
  netPayablePaise: number;
}

/**
 * The monthly GST position: output tax minus input credit.
 *
 * This is the shape of a GSTR-3B summary — the number a shop pays each month —
 * built entirely from tax already computed by the engine and stored on each
 * invoice and purchase. Nothing is recomputed here; a total shown is a total
 * that was money-exact when the document was saved.
 *
 * Dates are inclusive `YYYY-MM-DD` bounds, matching the stored date column.
 */
export async function gstSummary(
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<GstSummary> {
  await ready();

  const out = await get<{ tax: number; taxable: number; n: number }>(
    `SELECT COALESCE(SUM(tax_paise),0) AS tax,
            COALESCE(SUM(subtotal_paise),0) AS taxable,
            COUNT(*) AS n
     FROM invoices
     WHERE org_id = ? AND deleted_at IS NULL
       AND date >= ? AND date <= ?`,
    [orgId, fromDate, toDate],
  );

  const inp = await get<{ tax: number; taxable: number; n: number }>(
    `SELECT COALESCE(SUM(tax_paise),0) AS tax,
            COALESCE(SUM(subtotal_paise),0) AS taxable,
            COUNT(*) AS n
     FROM purchases
     WHERE org_id = ? AND deleted_at IS NULL
       AND date >= ? AND date <= ?`,
    [orgId, fromDate, toDate],
  );

  const outputTaxPaise = out?.tax ?? 0;
  const inputTaxPaise = inp?.tax ?? 0;

  return {
    outputTaxPaise,
    outputTaxablePaise: out?.taxable ?? 0,
    invoiceCount: out?.n ?? 0,
    inputTaxPaise,
    inputTaxablePaise: inp?.taxable ?? 0,
    purchaseCount: inp?.n ?? 0,
    netPayablePaise: outputTaxPaise - inputTaxPaise,
  };
}

// --- Payments ----------------------------------------------------------------

export interface OutstandingInvoiceRow {
  id: string;
  number: string | null;
  date: string;
  total_paise: number;
  amount_paid_paise: number;
  status: string;
}

export interface PaymentRow {
  id: string;
  direction: string;
  invoice_id: string | null;
  amount_paise: number;
  method: string;
  date: string;
  dirty: number;
}

/**
 * Record a customer payment against an invoice.
 *
 * Two writes, one transaction: the payment row, and the invoice's running
 * amount_paid plus a derived status. Deriving the status here (not trusting a
 * client to send it) keeps "paid" honest: it is paid only when the money adds
 * up to the total.
 *
 * amount_paid is bumped by `amount_paid_paise + ?` in SQL rather than read-then-
 * written in JS, so two payments recorded close together cannot lose one to a
 * stale read.
 */
export async function recordInvoicePayment(args: {
  orgId: string;
  invoiceId: string;
  amountPaise: Paise;
  method: string;
  createdBy?: string;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO payments
              (id, direction, party_type, invoice_id, amount_paise, method, date,
               created_by, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        "in",
        "customer",
        args.invoiceId,
        args.amountPaise,
        args.method,
        now.slice(0, 10),
        args.createdBy ?? null,
        args.orgId,
        now,
      ] as (string | number | null)[],
    },
    {
      // Status is recomputed from the numbers, not passed in: paid when the
      // running total covers the invoice, else partial.
      sql: `UPDATE invoices
            SET amount_paid_paise = amount_paid_paise + ?,
                status = CASE
                  WHEN amount_paid_paise + ? >= total_paise THEN 'paid'
                  ELSE 'partial'
                END,
                dirty = 1,
                updated_at = ?
            WHERE id = ? AND org_id = ?`,
      params: [args.amountPaise, args.amountPaise, now, args.invoiceId, args.orgId],
    },
  ]);
}

/** Invoices that are not fully paid, oldest first (chase the oldest debt). */
export function listOutstandingInvoices(
  orgId: string,
  limit = 50,
): Promise<OutstandingInvoiceRow[]> {
  return ready().then(() =>
    all<OutstandingInvoiceRow>(
      `SELECT id, number, date, total_paise, amount_paid_paise, status
       FROM invoices
       WHERE org_id = ? AND deleted_at IS NULL
         AND amount_paid_paise < total_paise
       ORDER BY date ASC, updated_at ASC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

export function listPayments(orgId: string, limit = 50): Promise<PaymentRow[]> {
  return ready().then(() =>
    all<PaymentRow>(
      `SELECT id, direction, invoice_id, amount_paise, method, date, dirty
       FROM payments
       WHERE org_id = ? AND deleted_at IS NULL
       ORDER BY date DESC, updated_at DESC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

// --- Catalog & stock ---------------------------------------------------------

export interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  price_paise: number | null;
  tax_bps: number | null;
  hsn: string | null;
  /** On-hand, in milli-units, summed from stock_movements (the CRDT counter). */
  on_hand_milli: number;
  dirty: number;
}

export interface NewProduct {
  id: string;
  orgId: string;
  name: string;
  sku?: string;
  pricePaise: Paise;
  taxBps: number;
  hsn?: string;
  /** Opening stock in milli-units; recorded as the first movement, not a column. */
  openingMilli: number;
}

/**
 * Create a product and, if it opens with stock, its first movement — atomically.
 *
 * Stock is never a column on the product: it is the running sum of
 * stock_movements, so that concurrent sales on two devices both count (the CRDT
 * rule). Opening stock is just the first such movement.
 */
export async function saveProduct(product: NewProduct): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  const statements = [
    {
      sql: `INSERT INTO products
              (id, name, sku, price_paise, tax_bps, hsn, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,0,1)`,
      params: [
        product.id,
        product.name,
        product.sku ?? null,
        product.pricePaise,
        product.taxBps,
        product.hsn ?? null,
        product.orgId,
        now,
      ] as (string | number | null)[],
    },
  ];

  if (product.openingMilli !== 0) {
    statements.push({
      sql: `INSERT INTO stock_movements
              (id, product_id, type, qty_milli, ref_type, created_at, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        product.id,
        "opening",
        product.openingMilli,
        "opening",
        now,
        product.orgId,
        now,
      ],
    });
  }

  await batch(statements);
}

// --- Purchases ---------------------------------------------------------------

export interface PurchaseRow {
  id: string;
  number: string | null;
  date: string;
  status: string;
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  updated_at: string;
  dirty: number;
}

export interface PurchaseItemInput {
  /** When set, receiving this line adds to that product's stock. */
  productId?: string;
  description: string;
  qtyMilli: number;
  ratePaise: Paise;
  taxBps: number;
  amountPaise: Paise;
}

export interface NewPurchase {
  id: string;
  orgId: string;
  number: string;
  date: string;
  supplierId?: string;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  items: PurchaseItemInput[];
}

/**
 * Persist a purchase, its lines, and the stock it brings in — atomically.
 *
 * Each line tied to a product records a positive stock movement (ref_type
 * 'purchase'), so receiving goods flows into the very same movement ledger the
 * Inventory screen sums. Buying stock and selling stock are just opposite signs
 * on the same counter, which is why the two modules never disagree.
 *
 * Order matters under foreign keys: the purchase first (its items reference
 * it), then items and movements (which reference products that already exist).
 */
export async function savePurchase(purchase: NewPurchase): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  const statements: { sql: string; params: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO purchases
              (id, number, supplier_id, date, status, subtotal_paise, tax_paise,
               total_paise, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        purchase.id,
        purchase.number,
        purchase.supplierId ?? null,
        purchase.date,
        "received",
        purchase.subtotalPaise,
        purchase.taxPaise,
        purchase.totalPaise,
        purchase.orgId,
        now,
      ],
    },
  ];

  for (const item of purchase.items) {
    const itemId = crypto.randomUUID();
    statements.push({
      sql: `INSERT INTO purchase_items
              (id, purchase_id, product_id, qty_milli, rate_paise, tax_bps,
               amount_paise, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,1)`,
      params: [
        itemId,
        purchase.id,
        item.productId ?? null,
        item.qtyMilli,
        item.ratePaise,
        item.taxBps,
        item.amountPaise,
        purchase.orgId,
        now,
      ],
    });

    if (item.productId) {
      statements.push({
        sql: `INSERT INTO stock_movements
                (id, product_id, type, qty_milli, ref_type, ref_id, created_at,
                 org_id, updated_at, dirty)
              VALUES (?,?,?,?,?,?,?,?,?,1)`,
        params: [
          crypto.randomUUID(),
          item.productId,
          "purchase",
          item.qtyMilli, // positive: stock in
          "purchase",
          purchase.id,
          now,
          purchase.orgId,
          now,
        ],
      });
    }
  }

  await batch(statements);
}

/** Recent purchases for an org, newest first. */
export function listPurchases(orgId: string, limit = 50): Promise<PurchaseRow[]> {
  return ready().then(() =>
    all<PurchaseRow>(
      `SELECT id, number, date, status, subtotal_paise, tax_paise, total_paise,
              updated_at, dirty
       FROM purchases
       WHERE org_id = ? AND deleted_at IS NULL
       ORDER BY date DESC, updated_at DESC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

export async function nextPurchaseNumber(orgId: string): Promise<string> {
  await ready();
  const row = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM purchases WHERE org_id = ?`,
    [orgId],
  );
  return `PUR-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/** Record a stock movement — a signed delta, per the CRDT-counter rule. */
export async function recordMovement(args: {
  orgId: string;
  productId: string;
  type: string;
  qtyMilli: number;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();
  await batch([
    {
      sql: `INSERT INTO stock_movements
              (id, product_id, type, qty_milli, created_at, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        args.productId,
        args.type,
        args.qtyMilli,
        now,
        args.orgId,
        now,
      ],
    },
  ]);
}

/**
 * Products with their on-hand level.
 *
 * The level is SUM(stock_movements.qty_milli), not a stored count — so it is
 * always the truth even after two devices sold concurrently and their deltas
 * merged.
 */
export function listProducts(orgId: string, limit = 100): Promise<ProductRow[]> {
  return ready().then(() =>
    all<ProductRow>(
      `SELECT p.id, p.name, p.sku, p.price_paise, p.tax_bps, p.hsn, p.dirty,
              COALESCE((
                SELECT SUM(m.qty_milli) FROM stock_movements m
                WHERE m.product_id = p.id AND m.deleted_at IS NULL
              ), 0) AS on_hand_milli
       FROM products p
       WHERE p.org_id = ? AND p.deleted_at IS NULL
       ORDER BY p.name
       LIMIT ?`,
      [orgId, limit],
    ),
  );
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
