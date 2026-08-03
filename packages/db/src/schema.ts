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

/**
 * Migration 2 — marketing campaigns.
 *
 * Added after v1 shipped, so it lives in its own migration rather than editing
 * MIGRATION_1: a device already at v1 runs only this, a fresh install runs both.
 * Segment and stats are jsonb-as-text, like custom_fields elsewhere.
 */
const MIGRATION_2 = `
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  channel       TEXT NOT NULL,
  message       TEXT,
  segment       TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'draft',
  scheduled_at  TEXT,
  stats         TEXT NOT NULL DEFAULT '{}',
  created_by    TEXT,
  ${SYNC_COLUMNS}
);

CREATE INDEX IF NOT EXISTS campaigns_org_idx ON marketing_campaigns(org_id, deleted_at);
`;

/**
 * Migration 3 — payment bank reference (UPI/bank reconciliation idempotency).
 *
 * `reference` is the bank UTR/RRN pulled off the statement note. Storing it lets
 * the reconcile flow refuse to apply the same credit twice when an overlapping
 * statement is re-imported. Additive and nullable, so v2 devices upgrade with
 * no data movement, and the encrypted generic sync carries the new column with
 * no server-side migration.
 */
const MIGRATION_3 = `
ALTER TABLE payments ADD COLUMN reference TEXT;
CREATE INDEX IF NOT EXISTS payments_reference_idx
  ON payments(org_id, reference) WHERE reference IS NOT NULL;
`;


/**
 * Migration 4 — estimates / quotations and delivery challans.
 *
 * One table for both document kinds (doc_type discriminates) because they share
 * every column and both convert into an invoice. Kept OUT of the invoices table
 * on purpose: reports, GST and outstanding queries sum invoices, and a
 * quotation must never count as revenue.
 */
const MIGRATION_4 = `
CREATE TABLE IF NOT EXISTS sale_documents (
  id                   TEXT PRIMARY KEY,
  doc_type             TEXT NOT NULL,
  number               TEXT,
  customer_id          TEXT REFERENCES customers(id),
  date                 TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'open',
  subtotal_paise       INTEGER NOT NULL DEFAULT 0,
  tax_paise            INTEGER NOT NULL DEFAULT 0,
  total_paise          INTEGER NOT NULL DEFAULT 0,
  converted_invoice_id TEXT,
  note                 TEXT,
  custom_fields        TEXT NOT NULL DEFAULT '{}',
  created_by           TEXT,
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS sale_document_items (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES sale_documents(id) ON DELETE CASCADE,
  product_id   TEXT REFERENCES products(id),
  description  TEXT,
  qty_milli    INTEGER NOT NULL DEFAULT 1000,
  rate_paise   INTEGER NOT NULL DEFAULT 0,
  tax_bps      INTEGER NOT NULL DEFAULT 0,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  meta         TEXT NOT NULL DEFAULT '{}',
  ${SYNC_COLUMNS}
);

CREATE INDEX IF NOT EXISTS sale_documents_org_idx ON sale_documents(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS sale_documents_type_idx ON sale_documents(org_id, doc_type, status);
CREATE INDEX IF NOT EXISTS sale_document_items_doc_idx ON sale_document_items(document_id);
`;


/**
 * Migration 5 — link a sale document back to an invoice.
 *
 * A credit note exists *because of* an earlier bill, and an order can be raised
 * against a proforma. `converted_invoice_id` already says "what this became";
 * this says "what this refers to". Additive and nullable, so v4 devices upgrade
 * with no data movement.
 */
const MIGRATION_5 = `
ALTER TABLE sale_documents ADD COLUMN ref_invoice_id TEXT;
CREATE INDEX IF NOT EXISTS sale_documents_ref_idx
  ON sale_documents(org_id, ref_invoice_id) WHERE ref_invoice_id IS NOT NULL;
`;


/**
 * Migration 6 — purchase orders and debit notes.
 *
 * The mirror of MIGRATION_4 on the buying side. Kept as its own pair of tables
 * rather than a `party_type` column on the sale ones: a purchase order points at
 * a supplier and becomes a purchase, a quotation points at a customer and
 * becomes an invoice, and collapsing the two would mean every query carrying a
 * discriminator it can never forget.
 */
const MIGRATION_6 = `
CREATE TABLE IF NOT EXISTS purchase_documents (
  id                    TEXT PRIMARY KEY,
  doc_type              TEXT NOT NULL,
  number                TEXT,
  supplier_id           TEXT REFERENCES suppliers(id),
  date                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'open',
  subtotal_paise        INTEGER NOT NULL DEFAULT 0,
  tax_paise             INTEGER NOT NULL DEFAULT 0,
  total_paise           INTEGER NOT NULL DEFAULT 0,
  converted_purchase_id TEXT,
  ref_purchase_id       TEXT,
  note                  TEXT,
  custom_fields         TEXT NOT NULL DEFAULT '{}',
  created_by            TEXT,
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS purchase_document_items (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES purchase_documents(id) ON DELETE CASCADE,
  product_id   TEXT REFERENCES products(id),
  description  TEXT,
  qty_milli    INTEGER NOT NULL DEFAULT 1000,
  rate_paise   INTEGER NOT NULL DEFAULT 0,
  tax_bps      INTEGER NOT NULL DEFAULT 0,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  meta         TEXT NOT NULL DEFAULT '{}',
  ${SYNC_COLUMNS}
);

CREATE INDEX IF NOT EXISTS purchase_documents_org_idx  ON purchase_documents(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS purchase_documents_type_idx ON purchase_documents(org_id, doc_type, status);
CREATE INDEX IF NOT EXISTS purchase_document_items_doc_idx ON purchase_document_items(document_id);
`;


/**
 * Migration 7 — where the money actually sits.
 *
 * Until now money was tracked as payments against a party. A shop also needs to
 * know *which pocket* it went into: the counter cash, one of two bank accounts,
 * a cheque not yet cleared, or a loan being repaid. One `accounts` table covers
 * all four (kind discriminates), and `account_entries` is the movement ledger —
 * balances are always summed from movements, never stored, so two devices
 * recording cash at once cannot disagree.
 *
 * payments gains account_id so an invoice settlement can say which account
 * received it. Nullable: existing rows stay valid and simply count as
 * unassigned until the shop says otherwise.
 */
const MIGRATION_7 = `
CREATE TABLE IF NOT EXISTS accounts (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'bank',
  bank_name      TEXT,
  account_number TEXT,
  ifsc           TEXT,
  upi_id         TEXT,
  opening_paise  INTEGER NOT NULL DEFAULT 0,
  -- Loan accounts only: what was borrowed, and the instalment.
  principal_paise INTEGER,
  emi_paise       INTEGER,
  rate_bps        INTEGER,
  note           TEXT,
  is_default     INTEGER NOT NULL DEFAULT 0,
  ${SYNC_COLUMNS}
);

CREATE TABLE IF NOT EXISTS account_entries (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES accounts(id),
  direction      TEXT NOT NULL,
  amount_paise   INTEGER NOT NULL,
  date           TEXT NOT NULL,
  category       TEXT,
  note           TEXT,
  -- Cheques live here too: a movement that has not settled yet.
  instrument     TEXT,
  cheque_no      TEXT,
  cheque_status  TEXT,
  due_date       TEXT,
  party_type     TEXT,
  party_id       TEXT,
  transfer_id    TEXT,
  ref_type       TEXT,
  ref_id         TEXT,
  created_by     TEXT,
  ${SYNC_COLUMNS}
);

ALTER TABLE payments ADD COLUMN account_id TEXT;

CREATE INDEX IF NOT EXISTS accounts_org_idx        ON accounts(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS account_entries_acc_idx ON account_entries(org_id, account_id, deleted_at);
CREATE INDEX IF NOT EXISTS account_entries_chq_idx ON account_entries(org_id, cheque_status) WHERE cheque_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_account_idx    ON payments(org_id, account_id) WHERE account_id IS NOT NULL;
`;

/** Append-only. Index = version - 1. */
export const MIGRATIONS: readonly string[] = [
  MIGRATION_1,
  MIGRATION_2,
  MIGRATION_3,
  MIGRATION_4,
  MIGRATION_5,
  MIGRATION_6,
  MIGRATION_7,
];

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
  "marketing_campaigns",
  "sale_documents",
  "sale_document_items",
  "purchase_documents",
  "purchase_document_items",
  "accounts",
  "account_entries",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];
