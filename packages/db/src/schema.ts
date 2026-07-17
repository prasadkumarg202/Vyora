/**
 * The on-device relational core.
 *
 * Mirrors the Postgres tables from design/Vyora Database Schema.dc.html, with
 * two deliberate differences:
 *
 *  1. Business columns are PLAINTEXT here. The spec encrypts "before they enter
 *     the queue or the cloud", and asks SQLite for "full SQL with joins ...
 *     every list and report, entirely on-device" — which is impossible over
 *     ciphertext. So the encryption boundary is the outbox and the network, not
 *     this file. On-device safety rests on OPFS being origin-private plus the
 *     device lock.
 *
 *  2. Every table carries sync metadata: `version` and `updated_at` drive
 *     conflict resolution, `dirty` marks rows with un-flushed local changes,
 *     and `deleted_at` is a tombstone rather than a DELETE — a row removed
 *     outright could not beat a concurrent remote edit.
 *
 * Ids are client-generated UUIDs, so records created offline never collide and
 * never need a server round-trip to exist.
 */

export const SCHEMA_VERSION = 1;

/**
 * Columns every syncable table shares. Inlined per table rather than a base
 * table + joins: SQLite has no inheritance, and a join on every read to fetch
 * `version` would cost more than the duplication saves.
 */
const SYNC_COLUMNS = `
  org_id      TEXT    NOT NULL,
  version     INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT    NOT NULL,
  -- 1 = has local changes not yet acknowledged by the server.
  dirty       INTEGER NOT NULL DEFAULT 0,
  -- Tombstone. Non-null means deleted; the row stays so the delete can sync.
  deleted_at  TEXT
`;

/**
 * Migration 1 — the initial schema.
 *
 * Migrations are append-only: once shipped, a statement here has run on real
 * devices and editing it would silently diverge them from new installs.
 */
const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES categories(id),
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  sku           TEXT,
  category_id   TEXT REFERENCES categories(id),
  unit          TEXT,
  -- Money is integer paise, never a float — matching @vyora/core's money module.
  mrp_paise     INTEGER,
  price_paise   INTEGER,
  tax_bps       INTEGER,
  hsn           TEXT,
  -- Per-vertical fields live here; the metadata engine gives them meaning.
  custom_fields TEXT NOT NULL DEFAULT '{}',
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS inventory (
  id             TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL REFERENCES products(id),
  batch          TEXT,
  expiry         TEXT,
  -- Milli-units, so 0.001 kg of loose grocery is an integer here too.
  quantity_milli INTEGER NOT NULL DEFAULT 0,
  reorder_milli  INTEGER,
  location       TEXT,
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  type        TEXT NOT NULL,
  -- Signed delta. Stock is a CRDT counter: concurrent sales must sum, so the
  -- movement is the truth and the level is derived from it.
  qty_milli   INTEGER NOT NULL,
  ref_type    TEXT,
  ref_id      TEXT,
  created_at  TEXT NOT NULL,
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT,
  gstin          TEXT,
  address        TEXT NOT NULL DEFAULT '{}',
  balance_paise  INTEGER NOT NULL DEFAULT 0,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  custom_fields  TEXT NOT NULL DEFAULT '{}',
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS suppliers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT,
  gstin         TEXT,
  address       TEXT NOT NULL DEFAULT '{}',
  balance_paise INTEGER NOT NULL DEFAULT 0,
  custom_fields TEXT NOT NULL DEFAULT '{}',
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS invoices (
  id                TEXT PRIMARY KEY,
  number            TEXT,
  customer_id       TEXT REFERENCES customers(id),
  date              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  subtotal_paise    INTEGER NOT NULL DEFAULT 0,
  tax_paise         INTEGER NOT NULL DEFAULT 0,
  total_paise       INTEGER NOT NULL DEFAULT 0,
  amount_paid_paise INTEGER NOT NULL DEFAULT 0,
  custom_fields     TEXT NOT NULL DEFAULT '{}',
  created_by        TEXT,
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           TEXT PRIMARY KEY,
  invoice_id   TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id   TEXT REFERENCES products(id),
  description  TEXT,
  qty_milli    INTEGER NOT NULL DEFAULT 1000,
  rate_paise   INTEGER NOT NULL DEFAULT 0,
  tax_bps      INTEGER NOT NULL DEFAULT 0,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  meta         TEXT NOT NULL DEFAULT '{}',
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  direction    TEXT NOT NULL,
  party_type   TEXT NOT NULL,
  party_id     TEXT,
  invoice_id   TEXT REFERENCES invoices(id),
  amount_paise INTEGER NOT NULL,
  method       TEXT NOT NULL DEFAULT 'cash',
  date         TEXT NOT NULL,
  created_by   TEXT,
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS purchases (
  id             TEXT PRIMARY KEY,
  number         TEXT,
  supplier_id    TEXT REFERENCES suppliers(id),
  date           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft',
  subtotal_paise INTEGER NOT NULL DEFAULT 0,
  tax_paise      INTEGER NOT NULL DEFAULT 0,
  total_paise    INTEGER NOT NULL DEFAULT 0,
  custom_fields  TEXT NOT NULL DEFAULT '{}',
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id           TEXT PRIMARY KEY,
  purchase_id  TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id   TEXT REFERENCES products(id),
  qty_milli    INTEGER NOT NULL DEFAULT 1000,
  rate_paise   INTEGER NOT NULL DEFAULT 0,
  tax_bps      INTEGER NOT NULL DEFAULT 0,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  meta         TEXT NOT NULL DEFAULT '{}',
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS expenses (
  id            TEXT PRIMARY KEY,
  category      TEXT,
  amount_paise  INTEGER NOT NULL,
  date          TEXT NOT NULL,
  note          TEXT,
  receipt_url   TEXT,
  recurring     INTEGER NOT NULL DEFAULT 0,
  custom_fields TEXT NOT NULL DEFAULT '{}',
  created_by    TEXT,
  ${SYNC_COLUMNS}
);

-- Local-only. Never synced: it records where *this* device is up to.
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Every list is scoped to one org and hides tombstones, so that is the index.
CREATE INDEX IF NOT EXISTS products_org_idx    ON products(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS products_sku_idx     ON products(org_id, sku);
CREATE INDEX IF NOT EXISTS inventory_org_idx    ON inventory(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS inventory_expiry_idx ON inventory(org_id, expiry);
CREATE INDEX IF NOT EXISTS movements_prod_idx   ON stock_movements(org_id, product_id);
CREATE INDEX IF NOT EXISTS customers_org_idx    ON customers(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS customers_phone_idx  ON customers(org_id, phone);
CREATE INDEX IF NOT EXISTS suppliers_org_idx    ON suppliers(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS invoices_org_idx     ON invoices(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS invoices_date_idx    ON invoices(org_id, date);
CREATE INDEX IF NOT EXISTS invoice_items_inv_idx ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS payments_org_idx     ON payments(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS purchases_org_idx    ON purchases(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS purchase_items_pur_idx ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS expenses_org_idx     ON expenses(org_id, deleted_at);

-- The sync flush scans for dirty rows; without this it is a full table scan on
-- every flush, on a phone.
CREATE INDEX IF NOT EXISTS products_dirty_idx   ON products(dirty) WHERE dirty = 1;
CREATE INDEX IF NOT EXISTS invoices_dirty_idx   ON invoices(dirty) WHERE dirty = 1;
CREATE INDEX IF NOT EXISTS customers_dirty_idx  ON customers(dirty) WHERE dirty = 1;
`;

/** Append-only. Index = version - 1. */
export const MIGRATIONS: readonly string[] = [MIGRATION_1];

/** Tables that sync. sync_state is local-only and deliberately absent. */
export const SYNCED_TABLES = [
  "categories",
  "products",
  "inventory",
  "stock_movements",
  "customers",
  "suppliers",
  "invoices",
  "invoice_items",
  "payments",
  "purchases",
  "purchase_items",
  "expenses",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];
