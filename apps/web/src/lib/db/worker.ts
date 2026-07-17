/// <reference lib="webworker" />

import { applyPragmas, currentVersion, migrate, type SqlDriver, type SqlValue } from "@vyora/db";
import { createOpfsDriver } from "@vyora/db/opfs";

/**
 * The database worker.
 *
 * All SQLite access happens here because sqlite-wasm's synchronous OPFS VFS
 * only works off the main thread — there it silently falls back to a transient
 * in-memory database, which looks fine until a reload loses the day's work.
 *
 * It also keeps the main thread free: a report joining thousands of rows must
 * not jank the till while a cashier is typing.
 */

type Request =
  | { id: number; kind: "open" }
  | { id: number; kind: "all"; sql: string; params?: SqlValue[] }
  | { id: number; kind: "get"; sql: string; params?: SqlValue[] }
  | { id: number; kind: "run"; sql: string; params?: SqlValue[] }
  | { id: number; kind: "close" };

type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

let db: SqlDriver | null = null;

async function open(): Promise<{ schemaVersion: number; migrated: { from: number; to: number } }> {
  if (!db) {
    db = await createOpfsDriver("vyora.sqlite3");
    applyPragmas(db);
  }
  const migrated = migrate(db);
  return { schemaVersion: currentVersion(db), migrated };
}

function require_(): SqlDriver {
  if (!db) throw new Error("Database is not open. Send { kind: 'open' } first.");
  return db;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const req = event.data;
  const reply = (r: Response) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r);

  try {
    switch (req.kind) {
      case "open":
        reply({ id: req.id, ok: true, result: await open() });
        break;
      case "all":
        reply({ id: req.id, ok: true, result: require_().all(req.sql, req.params ?? []) });
        break;
      case "get":
        reply({ id: req.id, ok: true, result: require_().get(req.sql, req.params ?? []) ?? null });
        break;
      case "run":
        require_().run(req.sql, req.params ?? []);
        reply({ id: req.id, ok: true, result: null });
        break;
      case "close":
        db?.close();
        db = null;
        reply({ id: req.id, ok: true, result: null });
        break;
    }
  } catch (err) {
    // Errors are returned, not thrown: an uncaught throw in a worker surfaces
    // as a generic "error" event with no message, which is undebuggable.
    reply({ id: req.id, ok: false, error: (err as Error).message });
  }
};
