/**
 * @vyora/db — the on-device relational core.
 *
 * SQLite WASM on OPFS holds invoices, items, ledgers and stock, so every list
 * and report is a local SQL query and every write completes in milliseconds
 * whether or not there is a network.
 *
 * The encryption boundary is NOT here. The spec encrypts "before they enter the
 * queue or the cloud" and asks this layer for "full SQL with joins" — which
 * cannot run over ciphertext. Rows are plaintext on-device (OPFS is
 * origin-private); @vyora/crypto encrypts on the way out.
 *
 * The OPFS and node drivers are deliberately not re-exported here: one pulls in
 * browser-only globals, the other pulls in node:sqlite, and a bundler resolving
 * either into the wrong environment breaks the build. Import the one you need
 * from its own path.
 */
export type { SqlDriver, SqlValue } from "./driver";

export { applyPragmas, currentVersion, migrate } from "./migrate";

export {
  MIGRATIONS,
  SCHEMA_VERSION,
  SYNCED_TABLES,
  type SyncedTable,
} from "./schema";
