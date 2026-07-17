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
