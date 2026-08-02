import type { SqlDriver } from "./driver";
import { MIGRATIONS } from "./schema";

/**
 * Migration runner, keyed on SQLite's own `user_version` pragma.
 *
 * A separate migrations table would need a migration of its own to create, and
 * would not be readable before it existed. `user_version` is a 32-bit int in
 * the database header — present from the moment the file is, and free to read.
 */

export function currentVersion(db: SqlDriver): number {
  const row = db.get<{ user_version: number }>("PRAGMA user_version");
  return row?.user_version ?? 0;
}

/**
 * Bring a database up to the latest schema.
 *
 * Idempotent: running it on an up-to-date database does nothing, so it is safe
 * to call on every app start — which is the only way to be sure a device that
 * has been offline for months catches up before it reads anything.
 */
export function migrate(db: SqlDriver): { from: number; to: number } {
  const from = currentVersion(db);
  const to = MIGRATIONS.length;

  if (from > to) {
    // The app was downgraded, or the file came from a newer build. Continuing
    // would let old code write rows the new schema promised; refuse instead.
    throw new Error(
      `Database is at schema v${from} but this build only knows v${to}. ` +
        `Refusing to run against a newer database.`,
    );
  }
  if (from === to) return { from, to };

  // One transaction for the whole upgrade: a half-migrated database on a phone
  // that was closed mid-upgrade is unrecoverable without this.
  db.transaction(() => {
    for (let v = from; v < to; v++) {
      const sql = MIGRATIONS[v];
      if (!sql) throw new Error(`Missing migration for v${v + 1}`);
      db.exec(sql);
    }
    // PRAGMA does not accept a bound parameter, and this value is a number we
    // computed, never user input.
    db.exec(`PRAGMA user_version = ${to}`);
  });

  return { from, to };
}

/**
 * Pragmas applied on every open.
 *
 * These are per-connection, not stored in the file, so they must be set each
 * time rather than once at creation.
 */
export function applyPragmas(db: SqlDriver): void {
  // Without this SQLite silently ignores every REFERENCES clause in the schema.
  db.exec("PRAGMA foreign_keys = ON");
  // Durability over speed: an invoice must survive the phone dying, which is
  // the whole promise of "never loses data".
  db.exec("PRAGMA synchronous = FULL");
}
