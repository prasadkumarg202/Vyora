"use client";

import { backoffMs, MAX_ATTEMPTS } from "@vyora/sync";

import { all, batch, get, run } from "~/lib/db/client";
import { ready } from "~/lib/db/repository";
import { createClient } from "~/lib/supabase/client";

/**
 * The sync runner — the host that drives the @vyora/sync outbox engine.
 *
 * The engine is pure: it decides retry timing and state. This runner performs
 * the I/O the engine can't — reading the dirty rows every module wrote locally,
 * mapping integer paise/milli to the server's numeric columns, and pushing them
 * to Supabase (RLS keeps each tenant isolated). On success the row's dirty flag
 * is cleared; on failure the engine's exponential backoff schedules the retry
 * and the row stays dirty, so nothing is ever lost — it just catches up when the
 * connection returns.
 *
 * Push first: a device is the source of truth for its own edits (last-write
 * wins on its rows). Pull runs straight after, so a second device — or the same
 * shop opening the web app instead of the installed one — starts from what the
 * server already holds rather than from an empty database.
 */

export interface SyncStatus {
  online: boolean;
  pending: number;
  syncing: boolean;
  failed: number;
  lastError?: string;
  lastSyncedAt?: number;
}

type LocalRow = Record<string, unknown>;

interface EntityDesc {
  local: string;
  server: string;
  /** Server carries a version column we read back. Child tables do not. */
  hasVersion: boolean;
  map: (r: LocalRow) => Record<string, unknown>;
}

const paise = (v: unknown): number | null => (v == null ? null : Number(v) / 100);
const milli = (v: unknown): number | null => (v == null ? null : Number(v) / 1000);
const bpsPct = (v: unknown): number | null => (v == null ? null : Number(v) / 100);
function metaObj(v: unknown): Record<string, unknown> {
  if (typeof v !== "string" || v === "") return {};
  try {
    return JSON.parse(v) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Push order respects foreign keys: a parent is on the server before its child
 * (customers before invoices, invoices/products before invoice_items, …). A row
 * whose parent hasn't landed yet just fails once and retries after it does.
 */
const DESCS: EntityDesc[] = [
  { local: "customers", server: "customers", hasVersion: true, map: (r) => ({ id: r.id, org_id: r.org_id, name: r.name, phone: r.phone, gstin: r.gstin, updated_at: r.updated_at }) },
  { local: "suppliers", server: "suppliers", hasVersion: true, map: (r) => ({ id: r.id, org_id: r.org_id, name: r.name, phone: r.phone, gstin: r.gstin, updated_at: r.updated_at }) },
  { local: "products", server: "products", hasVersion: true, map: (r) => ({ id: r.id, org_id: r.org_id, name: r.name, sku: r.sku, unit: r.unit ?? null, mrp: paise(r.mrp_paise), sale_price: paise(r.price_paise), tax_rate: bpsPct(r.tax_bps), hsn: r.hsn, updated_at: r.updated_at }) },
  { local: "invoices", server: "invoices", hasVersion: true, map: (r) => ({ id: r.id, org_id: r.org_id, number: r.number, customer_id: r.customer_id, date: r.date, status: r.status, subtotal: paise(r.subtotal_paise), tax: paise(r.tax_paise), total: paise(r.total_paise), amount_paid: paise(r.amount_paid_paise ?? 0), created_by: r.created_by ?? null, updated_at: r.updated_at }) },
  { local: "invoice_items", server: "invoice_items", hasVersion: false, map: (r) => ({ id: r.id, org_id: r.org_id, invoice_id: r.invoice_id, product_id: r.product_id, description: r.description, qty: milli(r.qty_milli), rate: paise(r.rate_paise), tax_rate: bpsPct(r.tax_bps), amount: paise(r.amount_paise), meta: metaObj(r.meta) }) },
  { local: "payments", server: "payments", hasVersion: true, map: (r) => ({ id: r.id, org_id: r.org_id, direction: r.direction, party_type: r.party_type, party_id: r.party_id ?? null, invoice_id: r.invoice_id, amount: paise(r.amount_paise), method: r.method, date: r.date, created_by: r.created_by ?? null, updated_at: r.updated_at }) },
  { local: "purchases", server: "purchases", hasVersion: true, map: (r) => ({ id: r.id, org_id: r.org_id, number: r.number, supplier_id: r.supplier_id, date: r.date, status: r.status, subtotal: paise(r.subtotal_paise), tax: paise(r.tax_paise), total: paise(r.total_paise), updated_at: r.updated_at }) },
  { local: "purchase_items", server: "purchase_items", hasVersion: false, map: (r) => ({ id: r.id, org_id: r.org_id, purchase_id: r.purchase_id, product_id: r.product_id, qty: milli(r.qty_milli), rate: paise(r.rate_paise), tax_rate: bpsPct(r.tax_bps), amount: paise(r.amount_paise), meta: metaObj(r.meta) }) },
  { local: "expenses", server: "expenses", hasVersion: true, map: (r) => ({ id: r.id, org_id: r.org_id, category: r.category, amount: paise(r.amount_paise), date: r.date, note: r.note, recurring: r.recurring ? true : false, created_by: r.created_by ?? null, updated_at: r.updated_at }) },
  { local: "stock_movements", server: "stock_movements", hasVersion: false, map: (r) => ({ id: r.id, org_id: r.org_id, product_id: r.product_id, type: r.type, qty_delta: milli(r.qty_milli), ref_type: r.ref_type ?? null, ref_id: r.ref_id ?? null, created_at: r.created_at }) },
];

// --- Pull: bringing the server's rows down -----------------------------------

/**
 * The other half of the loop. Without it a device only ever *contributes* to the
 * workspace and never joins it: sign in on a second machine, or in the browser
 * next to the installed app, and the screen is empty even though the data is
 * sitting in Postgres. That is not an offline-first app, it is a one-way upload.
 *
 * Three rules keep it safe:
 *
 *   1. A locally dirty row is never overwritten. The `WHERE <table>.dirty = 0`
 *      on the upsert means an edit this device has not yet pushed always wins
 *      over the copy it is pulling — losing a bill someone just wrote because a
 *      background fetch landed first is the one failure nobody forgives.
 *   2. Parents before children, because the local schema runs with
 *      `PRAGMA foreign_keys = ON`.
 *   3. Progress is remembered per table in `sync_state`, so the second run
 *      fetches what changed rather than the whole workspace again.
 */

type ServerRow = Record<string, unknown>;
type Param = string | number | null;

const toPaise = (v: unknown): number => (v == null ? 0 : Math.round(Number(v) * 100));
const toMilli = (v: unknown): number => (v == null ? 0 : Math.round(Number(v) * 1000));
const toBps = (v: unknown): number => (v == null ? 0 : Math.round(Number(v) * 100));
const orNull = (v: unknown, f: (x: unknown) => number): number | null =>
  v == null ? null : f(v);
const text = (v: unknown): string | null => (v == null ? null : String(v));

/**
 * Local `updated_at` is TEXT and is written as ISO everywhere else in the app,
 * while Postgres hands back `2026-08-09 12:56:40.655+00`. Normalising on the way
 * in keeps one format in the column, so anything that sorts or compares it does
 * not silently order two devices' rows differently.
 */
function iso(v: unknown): string {
  const d = new Date(String(v ?? ""));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** jsonb comes back parsed; the local column is TEXT. */
function jsonText(v: unknown): string {
  if (v == null) return "{}";
  return typeof v === "string" ? v : JSON.stringify(v);
}

interface ChildDesc {
  local: string;
  server: string;
  /** The column pointing back at the parent this child was fetched for. */
  fk: string;
  toLocal: (r: ServerRow) => Record<string, Param>;
}

interface PullDesc {
  local: string;
  server: string;
  /**
   * The column the incremental fetch filters and orders on. `invoice_items` and
   * `purchase_items` have no timestamp at all on the server, so they cannot be
   * pulled this way — they ride down with their parent instead.
   */
  cursorCol: "updated_at" | "created_at";
  toLocal: (r: ServerRow) => Record<string, Param>;
  children?: ChildDesc[];
}

const PULLS: PullDesc[] = [
  {
    local: "customers",
    server: "customers",
    cursorCol: "updated_at",
    toLocal: (r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      phone: text(r.phone),
      gstin: text(r.gstin),
      address: jsonText(r.address),
      balance_paise: toPaise(r.balance),
      loyalty_points: Number(r.loyalty_points ?? 0),
      custom_fields: jsonText(r.custom_fields),
      org_id: String(r.org_id),
      version: Number(r.version ?? 0),
      updated_at: iso(r.updated_at),
      dirty: 0,
      deleted_at: null,
    }),
  },
  {
    local: "suppliers",
    server: "suppliers",
    cursorCol: "updated_at",
    toLocal: (r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      phone: text(r.phone),
      gstin: text(r.gstin),
      address: jsonText(r.address),
      balance_paise: toPaise(r.balance),
      custom_fields: jsonText(r.custom_fields),
      org_id: String(r.org_id),
      version: Number(r.version ?? 0),
      updated_at: iso(r.updated_at),
      dirty: 0,
      deleted_at: null,
    }),
  },
  {
    local: "products",
    server: "products",
    cursorCol: "updated_at",
    toLocal: (r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      sku: text(r.sku),
      // Deliberately dropped. `categories` is not in the synced set, so a
      // category id from the server has nothing to point at locally and the
      // foreign key would reject the whole page.
      category_id: null,
      unit: text(r.unit),
      mrp_paise: orNull(r.mrp, toPaise),
      price_paise: orNull(r.sale_price, toPaise),
      tax_bps: orNull(r.tax_rate, toBps),
      hsn: text(r.hsn),
      custom_fields: jsonText(r.custom_fields),
      org_id: String(r.org_id),
      version: Number(r.version ?? 0),
      updated_at: iso(r.updated_at),
      dirty: 0,
      deleted_at: null,
    }),
  },
  {
    local: "invoices",
    server: "invoices",
    cursorCol: "updated_at",
    toLocal: (r) => ({
      id: String(r.id),
      number: text(r.number),
      customer_id: text(r.customer_id),
      date: String(r.date),
      status: String(r.status ?? "draft"),
      subtotal_paise: toPaise(r.subtotal),
      tax_paise: toPaise(r.tax),
      total_paise: toPaise(r.total),
      amount_paid_paise: toPaise(r.amount_paid),
      custom_fields: jsonText(r.custom_fields),
      created_by: text(r.created_by),
      org_id: String(r.org_id),
      version: Number(r.version ?? 0),
      updated_at: iso(r.updated_at),
      dirty: 0,
      deleted_at: null,
    }),
    children: [
      {
        local: "invoice_items",
        server: "invoice_items",
        fk: "invoice_id",
        toLocal: (r) => ({
          id: String(r.id),
          invoice_id: String(r.invoice_id),
          product_id: text(r.product_id),
          description: text(r.description),
          qty_milli: toMilli(r.qty),
          rate_paise: toPaise(r.rate),
          tax_bps: toBps(r.tax_rate),
          amount_paise: toPaise(r.amount),
          meta: jsonText(r.meta),
          org_id: String(r.org_id),
          version: 0,
          // The server keeps no timestamp on line items. Stamping them as they
          // arrive is honest about what we know: this is when this device
          // learned of the line, not when it was written.
          updated_at: new Date().toISOString(),
          dirty: 0,
          deleted_at: null,
        }),
      },
    ],
  },
  {
    local: "payments",
    server: "payments",
    cursorCol: "updated_at",
    toLocal: (r) => ({
      id: String(r.id),
      direction: String(r.direction),
      party_type: String(r.party_type),
      party_id: text(r.party_id),
      invoice_id: text(r.invoice_id),
      amount_paise: toPaise(r.amount),
      method: String(r.method ?? "cash"),
      date: String(r.date),
      created_by: text(r.created_by),
      org_id: String(r.org_id),
      version: Number(r.version ?? 0),
      updated_at: iso(r.updated_at),
      dirty: 0,
      deleted_at: null,
    }),
  },
  {
    local: "purchases",
    server: "purchases",
    cursorCol: "updated_at",
    toLocal: (r) => ({
      id: String(r.id),
      number: text(r.number),
      supplier_id: text(r.supplier_id),
      date: String(r.date),
      status: String(r.status ?? "draft"),
      subtotal_paise: toPaise(r.subtotal),
      tax_paise: toPaise(r.tax),
      total_paise: toPaise(r.total),
      custom_fields: jsonText(r.custom_fields),
      org_id: String(r.org_id),
      version: Number(r.version ?? 0),
      updated_at: iso(r.updated_at),
      dirty: 0,
      deleted_at: null,
    }),
    children: [
      {
        local: "purchase_items",
        server: "purchase_items",
        fk: "purchase_id",
        toLocal: (r) => ({
          id: String(r.id),
          purchase_id: String(r.purchase_id),
          product_id: text(r.product_id),
          qty_milli: toMilli(r.qty),
          rate_paise: toPaise(r.rate),
          tax_bps: toBps(r.tax_rate),
          amount_paise: toPaise(r.amount),
          meta: jsonText(r.meta),
          org_id: String(r.org_id),
          version: 0,
          updated_at: new Date().toISOString(),
          dirty: 0,
          deleted_at: null,
        }),
      },
    ],
  },
  {
    local: "expenses",
    server: "expenses",
    cursorCol: "updated_at",
    toLocal: (r) => ({
      id: String(r.id),
      category: text(r.category),
      amount_paise: toPaise(r.amount),
      date: String(r.date),
      note: text(r.note),
      receipt_url: text(r.receipt_url),
      recurring: r.recurring ? 1 : 0,
      custom_fields: jsonText(r.custom_fields),
      created_by: text(r.created_by),
      org_id: String(r.org_id),
      version: Number(r.version ?? 0),
      updated_at: iso(r.updated_at),
      dirty: 0,
      deleted_at: null,
    }),
  },
  {
    local: "stock_movements",
    server: "stock_movements",
    // Append-only, and the only synced table whose server side has no
    // updated_at — created_at is both the cursor and the fact.
    cursorCol: "created_at",
    toLocal: (r) => ({
      id: String(r.id),
      product_id: String(r.product_id),
      type: String(r.type),
      qty_milli: toMilli(r.qty_delta),
      ref_type: text(r.ref_type),
      ref_id: text(r.ref_id),
      created_at: iso(r.created_at),
      org_id: String(r.org_id),
      version: 0,
      updated_at: iso(r.created_at),
      dirty: 0,
      deleted_at: null,
    }),
  },
];

/** One page per table per pass — enough to catch up quickly, small enough that
 *  a first sync on a big workspace does not block the UI thread for a minute. */
const PULL_PAGE = 500;

const EPOCH = "1970-01-01T00:00:00Z";

async function cursorGet(table: string): Promise<string> {
  const row = await get<{ value: string }>(
    `SELECT value FROM sync_state WHERE key = ?`,
    [`pull:${table}`],
  );
  return row?.value ?? EPOCH;
}

async function cursorSet(table: string, value: string): Promise<void> {
  await run(
    `INSERT INTO sync_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [`pull:${table}`, value],
  );
}

/**
 * INSERT … ON CONFLICT(id) DO UPDATE … WHERE <table>.dirty = 0.
 *
 * The WHERE is the whole safety story: an existing row that this device has
 * edited and not yet pushed is left exactly as it is.
 */
function upsertSql(table: string, row: Record<string, Param>): {
  sql: string;
  params: Param[];
} {
  const cols = Object.keys(row);
  const setters = cols
    .filter((c) => c !== "id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  return {
    sql:
      `INSERT INTO ${table} (${cols.join(", ")}) ` +
      `VALUES (${cols.map(() => "?").join(", ")}) ` +
      `ON CONFLICT(id) DO UPDATE SET ${setters} WHERE ${table}.dirty = 0`,
    params: cols.map((c) => row[c] ?? null),
  };
}

type Client = ReturnType<typeof createClient>;

async function pullOnce(supabase: Client): Promise<number> {
  let received = 0;

  for (const d of PULLS) {
    const since = await cursorGet(d.local);
    const { data, error } = await supabase
      .from(d.server)
      .select("*")
      .gt(d.cursorCol, since)
      .order(d.cursorCol, { ascending: true })
      .limit(PULL_PAGE);
    if (error) throw new Error(`pull ${d.server}: ${error.message}`);

    const rows = (data ?? []) as ServerRow[];
    if (rows.length === 0) continue;

    // One transaction per page: either the whole page lands or none of it does,
    // and the cursor only moves after it has.
    await batch(rows.map((r) => upsertSql(d.local, d.toLocal(r))));
    received += rows.length;

    for (const child of d.children ?? []) {
      const ids = rows.map((r) => String(r.id));
      const { data: kids, error: kidErr } = await supabase
        .from(child.server)
        .select("*")
        .in(child.fk, ids);
      if (kidErr) throw new Error(`pull ${child.server}: ${kidErr.message}`);
      const kidRows = (kids ?? []) as ServerRow[];
      if (kidRows.length === 0) continue;
      await batch(kidRows.map((r) => upsertSql(child.local, child.toLocal(r))));
      received += kidRows.length;
    }

    // Only now, once everything for this page is committed locally.
    const last = rows[rows.length - 1];
    if (last) await cursorSet(d.local, String(last[d.cursorCol]));
  }

  return received;
}

// --- Observable status -------------------------------------------------------

type Listener = (s: SyncStatus) => void;
const listeners = new Set<Listener>();
const status: SyncStatus = { online: true, pending: 0, syncing: false, failed: 0 };

function emit() {
  for (const l of listeners) l(status);
}
export function subscribeSync(l: Listener): () => void {
  listeners.add(l);
  l(status);
  return () => listeners.delete(l);
}

// --- Retry state (the engine's policy, per record) ---------------------------

interface Retry { attempts: number; nextAt: number; error: string; }
const retry = new Map<string, Retry>();

// --- The push loop -----------------------------------------------------------

let flushing = false;

async function flushOnce(): Promise<void> {
  let supabase;
  try {
    supabase = createClient();
  } catch {
    return; // Supabase not configured — nothing to push to.
  }
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) return; // not signed in

  await ready();
  const now = Date.now();

  for (const d of DESCS) {
    const rows = await all<LocalRow>(
      `SELECT * FROM ${d.local} WHERE dirty = 1 AND deleted_at IS NULL LIMIT 200`,
      [],
    );
    for (const row of rows) {
      const id = String(row.id);
      const r = retry.get(id);
      if (r && r.attempts < MAX_ATTEMPTS && r.nextAt > now) continue; // backing off

      try {
        const payload = d.map(row);
        if (d.hasVersion) {
          const { data, error } = await supabase
            .from(d.server)
            .upsert(payload, { onConflict: "id" })
            .select("version")
            .single();
          if (error) throw new Error(error.message);
          await run(`UPDATE ${d.local} SET dirty = 0, version = ? WHERE id = ?`, [
            (data as { version?: number } | null)?.version ?? Number(row.version ?? 1),
            id,
          ]);
        } else {
          const { error } = await supabase.from(d.server).upsert(payload, { onConflict: "id" });
          if (error) throw new Error(error.message);
          await run(`UPDATE ${d.local} SET dirty = 0 WHERE id = ?`, [id]);
        }
        retry.delete(id);
      } catch (err) {
        const attempts = (retry.get(id)?.attempts ?? 0) + 1;
        retry.set(id, {
          attempts,
          nextAt: Date.now() + backoffMs(attempts),
          error: (err as Error).message,
        });
        status.lastError = (err as Error).message;
      }
    }
  }

  // Push first, then pull. In this order a row this device just uploaded is
  // already clean before the fetch sees it, so it is not read straight back
  // down and re-applied on top of itself.
  try {
    await pullOnce(supabase);
  } catch (err) {
    status.lastError = (err as Error).message;
  }
}

async function updateCounts(): Promise<void> {
  await ready();
  let pending = 0;
  for (const d of DESCS) {
    // Per table, not per pass. One table that cannot be counted — a schema that
    // has moved on, a worker that answered badly — used to abort the whole
    // tally, and because this ran outside the try below it wedged the runner.
    try {
      const row = await get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${d.local} WHERE dirty = 1 AND deleted_at IS NULL`,
        [],
      );
      pending += row?.n ?? 0;
    } catch {
      // A count is a number on a badge. It is never worth stopping sync for.
    }
  }
  status.pending = pending;
  status.failed = [...retry.values()].filter((r) => r.attempts >= MAX_ATTEMPTS).length;
  status.online = typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * A pass that never finishes must not mean a runner that never runs again.
 *
 * `flushing` is the re-entry guard, so whatever happens it has to be cleared —
 * and the only way to guarantee that is a `finally`. Without one, a throw
 * anywhere after the old try block left `flushing` true and `syncing` true for
 * the life of the tab: the pill sat on "Syncing…" forever and every later
 * trigger returned at the guard on the first line. That is the bug this
 * function existed to cause.
 */
const FLUSH_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`sync timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e as Error);
      },
    );
  });
}

async function runFlush(): Promise<void> {
  if (flushing) return;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    try {
      await updateCounts();
    } catch {
      // Offline is not the moment to care why a count failed.
    }
    emit();
    return;
  }

  flushing = true;
  status.syncing = true;
  // Each pass reports its own outcome. Carrying an error across a later clean
  // pass would leave the pill accusing a problem that has already been fixed.
  // `delete` rather than `= undefined`: exactOptionalPropertyTypes is on.
  delete status.lastError;
  emit();
  try {
    // A hung request is indistinguishable from a slow one until it is not.
    // The timeout turns "wedged forever" into "failed, try again in 30s".
    await withTimeout(flushOnce(), FLUSH_TIMEOUT_MS);
  } catch (err) {
    status.lastError = (err as Error).message;
  } finally {
    try {
      await updateCounts();
    } catch (err) {
      status.lastError = (err as Error).message;
    }
    status.syncing = false;
    status.lastSyncedAt = Date.now();
    flushing = false;
    emit();
  }
}

/** Manual "retry now": clear backoff on failed rows and flush immediately. */
export function retrySync(): void {
  for (const r of retry.values()) r.nextAt = 0;
  void runFlush();
}

/** Kick a flush now (e.g. from the pill, or right after a save). */
export function requestSync(): void {
  void runFlush();
}

// --- Lifecycle ---------------------------------------------------------------

let started = false;

export function startSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const onOnline = () => {
    status.online = true;
    emit();
    void runFlush();
  };
  const onOffline = () => {
    status.online = false;
    emit();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void runFlush();
  });
  // A steady heartbeat catches anything the events missed.
  window.setInterval(() => {
    if (navigator.onLine) void runFlush();
  }, 30_000);

  status.online = navigator.onLine;
  void runFlush();
}
