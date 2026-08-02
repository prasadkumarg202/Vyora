import { DatabaseSync } from "node:sqlite";

import type { SqlDriver, SqlValue } from "../driver";

/**
 * node:sqlite driver — for tests only.
 *
 * The point is that the schema and every query run against a real SQLite here,
 * not a mock. A fake would happily accept SQL that sqlite-wasm rejects, which
 * would mean finding schema bugs in a browser instead of a test.
 *
 * Not exported from the package index: shipping it to a browser bundle would
 * pull in node:sqlite and fail the build.
 */
export function createNodeDriver(path = ":memory:"): SqlDriver {
  const db = new DatabaseSync(path);

  return {
    run(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.run(...(params as SqlValue[]));
    },
    all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...(params as SqlValue[])) as T[];
    },
    get<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).get(...(params as SqlValue[])) as T | undefined;
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
        // Leaving a transaction open would wedge every later write.
        db.exec("ROLLBACK");
        throw err;
      }
    },
    close() {
      db.close();
    },
  };
}
