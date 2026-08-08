"use client";

import type { JsonValue, Paise } from "@vyora/core";

import { all, batch, get, openDatabase, run } from "./client";

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
  productId?: string | undefined;
  qtyMilli: number;
  ratePaise: Paise;
  taxBps: number;
  amountPaise: Paise;
  /**
   * The vertical's captured fields for this line, coerced to canonical types by
   * the metadata engine (batch/expiry/MRP/schedule for a chemist, HUID/purity
   * for a jeweller, …). Stored as JSON in invoice_items.meta so reports like
   * "Expiry alerts" and "Salt-wise sales" can read them back. Empty for the
   * generic (no business-type) path.
   */
  meta?: Record<string, JsonValue> | undefined;
}

/**
 * The document-level facts an invoice carries beyond its lines.
 *
 * Stored in `invoices.custom_fields` rather than in columns of their own:
 * nothing queries or filters on them, only the printed document reads them
 * back, and a column apiece would be a migration on both the local SQLite
 * schema and Postgres for text and two totals.
 */
export interface InvoiceExtrasInput {
  notes?: string | undefined;
  terms?: string | undefined;
  discountPaise?: number | undefined;
  chargesPaise?: number | undefined;
  charges?:
    | readonly { label: string; amountPaise: number; gstBps?: number }[]
    | undefined;
  roundOffPaise?: number | undefined;
}

export interface NewInvoice {
  id: string;
  orgId: string;
  number: string;
  date: string;
  customerId?: string | undefined;
  extras?: InvoiceExtrasInput | undefined;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  createdBy?: string | undefined;
  items: InvoiceItemInput[];
}

let opened: Promise<unknown> | null = null;

/** Open once per tab; every repository call awaits it. */
export function ready(): Promise<unknown> {
  opened ??= openDatabase();
  return opened;
}

// --- Device settings (local KV, e.g. UPI id, shop name) ----------------------

/**
 * Read a local setting from the `sync_state` KV table. Device-local by design
 * (that table never syncs), which is right for things like the collection UPI
 * id and shop name that a phone owns until a synced business profile lands.
 */
export async function getSetting(key: string): Promise<string | null> {
  await ready();
  const row = await get<{ value: string }>(
    `SELECT value FROM sync_state WHERE key = ?`,
    [key],
  );
  return row?.value ?? null;
}

/** Write a local setting (upsert). */
export async function setSetting(key: string, value: string): Promise<void> {
  await ready();
  await run(
    `INSERT INTO sync_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
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
               total_paise, custom_fields, created_by, org_id, updated_at,
               version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        invoice.id,
        invoice.number,
        invoice.customerId ?? null,
        invoice.date,
        "issued",
        invoice.subtotalPaise,
        invoice.taxPaise,
        invoice.totalPaise,
        JSON.stringify(invoice.extras ?? {}),
        invoice.createdBy ?? null,
        invoice.orgId,
        now,
      ],
    },
    ...invoice.items.map((item) => ({
      sql: `INSERT INTO invoice_items
              (id, invoice_id, product_id, description, qty_milli, rate_paise,
               tax_bps, amount_paise, meta, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        invoice.id,
        item.productId ?? null,
        item.description,
        item.qtyMilli,
        item.ratePaise,
        item.taxBps,
        item.amountPaise,
        JSON.stringify(item.meta ?? {}),
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
  createdBy?: string | undefined;
  /** Bank UTR/RRN, when reconciling a statement — makes the write idempotent. */
  reference?: string | null | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO payments
              (id, direction, party_type, invoice_id, amount_paise, method, date,
               created_by, reference, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        "in",
        "customer",
        args.invoiceId,
        args.amountPaise,
        args.method,
        now.slice(0, 10),
        args.createdBy ?? null,
        args.reference ?? null,
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
      params: [
        args.amountPaise,
        args.amountPaise,
        now,
        args.invoiceId,
        args.orgId,
      ],
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

/**
 * Bank references already applied for this org — the reconcile flow's dedupe
 * set, so re-importing an overlapping statement never double-records a credit.
 */
export async function listReconciledReferences(
  orgId: string,
): Promise<Set<string>> {
  await ready();
  const rows = await all<{ reference: string }>(
    `SELECT DISTINCT reference FROM payments
     WHERE org_id = ? AND reference IS NOT NULL AND deleted_at IS NULL`,
    [orgId],
  );
  return new Set(rows.map((r) => r.reference));
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

// --- Marketing ---------------------------------------------------------------

export interface CampaignRow {
  id: string;
  name: string;
  channel: string;
  message: string | null;
  status: string;
  updated_at: string;
  dirty: number;
}

/**
 * Persist a marketing campaign as a draft, marked dirty.
 *
 * Like every local write, dirty = 1 and version = 0 say "created on this device,
 * not yet acknowledged by the server" — the sync engine keys off exactly those
 * columns. No message is actually delivered here; this is a local record only.
 */
export async function saveCampaign(args: {
  id: string;
  orgId: string;
  name: string;
  channel: string;
  message?: string | undefined;
  createdBy?: string | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO marketing_campaigns
              (id, name, channel, message, status, created_by, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,0,1)`,
      params: [
        args.id,
        args.name,
        args.channel,
        args.message ?? null,
        "draft",
        args.createdBy ?? null,
        args.orgId,
        now,
      ] as (string | number | null)[],
    },
  ]);
}

/** Campaigns for an org, newest first, tombstones hidden. */
export function listCampaigns(
  orgId: string,
  limit = 50,
): Promise<CampaignRow[]> {
  return ready().then(() =>
    all<CampaignRow>(
      `SELECT id, name, channel, message, status, updated_at, dirty
       FROM marketing_campaigns
       WHERE org_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

/**
 * Flip a draft campaign to 'sent' — a local update only, no message is sent.
 *
 * Sets dirty = 1 and bumps updated_at, scoped by org_id and id, so the sync
 * engine picks up the change like recordInvoicePayment's UPDATE.
 */
export async function markCampaignSent(args: {
  orgId: string;
  campaignId: string;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `UPDATE marketing_campaigns
            SET status = 'sent',
                dirty = 1,
                updated_at = ?
            WHERE id = ? AND org_id = ?`,
      params: [now, args.campaignId, args.orgId],
    },
  ]);
}

// --- Customers ---------------------------------------------------------------

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  updated_at: string;
  version: number;
  dirty: number;
}

/**
 * Persist a customer, marked dirty.
 *
 * dirty = 1 and version = 0 say "created locally, not yet acknowledged by the
 * server", exactly like every other local write; balance_paise, loyalty_points
 * and custom_fields keep their schema defaults. Optional phone/gstin are stored
 * as NULL when blank rather than an empty string.
 */
export async function saveCustomer(customer: {
  id: string;
  orgId: string;
  name: string;
  phone?: string | undefined;
  gstin?: string | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO customers
              (id, name, phone, gstin, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,0,1)`,
      params: [
        customer.id,
        customer.name,
        customer.phone ?? null,
        customer.gstin ?? null,
        customer.orgId,
        now,
      ] as (string | number | null)[],
    },
  ]);
}

/** Customers for an org, newest first, tombstones hidden. */
export function listCustomers(
  orgId: string,
  limit = 100,
): Promise<CustomerRow[]> {
  return ready().then(() =>
    all<CustomerRow>(
      `SELECT id, name, phone, gstin, updated_at, version, dirty
       FROM customers
       WHERE org_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC
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
  sku?: string | undefined;
  pricePaise: Paise;
  taxBps: number;
  hsn?: string | undefined;
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
  productId?: string | undefined;
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
  supplierId?: string | undefined;
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
export function listPurchases(
  orgId: string,
  limit = 50,
): Promise<PurchaseRow[]> {
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
export function listProducts(
  orgId: string,
  limit = 100,
): Promise<ProductRow[]> {
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
 * One catalogue product, as the billing line needs it.
 *
 * Deliberately its own type rather than reusing ProductRow: the till cares
 * about MRP (for the "selling price ≤ MRP" rule a chemist is held to) and does
 * not care about the dirty flag, and a picker that dragged the whole product
 * row through would tempt callers into writing back to it.
 */
export interface ProductPick {
  id: string;
  name: string;
  sku: string | null;
  hsn: string | null;
  tax_bps: number | null;
  price_paise: number | null;
  mrp_paise: number | null;
  on_hand_milli: number;
}

/**
 * Products matching what the shopkeeper has typed into a billing line.
 *
 * Runs against the local SQLite copy, so it answers while the counter is
 * offline — which is the only reason it is worth putting a lookup in the
 * billing path at all. A search that needs the network would be slower than
 * typing the HSN by hand.
 *
 * Matches name, SKU and HSN, because all three are things a shop actually
 * reaches for: the name when serving a customer, the SKU when reading a label,
 * the HSN when a CA has asked about one. Exact and prefix matches sort first —
 * typing "cro" should offer Crocin before Microcin.
 */
export async function searchProducts(
  orgId: string,
  query: string,
  limit = 8,
): Promise<ProductPick[]> {
  await ready();
  const term = query.trim();
  if (!term) return [];

  // % and _ are wildcards. A shopkeeper typing a product name with an
  // underscore should search for that underscore, not for any character.
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  const contains = `%${escaped}%`;
  const prefix = `${escaped}%`;

  return all<ProductPick>(
    `SELECT p.id, p.name, p.sku, p.hsn, p.tax_bps, p.price_paise, p.mrp_paise,
            COALESCE((
              SELECT SUM(m.qty_milli) FROM stock_movements m
              WHERE m.product_id = p.id AND m.deleted_at IS NULL
            ), 0) AS on_hand_milli
       FROM products p
      WHERE p.org_id = ?
        AND p.deleted_at IS NULL
        AND (p.name LIKE ? ESCAPE '\\'
          OR p.sku  LIKE ? ESCAPE '\\'
          OR p.hsn  LIKE ? ESCAPE '\\')
      ORDER BY
        CASE WHEN p.name LIKE ? ESCAPE '\\' THEN 0
             WHEN p.sku  LIKE ? ESCAPE '\\' THEN 1
             ELSE 2 END,
        p.name
      LIMIT ?`,
    [orgId, contains, contains, contains, prefix, prefix, limit],
  );
}

/**
 * Products this shop bills most often, then its newest ones.
 *
 * The default set of till shortcuts. Ordered by how many bills a product has
 * appeared on rather than by revenue: a grocery sells one gas stove and four
 * hundred packets of salt, and it is the salt that needs a key.
 *
 * A brand-new shop has no billing history at all, so recently-added products
 * fill the rest — on day one, the things they bothered to register *are* the
 * things they sell.
 */
export async function suggestedQuickKeyProducts(
  orgId: string,
  limit = 9,
): Promise<ProductPick[]> {
  await ready();
  return all<ProductPick>(
    `SELECT p.id, p.name, p.sku, p.hsn, p.tax_bps, p.price_paise, p.mrp_paise,
            COALESCE((
              SELECT SUM(m.qty_milli) FROM stock_movements m
              WHERE m.product_id = p.id AND m.deleted_at IS NULL
            ), 0) AS on_hand_milli
       FROM products p
      WHERE p.org_id = ? AND p.deleted_at IS NULL
      -- Counted in ORDER BY rather than selected, so the row shape stays
      -- exactly ProductPick and no caller inherits a column it should not use.
      ORDER BY (
              SELECT COUNT(DISTINCT ii.invoice_id) FROM invoice_items ii
               WHERE ii.product_id = p.id AND ii.deleted_at IS NULL
            ) DESC, p.updated_at DESC, p.name
      LIMIT ?`,
    [orgId, limit],
  );
}

/**
 * Specific products, in the order the caller asked for them.
 *
 * SQL has no opinion about the order of an IN list, and the shop's chosen key
 * order is the whole point — so the sort happens here, and an id that no
 * longer resolves (product deleted since it was pinned) simply drops out
 * rather than leaving a hole or throwing.
 */
export async function productsByIds(
  orgId: string,
  ids: readonly string[],
): Promise<ProductPick[]> {
  await ready();
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(",");
  const rows = await all<ProductPick>(
    `SELECT p.id, p.name, p.sku, p.hsn, p.tax_bps, p.price_paise, p.mrp_paise,
            COALESCE((
              SELECT SUM(m.qty_milli) FROM stock_movements m
              WHERE m.product_id = p.id AND m.deleted_at IS NULL
            ), 0) AS on_hand_milli
       FROM products p
      WHERE p.org_id = ? AND p.deleted_at IS NULL
        AND p.id IN (${placeholders})`,
    [orgId, ...ids],
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductPick => !!p);
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
  const prefix = (await getSetting("pref.invoicePrefix")) ?? "INV";
  return `${prefix}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

// --- Invoice print -----------------------------------------------------------

export interface InvoiceItemRow {
  id: string;
  description: string | null;
  product_id: string | null;
  qty_milli: number;
  rate_paise: number;
  tax_bps: number;
  amount_paise: number;
  /** The vertical's captured fields for this line (batch/expiry/…), parsed. */
  meta: Record<string, JsonValue>;
}

export interface InvoicePrintData {
  invoice: InvoiceRow | null;
  items: InvoiceItemRow[];
  customer: CustomerRow | null;
}

/**
 * One invoice, its lines (with the vertical's captured fields), and its
 * customer — everything a printable tax invoice needs, read from the local DB
 * so it prints offline. meta is stored as JSON text; it is parsed here so the
 * print view can render Batch/Expiry (or a jeweller's purity/HUID) as columns.
 */
export async function getInvoicePrintData(
  orgId: string,
  invoiceId: string,
): Promise<InvoicePrintData> {
  await ready();

  const invoice = await get<InvoiceRow>(
    `SELECT id, number, customer_id, date, status,
            subtotal_paise, tax_paise, total_paise, updated_at, version, dirty
     FROM invoices
     WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    [invoiceId, orgId],
  );

  const rawItems = await all<{
    id: string;
    description: string | null;
    product_id: string | null;
    qty_milli: number;
    rate_paise: number;
    tax_bps: number;
    amount_paise: number;
    meta: string | null;
  }>(
    `SELECT id, description, product_id, qty_milli, rate_paise, tax_bps,
            amount_paise, meta
     FROM invoice_items
     WHERE invoice_id = ? AND org_id = ?
     ORDER BY rowid`,
    [invoiceId, orgId],
  );

  const items: InvoiceItemRow[] = rawItems.map((r) => {
    let meta: Record<string, JsonValue> = {};
    if (r.meta) {
      try {
        meta = JSON.parse(r.meta) as Record<string, JsonValue>;
      } catch {
        meta = {};
      }
    }
    return {
      id: r.id,
      description: r.description,
      product_id: r.product_id,
      qty_milli: r.qty_milli,
      rate_paise: r.rate_paise,
      tax_bps: r.tax_bps,
      amount_paise: r.amount_paise,
      meta,
    };
  });

  let customer: CustomerRow | null = null;
  if (invoice?.customer_id) {
    customer = await get<CustomerRow>(
      `SELECT id, name, phone, gstin, updated_at, version, dirty
       FROM customers
       WHERE id = ? AND org_id = ?`,
      [invoice.customer_id, orgId],
    );
  }

  return { invoice, items, customer };
}

// --- Sales intelligence (Vyora Edge) -----------------------------------------

export interface ProductSales {
  product_id: string;
  qty_sold_milli: number;
  /** ISO date of the most recent sale, or null if never sold. */
  last_sold: string | null;
  sale_count: number;
}

/**
 * How much of each product has sold, and when it last moved.
 *
 * Powers the Dead-Stock Radar: a product with stock on hand but no recent sale
 * is money sitting still. Read from the same invoice lines every report uses, so
 * it always agrees with Sales.
 */
export function salesByProduct(orgId: string): Promise<ProductSales[]> {
  return ready().then(() =>
    all<ProductSales>(
      `SELECT ii.product_id AS product_id,
              COALESCE(SUM(ii.qty_milli), 0) AS qty_sold_milli,
              MAX(i.date) AS last_sold,
              COUNT(*) AS sale_count
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE ii.org_id = ? AND i.deleted_at IS NULL AND ii.product_id IS NOT NULL
       GROUP BY ii.product_id`,
      [orgId],
    ),
  );
}

// --- Suppliers ---------------------------------------------------------------

export interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  /**
   * What you still owe this supplier, in paise: everything purchased from them
   * minus everything paid to them. Derived, never stored — the same rule the
   * customer/outstanding numbers follow, so Suppliers, Purchase and Payments
   * can never disagree.
   */
  payable_paise: number;
  updated_at: string;
  version: number;
  dirty: number;
}

/**
 * Persist a supplier, marked dirty.
 *
 * dirty = 1 and version = 0 say "created locally, not yet acknowledged by the
 * server", exactly like saveCustomer; address, balance_paise and custom_fields
 * keep their schema defaults. Optional phone/gstin are stored as NULL when blank
 * rather than an empty string.
 */
export async function saveSupplier(supplier: {
  id: string;
  orgId: string;
  name: string;
  phone?: string | undefined;
  gstin?: string | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO suppliers
              (id, name, phone, gstin, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,0,1)`,
      params: [
        supplier.id,
        supplier.name,
        supplier.phone ?? null,
        supplier.gstin ?? null,
        supplier.orgId,
        now,
      ] as (string | number | null)[],
    },
  ]);
}

/**
 * Suppliers for an org, newest first, tombstones hidden.
 *
 * Each row carries its live payable: purchases billed to the supplier minus
 * payments made out to them. Both sums read data the Purchase and Payments
 * modules already wrote, so the figure is exact and needs no network.
 */
export function listSuppliers(
  orgId: string,
  limit = 100,
): Promise<SupplierRow[]> {
  return ready().then(() =>
    all<SupplierRow>(
      `SELECT s.id, s.name, s.phone, s.gstin, s.updated_at, s.version, s.dirty,
              COALESCE((
                SELECT SUM(p.total_paise) FROM purchases p
                WHERE p.supplier_id = s.id AND p.deleted_at IS NULL
              ), 0)
              -
              COALESCE((
                SELECT SUM(pay.amount_paise) FROM payments pay
                WHERE pay.party_type = 'supplier' AND pay.party_id = s.id
                  AND pay.direction = 'out' AND pay.deleted_at IS NULL
              ), 0) AS payable_paise
       FROM suppliers s
       WHERE s.org_id = ? AND s.deleted_at IS NULL
       ORDER BY s.updated_at DESC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

// --- Expenses ----------------------------------------------------------------

export interface ExpenseRow {
  id: string;
  category: string | null;
  amount_paise: number;
  date: string;
  note: string | null;
  recurring: number;
  updated_at: string;
  dirty: number;
}

export interface NewExpense {
  id: string;
  orgId: string;
  category?: string | undefined;
  amountPaise: Paise;
  date: string;
  note?: string | undefined;
  recurring?: boolean | undefined;
  createdBy?: string | undefined;
}

/**
 * Record an expense, marked dirty.
 *
 * Money is integer paise like everywhere else; category and note are free text
 * (the metadata engine can constrain categories per vertical later). recurring
 * is stored 0/1 — SQLite has no boolean. A blank category/note becomes NULL.
 */
export async function saveExpense(expense: NewExpense): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO expenses
              (id, category, amount_paise, date, note, recurring, created_by,
               org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        expense.id,
        expense.category ?? null,
        expense.amountPaise,
        expense.date,
        expense.note ?? null,
        expense.recurring ? 1 : 0,
        expense.createdBy ?? null,
        expense.orgId,
        now,
      ] as (string | number | null)[],
    },
  ]);
}

/** Recent expenses for an org, newest first, tombstones hidden. */
export function listExpenses(
  orgId: string,
  limit = 100,
): Promise<ExpenseRow[]> {
  return ready().then(() =>
    all<ExpenseRow>(
      `SELECT id, category, amount_paise, date, note, recurring, updated_at, dirty
       FROM expenses
       WHERE org_id = ? AND deleted_at IS NULL
       ORDER BY date DESC, updated_at DESC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

export interface ExpensesSummary {
  totalPaise: number;
  count: number;
}

/**
 * Total spend across a date window (inclusive `YYYY-MM-DD` bounds) — the number
 * the Expenses header shows and that a P&L will subtract from gross margin.
 */
export async function expensesSummary(
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<ExpensesSummary> {
  await ready();
  const row = await get<{ total: number; n: number }>(
    `SELECT COALESCE(SUM(amount_paise),0) AS total, COUNT(*) AS n
     FROM expenses
     WHERE org_id = ? AND deleted_at IS NULL AND date >= ? AND date <= ?`,
    [orgId, fromDate, toDate],
  );
  return { totalPaise: row?.total ?? 0, count: row?.n ?? 0 };
}

// --- Estimates, quotations & delivery challans -------------------------------

/**
 * The pre-sale and post-sale paperwork around an invoice. One table, one
 * shape — what differs is intent, so the kind is data rather than five
 * near-identical modules.
 */
export type SaleDocType =
  | "estimate" // quotation: a price, offered
  | "proforma" // a bill in advance of supply, for advances and imports
  | "order" // a confirmed booking, awaiting delivery
  | "challan" // goods moving, billed later
  | "return"; // goods coming back — the GST credit note

export interface SaleDocumentRow {
  id: string;
  doc_type: string;
  number: string | null;
  customer_id: string | null;
  date: string;
  status: string;
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  converted_invoice_id: string | null;
  ref_invoice_id: string | null;
  updated_at: string;
  dirty: number;
}

export interface NewSaleDocument {
  id: string;
  orgId: string;
  docType: SaleDocType;
  number: string;
  date: string;
  customerId?: string | undefined;
  note?: string | undefined;
  /** The invoice this document answers to (a credit note's original bill). */
  refInvoiceId?: string | undefined;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  createdBy?: string | undefined;
  items: InvoiceItemInput[];
}

/**
 * Persist an estimate/quotation or delivery challan and its lines atomically,
 * marked dirty — the same local-first contract as saveInvoice. Documents never
 * touch stock or revenue; only conversion to an invoice does.
 */
export async function saveSaleDocument(doc: NewSaleDocument): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  const statements = [
    {
      sql: `INSERT INTO sale_documents
              (id, doc_type, number, customer_id, date, status, subtotal_paise,
               tax_paise, total_paise, note, ref_invoice_id, created_by, org_id,
               updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        doc.id,
        doc.docType,
        doc.number,
        doc.customerId ?? null,
        doc.date,
        "open",
        doc.subtotalPaise,
        doc.taxPaise,
        doc.totalPaise,
        doc.note ?? null,
        doc.refInvoiceId ?? null,
        doc.createdBy ?? null,
        doc.orgId,
        now,
      ] as (string | number | null)[],
    },
    ...doc.items.map((item) => ({
      sql: `INSERT INTO sale_document_items
              (id, document_id, product_id, description, qty_milli, rate_paise,
               tax_bps, amount_paise, meta, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        doc.id,
        item.productId ?? null,
        item.description,
        item.qtyMilli,
        item.ratePaise,
        item.taxBps,
        item.amountPaise,
        JSON.stringify(item.meta ?? {}),
        doc.orgId,
        now,
      ] as (string | number | null)[],
    })),
  ];

  await batch(statements);
}

/** Documents of one kind for an org, newest first, tombstones hidden. */
export function listSaleDocuments(
  orgId: string,
  docType: SaleDocType,
  limit = 50,
): Promise<SaleDocumentRow[]> {
  return ready().then(() =>
    all<SaleDocumentRow>(
      `SELECT id, doc_type, number, customer_id, date, status, subtotal_paise,
              tax_paise, total_paise, converted_invoice_id, ref_invoice_id,
              updated_at, dirty
       FROM sale_documents
       WHERE org_id = ? AND doc_type = ? AND deleted_at IS NULL
       ORDER BY date DESC, updated_at DESC
       LIMIT ?`,
      [orgId, docType, limit],
    ),
  );
}

/** Which preference overrides each kind's default prefix. */
const DOC_PREF_SETTING: Record<SaleDocType, string> = {
  estimate: "quotationPrefix",
  proforma: "proformaPrefix",
  order: "orderPrefix",
  challan: "challanPrefix",
  return: "creditNotePrefix",
};

/** Number series per kind — a shop's books read better when the prefix says what it is. */
const DOC_PREFIX: Record<SaleDocType, string> = {
  estimate: "QTN",
  proforma: "PI",
  order: "SO",
  challan: "DN",
  return: "CN",
};

/** Display sequence per document kind (QTN-0001, CN-0001…), like invoices. */
export async function nextDocumentNumber(
  orgId: string,
  docType: SaleDocType,
): Promise<string> {
  await ready();
  const row = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sale_documents WHERE org_id = ? AND doc_type = ?`,
    [orgId, docType],
  );
  // A shop that renumbers its books should not have to renumber ours.
  const prefix =
    (await getSetting(`pref.${DOC_PREF_SETTING[docType]}`)) ??
    DOC_PREFIX[docType];
  return `${prefix}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/**
 * Convert an open estimate/challan into a real invoice — atomically.
 *
 * Copies the document's lines into a new invoice (which from then on behaves
 * exactly like any sale: reports, GST, outstanding), and marks the document
 * converted with a pointer to the invoice it became. Refuses double conversion
 * via the status check in the UPDATE's WHERE clause.
 */
export async function convertDocumentToInvoice(args: {
  orgId: string;
  documentId: string;
  createdBy?: string | undefined;
}): Promise<string | null> {
  await ready();

  const doc = await get<SaleDocumentRow>(
    `SELECT id, doc_type, number, customer_id, date, status, subtotal_paise,
            tax_paise, total_paise, converted_invoice_id, ref_invoice_id,
            updated_at, dirty
     FROM sale_documents
     WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    [args.documentId, args.orgId],
  );
  if (!doc || doc.status !== "open") return null;

  const items = await all<{
    product_id: string | null;
    description: string | null;
    qty_milli: number;
    rate_paise: number;
    tax_bps: number;
    amount_paise: number;
    meta: string | null;
  }>(
    `SELECT product_id, description, qty_milli, rate_paise, tax_bps, amount_paise, meta
     FROM sale_document_items
     WHERE document_id = ? AND org_id = ?
     ORDER BY rowid`,
    [args.documentId, args.orgId],
  );

  const invoiceId = crypto.randomUUID();
  const number = await nextInvoiceNumber(args.orgId);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  await batch([
    {
      sql: `INSERT INTO invoices
              (id, number, customer_id, date, status, subtotal_paise, tax_paise,
               total_paise, created_by, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        invoiceId,
        number,
        doc.customer_id,
        today,
        "issued",
        doc.subtotal_paise,
        doc.tax_paise,
        doc.total_paise,
        args.createdBy ?? null,
        args.orgId,
        now,
      ] as (string | number | null)[],
    },
    ...items.map((it) => ({
      sql: `INSERT INTO invoice_items
              (id, invoice_id, product_id, description, qty_milli, rate_paise,
               tax_bps, amount_paise, meta, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        invoiceId,
        it.product_id,
        it.description,
        it.qty_milli,
        it.rate_paise,
        it.tax_bps,
        it.amount_paise,
        it.meta ?? "{}",
        args.orgId,
        now,
      ] as (string | number | null)[],
    })),
    {
      sql: `UPDATE sale_documents
            SET status = 'converted', converted_invoice_id = ?, dirty = 1, updated_at = ?
            WHERE id = ? AND org_id = ? AND status = 'open'`,
      params: [invoiceId, now, args.documentId, args.orgId] as (
        | string
        | number
        | null
      )[],
    },
  ]);

  return invoiceId;
}

// --- Payment reminders -------------------------------------------------------

export interface OverdueInvoiceRow {
  id: string;
  number: string | null;
  date: string;
  total_paise: number;
  amount_paid_paise: number;
  customer_name: string | null;
  customer_phone: string | null;
}

/**
 * Unpaid invoices with the customer to chase — oldest debt first. Feeds the
 * Reminders screen, which turns each row into a one-tap WhatsApp reminder.
 */
export function listOverdueInvoices(
  orgId: string,
  limit = 100,
): Promise<OverdueInvoiceRow[]> {
  return ready().then(() =>
    all<OverdueInvoiceRow>(
      `SELECT i.id, i.number, i.date, i.total_paise, i.amount_paid_paise,
              c.name AS customer_name, c.phone AS customer_phone
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id AND c.deleted_at IS NULL
       WHERE i.org_id = ? AND i.deleted_at IS NULL
         AND i.amount_paid_paise < i.total_paise
       ORDER BY i.date ASC, i.updated_at ASC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

/**
 * Record goods coming back: the credit note, the stock, and the money — in one
 * transaction.
 *
 * Three things must move together or the books lie. The note itself is a
 * sale_document (kind "return") pointing at the original bill; every returned
 * line puts its quantity back on the movement ledger; and the credit is applied
 * against the invoice so the customer stops appearing in Reminders for money
 * they no longer owe.
 *
 * What this does NOT do yet: reverse output GST in the filing summary (the note
 * is recorded, but GSTR-1 credit-note reporting is a filing-side change), or
 * hand back cash — a refund paid out is a payment in the Payments module, so
 * the trail stays explicit rather than implied.
 */
export async function saveSaleReturn(args: {
  orgId: string;
  invoiceId: string;
  customerId?: string | null | undefined;
  number: string;
  note?: string | undefined;
  createdBy?: string | undefined;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  items: (InvoiceItemInput & { productId?: string })[];
}): Promise<string> {
  await ready();
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();

  const statements: { sql: string; params: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO sale_documents
              (id, doc_type, number, customer_id, date, status, subtotal_paise,
               tax_paise, total_paise, note, ref_invoice_id, created_by, org_id,
               updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        docId,
        "return",
        args.number,
        args.customerId ?? null,
        now.slice(0, 10),
        "issued",
        args.subtotalPaise,
        args.taxPaise,
        args.totalPaise,
        args.note ?? null,
        args.invoiceId,
        args.createdBy ?? null,
        args.orgId,
        now,
      ],
    },
  ];

  for (const item of args.items) {
    statements.push({
      sql: `INSERT INTO sale_document_items
              (id, document_id, product_id, description, qty_milli, rate_paise,
               tax_bps, amount_paise, meta, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        docId,
        item.productId ?? null,
        item.description,
        item.qtyMilli,
        item.ratePaise,
        item.taxBps,
        item.amountPaise,
        JSON.stringify(item.meta ?? {}),
        args.orgId,
        now,
      ],
    });
    if (item.productId) {
      statements.push({
        sql: `INSERT INTO stock_movements
                (id, product_id, type, qty_milli, ref_type, ref_id, created_at,
                 org_id, updated_at, dirty)
              VALUES (?,?,?,?,?,?,?,?,?,1)`,
        // Positive: the goods are back on the shelf.
        params: [
          crypto.randomUUID(),
          item.productId,
          "return",
          item.qtyMilli,
          "return",
          docId,
          now,
          args.orgId,
          now,
        ],
      });
    }
  }

  // The credit itself, recorded like any other settlement so Payments,
  // Reminders and the party's outstanding all agree.
  statements.push({
    sql: `INSERT INTO payments
            (id, direction, party_type, party_id, invoice_id, amount_paise,
             method, date, created_by, org_id, updated_at, dirty)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
    params: [
      crypto.randomUUID(),
      "in",
      "customer",
      args.customerId ?? null,
      args.invoiceId,
      args.totalPaise,
      "credit-note",
      now.slice(0, 10),
      args.createdBy ?? null,
      args.orgId,
      now,
    ],
  });
  statements.push({
    sql: `UPDATE invoices
          SET amount_paid_paise = amount_paid_paise + ?,
              status = CASE
                WHEN amount_paid_paise + ? >= total_paise THEN 'paid'
                ELSE 'partial'
              END,
              dirty = 1,
              updated_at = ?
          WHERE id = ? AND org_id = ?`,
    params: [args.totalPaise, args.totalPaise, now, args.invoiceId, args.orgId],
  });

  await batch(statements);
  return docId;
}

// --- The buying side: supply orders, supplier returns, payments out ----------

/** Paperwork around a purchase, mirroring SaleDocType on the selling side. */
export type PurchaseDocType =
  | "order" // supply order: placed with a supplier, goods awaited
  | "return"; // goods sent back — the GST debit note

const PURCHASE_DOC_PREFIX: Record<PurchaseDocType, string> = {
  order: "PO",
  return: "DBN",
};

export interface PurchaseDocumentRow {
  id: string;
  doc_type: string;
  number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  date: string;
  status: string;
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  converted_purchase_id: string | null;
  ref_purchase_id: string | null;
  updated_at: string;
  dirty: number;
}

export interface NewPurchaseDocument {
  id: string;
  orgId: string;
  docType: PurchaseDocType;
  number: string;
  date: string;
  supplierId?: string | undefined;
  note?: string | undefined;
  /** The purchase this answers to (a debit note's original bill). */
  refPurchaseId?: string | undefined;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  createdBy?: string | undefined;
  items: (InvoiceItemInput & { productId?: string })[];
}

/** Next number in the series (PO-0001, DBN-0001). */
export async function nextPurchaseDocNumber(
  orgId: string,
  docType: PurchaseDocType,
): Promise<string> {
  await ready();
  const row = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM purchase_documents WHERE org_id = ? AND doc_type = ?`,
    [orgId, docType],
  );
  const prefix =
    docType === "order"
      ? ((await getSetting("pref.purchaseOrderPrefix")) ??
        PURCHASE_DOC_PREFIX.order)
      : PURCHASE_DOC_PREFIX[docType];
  return `${prefix}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/** Save a supply order (or the shell of a debit note) with its lines, atomically. */
export async function savePurchaseDocument(
  doc: NewPurchaseDocument,
): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO purchase_documents
              (id, doc_type, number, supplier_id, date, status, subtotal_paise,
               tax_paise, total_paise, note, ref_purchase_id, created_by, org_id,
               updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        doc.id,
        doc.docType,
        doc.number,
        doc.supplierId ?? null,
        doc.date,
        doc.docType === "return" ? "issued" : "open",
        doc.subtotalPaise,
        doc.taxPaise,
        doc.totalPaise,
        doc.note ?? null,
        doc.refPurchaseId ?? null,
        doc.createdBy ?? null,
        doc.orgId,
        now,
      ] as (string | number | null)[],
    },
    ...doc.items.map((item) => ({
      sql: `INSERT INTO purchase_document_items
              (id, document_id, product_id, description, qty_milli, rate_paise,
               tax_bps, amount_paise, meta, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        doc.id,
        item.productId ?? null,
        item.description,
        item.qtyMilli,
        item.ratePaise,
        item.taxBps,
        item.amountPaise,
        JSON.stringify(item.meta ?? {}),
        doc.orgId,
        now,
      ] as (string | number | null)[],
    })),
  ]);
}

/** Documents of one kind, newest first, with the supplier's name resolved. */
export function listPurchaseDocuments(
  orgId: string,
  docType: PurchaseDocType,
  limit = 50,
): Promise<PurchaseDocumentRow[]> {
  return ready().then(() =>
    all<PurchaseDocumentRow>(
      `SELECT d.id, d.doc_type, d.number, d.supplier_id, s.name AS supplier_name,
              d.date, d.status, d.subtotal_paise, d.tax_paise, d.total_paise,
              d.converted_purchase_id, d.ref_purchase_id, d.updated_at, d.dirty
       FROM purchase_documents d
       LEFT JOIN suppliers s ON s.id = d.supplier_id
       WHERE d.org_id = ? AND d.doc_type = ? AND d.deleted_at IS NULL
       ORDER BY d.date DESC, d.updated_at DESC
       LIMIT ?`,
      [orgId, docType, limit],
    ),
  );
}

/**
 * Receive a supply order: it becomes a purchase bill, and the goods land on the
 * stock ledger — the same movement rows savePurchase writes, so Inventory sees
 * no difference between stock received this way and any other.
 */
export async function convertOrderToPurchase(args: {
  orgId: string;
  documentId: string;
}): Promise<string | null> {
  await ready();

  const doc = await get<PurchaseDocumentRow>(
    `SELECT id, doc_type, number, supplier_id, NULL AS supplier_name, date, status,
            subtotal_paise, tax_paise, total_paise, converted_purchase_id,
            ref_purchase_id, updated_at, dirty
     FROM purchase_documents
     WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    [args.documentId, args.orgId],
  );
  if (!doc || doc.status !== "open") return null;

  const items = await all<{
    product_id: string | null;
    qty_milli: number;
    rate_paise: number;
    tax_bps: number;
    amount_paise: number;
  }>(
    `SELECT product_id, qty_milli, rate_paise, tax_bps, amount_paise
     FROM purchase_document_items
     WHERE document_id = ? AND org_id = ?
     ORDER BY rowid`,
    [args.documentId, args.orgId],
  );

  const purchaseId = crypto.randomUUID();
  const number = await nextPurchaseNumber(args.orgId);
  const now = new Date().toISOString();

  const statements: { sql: string; params: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO purchases
              (id, number, supplier_id, date, status, subtotal_paise, tax_paise,
               total_paise, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        purchaseId,
        number,
        doc.supplier_id,
        now.slice(0, 10),
        "received",
        doc.subtotal_paise,
        doc.tax_paise,
        doc.total_paise,
        args.orgId,
        now,
      ],
    },
  ];

  for (const it of items) {
    statements.push({
      sql: `INSERT INTO purchase_items
              (id, purchase_id, product_id, qty_milli, rate_paise, tax_bps,
               amount_paise, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        purchaseId,
        it.product_id,
        it.qty_milli,
        it.rate_paise,
        it.tax_bps,
        it.amount_paise,
        args.orgId,
        now,
      ],
    });
    if (it.product_id) {
      statements.push({
        sql: `INSERT INTO stock_movements
                (id, product_id, type, qty_milli, ref_type, ref_id, created_at,
                 org_id, updated_at, dirty)
              VALUES (?,?,?,?,?,?,?,?,?,1)`,
        params: [
          crypto.randomUUID(),
          it.product_id,
          "purchase",
          it.qty_milli, // positive: stock in
          "purchase",
          purchaseId,
          now,
          args.orgId,
          now,
        ],
      });
    }
  }

  statements.push({
    sql: `UPDATE purchase_documents
          SET status = 'converted', converted_purchase_id = ?, dirty = 1, updated_at = ?
          WHERE id = ? AND org_id = ? AND status = 'open'`,
    params: [purchaseId, now, args.documentId, args.orgId],
  });

  await batch(statements);
  return purchaseId;
}

export interface PurchaseItemRow {
  id: string;
  product_id: string | null;
  description: string | null;
  qty_milli: number;
  rate_paise: number;
  tax_bps: number;
  amount_paise: number;
}

export interface PurchaseDetail {
  purchase: PurchaseRow | null;
  supplierId: string | null;
  supplierName: string | null;
  items: PurchaseItemRow[];
}

/**
 * One purchase bill with its lines and supplier — what the returns screen needs
 * to price a send-back exactly as the bill priced it. Line names come from the
 * product, since purchase_items store the link rather than a copy of the name.
 */
export async function getPurchaseDetail(
  orgId: string,
  purchaseId: string,
): Promise<PurchaseDetail> {
  await ready();

  const purchase = await get<PurchaseRow & { supplier_id: string | null }>(
    `SELECT id, number, date, status, subtotal_paise, tax_paise, total_paise,
            supplier_id, updated_at, dirty
     FROM purchases
     WHERE id = ? AND org_id = ? AND deleted_at IS NULL`,
    [purchaseId, orgId],
  );

  const items = await all<PurchaseItemRow>(
    `SELECT pi.id, pi.product_id, p.name AS description, pi.qty_milli,
            pi.rate_paise, pi.tax_bps, pi.amount_paise
     FROM purchase_items pi
     LEFT JOIN products p ON p.id = pi.product_id
     WHERE pi.purchase_id = ? AND pi.org_id = ?
     ORDER BY pi.rowid`,
    [purchaseId, orgId],
  );

  let supplierName: string | null = null;
  if (purchase?.supplier_id) {
    const s = await get<{ name: string }>(
      `SELECT name FROM suppliers WHERE id = ? AND org_id = ?`,
      [purchase.supplier_id, orgId],
    );
    supplierName = s?.name ?? null;
  }

  return {
    purchase: purchase ?? null,
    supplierId: purchase?.supplier_id ?? null,
    supplierName,
    items,
  };
}

/**
 * Send goods back to a supplier: the debit note, the stock leaving, and the
 * money you no longer owe — one transaction.
 *
 * The mirror of saveSaleReturn. Stock moves out (negative), and the debit is
 * recorded as a payment out so the supplier's payable — purchases minus
 * payments out — drops without a second ledger to reconcile.
 */
export async function savePurchaseReturn(args: {
  orgId: string;
  purchaseId: string;
  supplierId?: string | null | undefined;
  number: string;
  note?: string | undefined;
  createdBy?: string | undefined;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  items: (InvoiceItemInput & { productId?: string })[];
}): Promise<string> {
  await ready();
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();

  const statements: { sql: string; params: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO purchase_documents
              (id, doc_type, number, supplier_id, date, status, subtotal_paise,
               tax_paise, total_paise, note, ref_purchase_id, created_by, org_id,
               updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        docId,
        "return",
        args.number,
        args.supplierId ?? null,
        now.slice(0, 10),
        "issued",
        args.subtotalPaise,
        args.taxPaise,
        args.totalPaise,
        args.note ?? null,
        args.purchaseId,
        args.createdBy ?? null,
        args.orgId,
        now,
      ],
    },
  ];

  for (const item of args.items) {
    statements.push({
      sql: `INSERT INTO purchase_document_items
              (id, document_id, product_id, description, qty_milli, rate_paise,
               tax_bps, amount_paise, meta, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        docId,
        item.productId ?? null,
        item.description,
        item.qtyMilli,
        item.ratePaise,
        item.taxBps,
        item.amountPaise,
        JSON.stringify(item.meta ?? {}),
        args.orgId,
        now,
      ],
    });
    if (item.productId) {
      statements.push({
        sql: `INSERT INTO stock_movements
                (id, product_id, type, qty_milli, ref_type, ref_id, created_at,
                 org_id, updated_at, dirty)
              VALUES (?,?,?,?,?,?,?,?,?,1)`,
        // Negative: the goods have left the shelf, back to the supplier.
        params: [
          crypto.randomUUID(),
          item.productId,
          "purchase-return",
          -item.qtyMilli,
          "return",
          docId,
          now,
          args.orgId,
          now,
        ],
      });
    }
  }

  statements.push({
    sql: `INSERT INTO payments
            (id, direction, party_type, party_id, amount_paise, method, date,
             created_by, org_id, updated_at, dirty)
          VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
    params: [
      crypto.randomUUID(),
      "out",
      "supplier",
      args.supplierId ?? null,
      args.totalPaise,
      "debit-note",
      now.slice(0, 10),
      args.createdBy ?? null,
      args.orgId,
      now,
    ],
  });

  await batch(statements);
  return docId;
}

/**
 * Pay a supplier. The payable on the Suppliers screen is purchases minus
 * payments out, so this single row is all it takes for every screen to agree.
 */
export async function recordSupplierPayment(args: {
  orgId: string;
  supplierId: string;
  amountPaise: Paise;
  method: string;
  createdBy?: string | undefined;
  reference?: string | null | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();

  await batch([
    {
      sql: `INSERT INTO payments
              (id, direction, party_type, party_id, amount_paise, method, date,
               created_by, reference, org_id, updated_at, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
      params: [
        crypto.randomUUID(),
        "out",
        "supplier",
        args.supplierId,
        args.amountPaise,
        args.method,
        now.slice(0, 10),
        args.createdBy ?? null,
        args.reference ?? null,
        args.orgId,
        now,
      ] as (string | number | null)[],
    },
  ]);
}

export interface SupplierPaymentRow {
  id: string;
  supplier_name: string | null;
  amount_paise: number;
  method: string;
  date: string;
  dirty: number;
}

/** Money paid out to suppliers, newest first. */
export function listSupplierPayments(
  orgId: string,
  limit = 50,
): Promise<SupplierPaymentRow[]> {
  return ready().then(() =>
    all<SupplierPaymentRow>(
      `SELECT p.id, s.name AS supplier_name, p.amount_paise, p.method, p.date, p.dirty
       FROM payments p
       LEFT JOIN suppliers s ON s.id = p.party_id
       WHERE p.org_id = ? AND p.deleted_at IS NULL
         AND p.direction = 'out' AND p.party_type = 'supplier'
       ORDER BY p.date DESC, p.updated_at DESC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

// --- Cash & bank: accounts, movements, cheques, loans -------------------------

/** Where money sits. One table, four shapes. */
export type AccountKind = "cash" | "bank" | "card" | "loan";

export interface AccountRow {
  id: string;
  name: string;
  kind: string;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  upi_id: string | null;
  opening_paise: number;
  principal_paise: number | null;
  emi_paise: number | null;
  is_default: number;
  /**
   * Live balance: opening, plus every movement, plus any invoice settlement
   * assigned to this account. Derived on read — a stored balance is a bug
   * waiting for two devices to bill at the same time.
   */
  balance_paise: number;
  dirty: number;
}

export async function saveAccount(a: {
  id: string;
  orgId: string;
  name: string;
  kind: AccountKind;
  bankName?: string | undefined;
  accountNumber?: string | undefined;
  ifsc?: string | undefined;
  upiId?: string | undefined;
  openingPaise?: Paise | undefined;
  principalPaise?: Paise | undefined;
  emiPaise?: Paise | undefined;
  rateBps?: number | undefined;
  note?: string | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();
  await batch([
    {
      sql: `INSERT INTO accounts
              (id, name, kind, bank_name, account_number, ifsc, upi_id,
               opening_paise, principal_paise, emi_paise, rate_bps, note,
               org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        a.id,
        a.name,
        a.kind,
        a.bankName ?? null,
        a.accountNumber ?? null,
        a.ifsc ?? null,
        a.upiId ?? null,
        a.openingPaise ?? 0,
        a.principalPaise ?? null,
        a.emiPaise ?? null,
        a.rateBps ?? null,
        a.note ?? null,
        a.orgId,
        now,
      ] as (string | number | null)[],
    },
  ]);
}

/**
 * Accounts with live balances.
 *
 * A loan is the mirror of a bank account: the "balance" is what is still owed,
 * so principal counts as money in and every repayment brings it down. Cheques
 * that have not cleared are deliberately excluded — money promised is not money
 * held, and a shopkeeper who spends against an uncleared cheque is the person
 * this rule protects.
 */
export function listAccounts(orgId: string): Promise<AccountRow[]> {
  return ready().then(() =>
    all<AccountRow>(
      `SELECT a.id, a.name, a.kind, a.bank_name, a.account_number, a.ifsc,
              a.upi_id, a.opening_paise, a.principal_paise, a.emi_paise,
              a.is_default, a.dirty,
              a.opening_paise
              + COALESCE((
                  SELECT SUM(CASE WHEN e.direction = 'in' THEN e.amount_paise
                                  ELSE -e.amount_paise END)
                  FROM account_entries e
                  WHERE e.account_id = a.id AND e.deleted_at IS NULL
                    AND (e.cheque_status IS NULL OR e.cheque_status = 'cleared')
                ), 0)
              + COALESCE((
                  SELECT SUM(CASE WHEN p.direction = 'in' THEN p.amount_paise
                                  ELSE -p.amount_paise END)
                  FROM payments p
                  WHERE p.account_id = a.id AND p.deleted_at IS NULL
                ), 0) AS balance_paise
       FROM accounts a
       WHERE a.org_id = ? AND a.deleted_at IS NULL
       ORDER BY a.kind, a.name`,
      [orgId],
    ),
  );
}

export interface AccountEntryRow {
  id: string;
  account_id: string;
  account_name: string | null;
  direction: string;
  amount_paise: number;
  date: string;
  category: string | null;
  note: string | null;
  instrument: string | null;
  cheque_no: string | null;
  cheque_status: string | null;
  due_date: string | null;
  dirty: number;
}

/** Record money moving in or out of one account (including a cheque). */
export async function saveAccountEntry(e: {
  id?: string | undefined;
  orgId: string;
  accountId: string;
  direction: "in" | "out";
  amountPaise: Paise;
  date?: string | undefined;
  category?: string | undefined;
  note?: string | undefined;
  instrument?: string | undefined;
  chequeNo?: string | undefined;
  chequeStatus?: "pending" | "cleared" | "bounced" | undefined;
  dueDate?: string | undefined;
  transferId?: string | undefined;
  createdBy?: string | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();
  await batch([
    {
      sql: `INSERT INTO account_entries
              (id, account_id, direction, amount_paise, date, category, note,
               instrument, cheque_no, cheque_status, due_date, transfer_id,
               created_by, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
      params: [
        e.id ?? crypto.randomUUID(),
        e.accountId,
        e.direction,
        e.amountPaise,
        e.date ?? now.slice(0, 10),
        e.category ?? null,
        e.note ?? null,
        e.instrument ?? null,
        e.chequeNo ?? null,
        e.chequeStatus ?? null,
        e.dueDate ?? null,
        e.transferId ?? null,
        e.createdBy ?? null,
        e.orgId,
        now,
      ] as (string | number | null)[],
    },
  ]);
}

/**
 * Move money between two accounts — cash banked, or a bank withdrawal.
 *
 * Two entries sharing a transfer_id, written together: a transfer that lands on
 * one side only is how a cash book stops adding up.
 */
export async function transferBetweenAccounts(args: {
  orgId: string;
  fromAccountId: string;
  toAccountId: string;
  amountPaise: Paise;
  note?: string | undefined;
  createdBy?: string | undefined;
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();
  const transferId = crypto.randomUUID();
  const date = now.slice(0, 10);
  const row = (accountId: string, direction: "in" | "out") => ({
    sql: `INSERT INTO account_entries
            (id, account_id, direction, amount_paise, date, category, note,
             transfer_id, created_by, org_id, updated_at, version, dirty)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,0,1)`,
    params: [
      crypto.randomUUID(),
      accountId,
      direction,
      args.amountPaise,
      date,
      "transfer",
      args.note ?? null,
      transferId,
      args.createdBy ?? null,
      args.orgId,
      now,
    ] as (string | number | null)[],
  });

  await batch([row(args.fromAccountId, "out"), row(args.toAccountId, "in")]);
}

/** Movements on one account (or all of them), newest first. */
export function listAccountEntries(
  orgId: string,
  accountId?: string,
  limit = 60,
): Promise<AccountEntryRow[]> {
  const where = accountId ? "AND e.account_id = ?" : "";
  const params: (string | number)[] = accountId
    ? [orgId, accountId, limit]
    : [orgId, limit];
  return ready().then(() =>
    all<AccountEntryRow>(
      `SELECT e.id, e.account_id, a.name AS account_name, e.direction,
              e.amount_paise, e.date, e.category, e.note, e.instrument,
              e.cheque_no, e.cheque_status, e.due_date, e.dirty
       FROM account_entries e
       LEFT JOIN accounts a ON a.id = e.account_id
       WHERE e.org_id = ? AND e.deleted_at IS NULL ${where}
       ORDER BY e.date DESC, e.updated_at DESC
       LIMIT ?`,
      params,
    ),
  );
}

/** Cheques written or received, newest first — pending ones first in the UI. */
export function listCheques(
  orgId: string,
  limit = 60,
): Promise<AccountEntryRow[]> {
  return ready().then(() =>
    all<AccountEntryRow>(
      `SELECT e.id, e.account_id, a.name AS account_name, e.direction,
              e.amount_paise, e.date, e.category, e.note, e.instrument,
              e.cheque_no, e.cheque_status, e.due_date, e.dirty
       FROM account_entries e
       LEFT JOIN accounts a ON a.id = e.account_id
       WHERE e.org_id = ? AND e.deleted_at IS NULL AND e.cheque_status IS NOT NULL
       ORDER BY CASE e.cheque_status WHEN 'pending' THEN 0 ELSE 1 END,
                COALESCE(e.due_date, e.date) ASC
       LIMIT ?`,
      [orgId, limit],
    ),
  );
}

/** Clear or bounce a cheque. Only a cleared cheque counts toward a balance. */
export async function setChequeStatus(args: {
  orgId: string;
  entryId: string;
  status: "pending" | "cleared" | "bounced";
}): Promise<void> {
  await ready();
  const now = new Date().toISOString();
  await batch([
    {
      sql: `UPDATE account_entries
            SET cheque_status = ?, dirty = 1, updated_at = ?
            WHERE id = ? AND org_id = ?`,
      params: [args.status, now, args.entryId, args.orgId],
    },
  ]);
}

// --- Bulk import (the load step) & export -------------------------------------

/** What to do when an imported row matches a record that already exists. */
export type DuplicateMode = "skip" | "update" | "duplicate";

export interface ImportOutcome {
  inserted: number;
  updated: number;
  skipped: number;
  /** Row numbers (1-based, as the user sees them) that were skipped. */
  skippedRows: number[];
}

export interface ImportProductRow {
  /** Source row number, so a skipped-row report can point at the right line. */
  rowNumber: number;
  name: string;
  sku?: string | undefined;
  pricePaise: Paise;
  taxBps: number;
  hsn?: string | undefined;
  openingMilli: number;
}

export interface ImportCustomerRow {
  rowNumber: number;
  name: string;
  phone?: string | undefined;
  gstin?: string | undefined;
}

const norm = (v: string | null | undefined): string =>
  (v ?? "").trim().toLowerCase();
const digits = (v: string | null | undefined): string =>
  (v ?? "").replace(/\D/g, "");

/**
 * Import products in ONE transaction — all-or-nothing, so a failed file can
 * never leave a half-loaded catalogue behind.
 *
 * Matching is by SKU first (the only real identity a catalogue has), falling
 * back to name. On "update" the row's details are refreshed but stock is left
 * alone on purpose: on-hand is the sum of stock_movements, so re-importing a
 * file that carries opening stock would silently double every quantity.
 */
export async function importProducts(
  orgId: string,
  rows: ImportProductRow[],
  mode: DuplicateMode,
): Promise<ImportOutcome> {
  await ready();
  const now = new Date().toISOString();

  const existing = await all<{ id: string; name: string; sku: string | null }>(
    `SELECT id, name, sku FROM products WHERE org_id = ? AND deleted_at IS NULL`,
    [orgId],
  );
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const e of existing) {
    if (e.sku) bySku.set(norm(e.sku), e.id);
    byName.set(norm(e.name), e.id);
  }

  const statements: { sql: string; params: (string | number | null)[] }[] = [];
  const outcome: ImportOutcome = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    skippedRows: [],
  };

  for (const r of rows) {
    const match =
      (r.sku ? bySku.get(norm(r.sku)) : undefined) ?? byName.get(norm(r.name));

    if (match && mode === "skip") {
      outcome.skipped++;
      outcome.skippedRows.push(r.rowNumber);
      continue;
    }

    if (match && mode === "update") {
      statements.push({
        sql: `UPDATE products
              SET name = ?, sku = COALESCE(?, sku), price_paise = ?, tax_bps = ?,
                  hsn = COALESCE(?, hsn), dirty = 1, updated_at = ?
              WHERE id = ? AND org_id = ?`,
        params: [
          r.name,
          r.sku ?? null,
          r.pricePaise,
          r.taxBps,
          r.hsn ?? null,
          now,
          match,
          orgId,
        ],
      });
      outcome.updated++;
      continue;
    }

    const id = crypto.randomUUID();
    statements.push({
      sql: `INSERT INTO products
              (id, name, sku, price_paise, tax_bps, hsn, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,0,1)`,
      params: [
        id,
        r.name,
        r.sku ?? null,
        r.pricePaise,
        r.taxBps,
        r.hsn ?? null,
        orgId,
        now,
      ],
    });
    if (r.openingMilli !== 0) {
      statements.push({
        sql: `INSERT INTO stock_movements
                (id, product_id, type, qty_milli, ref_type, created_at, org_id, updated_at, dirty)
              VALUES (?,?,?,?,?,?,?,?,1)`,
        params: [
          crypto.randomUUID(),
          id,
          "opening",
          r.openingMilli,
          "import",
          now,
          orgId,
          now,
        ],
      });
    }
    // Later rows in the same file must see this one, or a file listing the
    // same SKU twice would insert it twice under "skip".
    if (r.sku) bySku.set(norm(r.sku), id);
    byName.set(norm(r.name), id);
    outcome.inserted++;
  }

  if (statements.length > 0) await batch(statements);
  return outcome;
}

/**
 * Import customers in one transaction. Matching is by phone (digits only, so
 * "+91 98765 43210" and "9876543210" are the same person), falling back to name.
 */
export async function importCustomers(
  orgId: string,
  rows: ImportCustomerRow[],
  mode: DuplicateMode,
): Promise<ImportOutcome> {
  await ready();
  const now = new Date().toISOString();

  const existing = await all<{
    id: string;
    name: string;
    phone: string | null;
  }>(
    `SELECT id, name, phone FROM customers WHERE org_id = ? AND deleted_at IS NULL`,
    [orgId],
  );
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const e of existing) {
    const d = digits(e.phone);
    if (d) byPhone.set(d, e.id);
    byName.set(norm(e.name), e.id);
  }

  const statements: { sql: string; params: (string | number | null)[] }[] = [];
  const outcome: ImportOutcome = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    skippedRows: [],
  };

  for (const r of rows) {
    const d = digits(r.phone);
    const match = (d ? byPhone.get(d) : undefined) ?? byName.get(norm(r.name));

    if (match && mode === "skip") {
      outcome.skipped++;
      outcome.skippedRows.push(r.rowNumber);
      continue;
    }

    if (match && mode === "update") {
      statements.push({
        sql: `UPDATE customers
              SET name = ?, phone = COALESCE(?, phone), gstin = COALESCE(?, gstin),
                  dirty = 1, updated_at = ?
              WHERE id = ? AND org_id = ?`,
        params: [r.name, r.phone ?? null, r.gstin ?? null, now, match, orgId],
      });
      outcome.updated++;
      continue;
    }

    const id = crypto.randomUUID();
    statements.push({
      sql: `INSERT INTO customers
              (id, name, phone, gstin, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,0,1)`,
      params: [id, r.name, r.phone ?? null, r.gstin ?? null, orgId, now],
    });
    if (d) byPhone.set(d, id);
    byName.set(norm(r.name), id);
    outcome.inserted++;
  }

  if (statements.length > 0) await batch(statements);
  return outcome;
}

// --- Export ------------------------------------------------------------------

export interface ProductExportRow {
  name: string;
  sku: string | null;
  price_paise: number | null;
  tax_bps: number | null;
  hsn: string | null;
  on_hand_milli: number;
}

/** Whole catalogue with live stock — the file a shop hands to their CA or a new tool. */
export function exportProducts(orgId: string): Promise<ProductExportRow[]> {
  return ready().then(() =>
    all<ProductExportRow>(
      `SELECT p.name, p.sku, p.price_paise, p.tax_bps, p.hsn,
              COALESCE((
                SELECT SUM(m.qty_milli) FROM stock_movements m
                WHERE m.product_id = p.id AND m.deleted_at IS NULL
              ), 0) AS on_hand_milli
       FROM products p
       WHERE p.org_id = ? AND p.deleted_at IS NULL
       ORDER BY p.name`,
      [orgId],
    ),
  );
}

export interface CustomerExportRow {
  name: string;
  phone: string | null;
  gstin: string | null;
  outstanding_paise: number;
}

/** Every customer with what they still owe — derived, never stored. */
export function exportCustomers(orgId: string): Promise<CustomerExportRow[]> {
  return ready().then(() =>
    all<CustomerExportRow>(
      `SELECT c.name, c.phone, c.gstin,
              COALESCE((
                SELECT SUM(i.total_paise - i.amount_paid_paise) FROM invoices i
                WHERE i.customer_id = c.id AND i.deleted_at IS NULL
                  AND i.amount_paid_paise < i.total_paise
              ), 0) AS outstanding_paise
       FROM customers c
       WHERE c.org_id = ? AND c.deleted_at IS NULL
       ORDER BY c.name`,
      [orgId],
    ),
  );
}

export interface InvoiceExportRow {
  number: string | null;
  date: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_gstin: string | null;
  status: string;
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  amount_paid_paise: number;
}

/** Sales register — one row per invoice, with the party, for GST filing or Tally. */
export function exportInvoices(orgId: string): Promise<InvoiceExportRow[]> {
  return ready().then(() =>
    all<InvoiceExportRow>(
      `SELECT i.number, i.date, c.name AS customer_name, c.phone AS customer_phone,
              c.gstin AS customer_gstin, i.status, i.subtotal_paise, i.tax_paise,
              i.total_paise, i.amount_paid_paise
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.org_id = ? AND i.deleted_at IS NULL
       ORDER BY i.date DESC, i.number DESC`,
      [orgId],
    ),
  );
}
