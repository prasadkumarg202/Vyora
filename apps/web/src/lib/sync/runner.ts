"use client";

import { backoffMs, MAX_ATTEMPTS } from "@vyora/sync";

import { all, get, run } from "~/lib/db/client";
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
 * wins on its rows). Pull + the conflict engine (for a second device) layer on
 * top of this same loop next.
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
}

async function updateCounts(): Promise<void> {
  await ready();
  let pending = 0;
  for (const d of DESCS) {
    const row = await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${d.local} WHERE dirty = 1 AND deleted_at IS NULL`,
      [],
    );
    pending += row?.n ?? 0;
  }
  status.pending = pending;
  status.failed = [...retry.values()].filter((r) => r.attempts >= MAX_ATTEMPTS).length;
  status.online = typeof navigator !== "undefined" ? navigator.onLine : true;
}

async function runFlush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await updateCounts();
    emit();
    return;
  }
  flushing = true;
  status.syncing = true;
  emit();
  try {
    await flushOnce();
  } catch (err) {
    status.lastError = (err as Error).message;
  }
  await updateCounts();
  status.syncing = false;
  status.lastSyncedAt = Date.now();
  flushing = false;
  emit();
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
