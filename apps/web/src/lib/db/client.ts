"use client";

import type { SqlValue } from "@vyora/db";

/**
 * Main-thread handle to the database worker.
 *
 * Every call is a round-trip to the worker, so this is async where SqlDriver is
 * sync — a deliberate difference. Pretending otherwise (by blocking on
 * Atomics.wait) would freeze the UI, which is the opposite of "every action
 * completes locally in milliseconds".
 */

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export interface OpenResult {
  schemaVersion: number;
  migrated: { from: number; to: number };
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
  if (worker) return worker;

  // new URL(..., import.meta.url) is how a bundler is told to emit this as a
  // separate worker chunk rather than inlining it into the page.
  worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
    name: "vyora-db",
  });

  worker.onmessage = (
    e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>,
  ) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result);
    else p.reject(new Error(e.data.error ?? "Database worker failed."));
  };

  worker.onerror = (e) => {
    // Fail every in-flight call rather than leaving callers hanging forever.
    const err = new Error(`Database worker crashed: ${e.message}`);
    for (const [, p] of pending) p.reject(err);
    pending.clear();
  };

  return worker;
}

function call<T>(msg: Record<string, unknown>): Promise<T> {
  const id = ++seq;
  const w = ensureWorker();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ ...msg, id });
  });
}

/** Open the local database and bring its schema up to date. */
export const openDatabase = () => call<OpenResult>({ kind: "open" });

export const all = <T>(sql: string, params: SqlValue[] = []) =>
  call<T[]>({ kind: "all", sql, params });

export const get = <T>(sql: string, params: SqlValue[] = []) =>
  call<T | null>({ kind: "get", sql, params });

export const run = (sql: string, params: SqlValue[] = []) =>
  call<null>({ kind: "run", sql, params });

/** Apply several statements in one transaction — all land, or none do. */
export const batch = (statements: { sql: string; params?: SqlValue[] }[]) =>
  call<null>({ kind: "batch", statements });

export async function closeDatabase(): Promise<void> {
  if (!worker) return;
  await call({ kind: "close" });
  worker.terminate();
  worker = null;
}

/**
 * Whether this browser can host the local database at all.
 *
 * Checked before opening so the app can say why rather than throwing an opaque
 * wasm error at a shop owner.
 */
export function isOfflineCapable(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof SharedArrayBuffer !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}
