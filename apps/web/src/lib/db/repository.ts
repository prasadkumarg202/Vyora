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
  productId?: string;
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
  meta?: Record<string, JsonValue>;
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
  createdBy?: string;
  /** Bank UTR/RRN, when reconciling a statement — makes the write idempotent. */
  reference?: string | null;
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

/**
 * Bank references already applied for this org — the reconcile flow's dedupe
 * set, so re-importing an overlapping statement never double-records a credit.
 */
export async function listReconciledReferences(orgId: string): Promise<Set<string>> {
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
  message?: string;
  createdBy?: string;
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
export function listCampaigns(orgId: string, limit = 50): Promise<CampaignRow[]> {
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
  phone?: string;
  gstin?: string;
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
export function listCustomers(orgId: string, limit = 100): Promise<CustomerRow[]> {
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
  phone?: string;
  gstin?: string;
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
export function listSuppliers(orgId: string, limit = 100): Promise<SupplierRow[]> {
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
  category?: string;
  amountPaise: Paise;
  date: string;
  note?: string;
  recurring?: boolean;
  createdBy?: string;
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
export function listExpenses(orgId: string, limit = 100): Promise<ExpenseRow[]> {
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

export type SaleDocType = "estimate" | "challan";

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
  updated_at: string;
  dirty: number;
}

export interface NewSaleDocument {
  id: string;
  orgId: string;
  docType: SaleDocType;
  number: string;
  date: string;
  customerId?: string;
  note?: string;
  subtotalPaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  createdBy?: string;
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
               tax_paise, total_paise, note, created_by, org_id, updated_at, version, dirty)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,1)`,
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
              tax_paise, total_paise, converted_invoice_id, updated_at, dirty
       FROM sale_documents
       WHERE org_id = ? AND doc_type = ? AND deleted_at IS NULL
       ORDER BY date DESC, updated_at DESC
       LIMIT ?`,
      [orgId, docType, limit],
    ),
  );
}

/** Display sequence per document kind (EST-0001 / DC-0001), like invoices. */
export async function nextDocumentNumber(
  orgId: string,
  docType: SaleDocType,
): Promise<string> {
  await ready();
  const row = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sale_documents WHERE org_id = ? AND doc_type = ?`,
    [orgId, docType],
  );
  const prefix = docType === "estimate" ? "EST" : "DC";
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
  createdBy?: string;
}): Promise<string | null> {
  await ready();

  const doc = await get<SaleDocumentRow>(
    `SELECT id, doc_type, number, customer_id, date, status, subtotal_paise,
            tax_paise, total_paise, converted_invoice_id, updated_at, dirty
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
      params: [invoiceId, now, args.documentId, args.orgId] as (string | number | null)[],
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
  sku?: string;
  pricePaise: Paise;
  taxBps: number;
  hsn?: string;
  openingMilli: number;
}

export interface ImportCustomerRow {
  rowNumber: number;
  name: string;
  phone?: string;
  gstin?: string;
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
  const outcome: ImportOutcome = { inserted: 0, updated: 0, skipped: 0, skippedRows: [] };

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
      params: [id, r.name, r.sku ?? null, r.pricePaise, r.taxBps, r.hsn ?? null, orgId, now],
    });
    if (r.openingMilli !== 0) {
      statements.push({
        sql: `INSERT INTO stock_movements
                (id, product_id, type, qty_milli, ref_type, created_at, org_id, updated_at, dirty)
              VALUES (?,?,?,?,?,?,?,?,1)`,
        params: [crypto.randomUUID(), id, "opening", r.openingMilli, "import", now, orgId, now],
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

  const existing = await all<{ id: string; name: string; phone: string | null }>(
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
  const outcome: ImportOutcome = { inserted: 0, updated: 0, skipped: 0, skippedRows: [] };

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
