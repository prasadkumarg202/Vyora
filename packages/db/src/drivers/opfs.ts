import type { SqlDriver, SqlValue } from "../driver";

/**
 * sqlite-wasm on OPFS — the real device driver.
 *
 * OPFS gives a durable, origin-private file the SQLite VFS can write to
 * synchronously, which is what makes "every action completes locally in
 * milliseconds" true. It only exists in a browser, so this module must never be
 * imported from Node.
 *
 * Two constraints the browser imposes, which shape everything below:
 *
 *  1. The synchronous OPFS VFS only works inside a Worker. On the main thread
 *     sqlite-wasm silently falls back to a transient in-memory database — the
 *     app would look fine and lose every invoice on reload. We detect and
 *     refuse rather than degrade.
 *  2. It needs cross-origin isolation (COOP/COEP) for SharedArrayBuffer.
 */

interface SqliteApi {
  oo1: {
    OpfsDb?: new (filename: string) => OoDb;
    DB: new (filename: string, mode?: string) => OoDb;
  };
  capi: unknown;
}

interface OoDb {
  exec(opts: string | { sql: string; bind?: readonly SqlValue[]; rowMode?: string; returnValue?: string }): unknown;
  close(): void;
}

let sqlitePromise: Promise<SqliteApi> | null = null;

async function loadSqlite(): Promise<SqliteApi> {
  // Dynamic import: keeps the ~1MB wasm out of the main bundle and off the
  // critical path for users who never go offline in a given session.
  sqlitePromise ??= import("@sqlite.org/sqlite-wasm").then((m) =>
    (m.default as unknown as (opts?: unknown) => Promise<SqliteApi>)({
      print: () => {},
      printErr: () => {},
    }),
  );
  return sqlitePromise;
}

export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof SharedArrayBuffer !== "undefined"
  );
}

/**
 * Open the on-device database.
 *
 * Throws rather than falling back to memory: a silent in-memory database is the
 * worst possible failure here, because it looks like it works right up until
 * the user reloads and their day's invoices are gone.
 */
export async function createOpfsDriver(
  filename = "vyora.sqlite3",
): Promise<SqlDriver> {
  if (typeof window !== "undefined" && typeof (globalThis as { importScripts?: unknown }).importScripts === "undefined") {
    throw new Error(
      "The OPFS driver must run in a Worker. On the main thread sqlite-wasm " +
        "falls back to a transient in-memory database, which would lose data on reload.",
    );
  }
  if (!isOpfsAvailable()) {
    throw new Error(
      "OPFS is unavailable. It needs a secure context and cross-origin " +
        "isolation (COOP/COEP) for SharedArrayBuffer.",
    );
  }

  const sqlite3 = await loadSqlite();
  if (!sqlite3.oo1.OpfsDb) {
    throw new Error("sqlite-wasm loaded without OPFS support.");
  }
  const db = new sqlite3.oo1.OpfsDb(filename);

  const driver: SqlDriver = {
    run(sql, params = []) {
      db.exec({ sql, bind: params });
    },
    all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.exec({
        sql,
        bind: params,
        rowMode: "object",
        returnValue: "resultRows",
      }) as T[];
    },
    get<T>(sql: string, params: readonly SqlValue[] = []) {
      const rows = driver.all<T>(sql, params);
      return rows[0];
    },
    exec(sql) {
      db.exec(sql);
    },
    transaction<T>(fn: () => T): T {
      db.exec("BEGIN");
      try {
        const out = fn();
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    close() {
      db.close();
    },
  };

  return driver;
}
