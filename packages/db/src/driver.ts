/**
 * The SQL driver seam.
 *
 * The same schema and the same queries run against two backends: sqlite-wasm on
 * OPFS in the browser, and node:sqlite in tests. Without this seam the schema
 * could only ever be exercised in a real browser, which is a slow and flaky
 * place to find out that a migration is wrong.
 *
 * Deliberately tiny: anything richer would start to differ between the two
 * implementations, which is exactly what a test seam must not do.
 */

export type SqlValue = string | number | bigint | Uint8Array | null;

export interface SqlDriver {
  /** Run a statement with no result rows (DDL, INSERT, UPDATE). */
  run(sql: string, params?: readonly SqlValue[]): void;
  /** Run a query and return every row. */
  all<T = Record<string, SqlValue>>(
    sql: string,
    params?: readonly SqlValue[],
  ): T[];
  /** Run a query and return the first row, or undefined. */
  get<T = Record<string, SqlValue>>(
    sql: string,
    params?: readonly SqlValue[],
  ): T | undefined;
  /** Execute a script of several statements. */
  exec(sql: string): void;
  /**
   * Run fn inside a transaction, rolling back if it throws.
   *
   * Sync applies a batch of changes as a unit: a half-applied batch would leave
   * the local database disagreeing with the server about what was acknowledged.
   */
  transaction<T>(fn: () => T): T;
  close(): void;
}
