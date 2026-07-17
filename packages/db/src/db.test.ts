import { beforeEach, describe, expect, it } from "vitest";

import type { SqlDriver } from "./driver";
import { createNodeDriver } from "./drivers/node";
import { applyPragmas, currentVersion, migrate } from "./migrate";
import { MIGRATIONS, SYNCED_TABLES } from "./schema";

/**
 * These run against a real SQLite via node:sqlite — not a mock. A fake would
 * accept SQL that sqlite-wasm rejects, which would move schema bugs from here
 * into a browser.
 */

let db: SqlDriver;

beforeEach(() => {
  db = createNodeDriver(":memory:");
  applyPragmas(db);
});

const ORG = "org-1";
const NOW = "2026-07-17T10:00:00.000Z";

describe("migrations", () => {
  it("starts at version 0", () => {
    expect(currentVersion(db)).toBe(0);
  });

  it("migrates to the latest version", () => {
    const r = migrate(db);
    expect(r).toEqual({ from: 0, to: MIGRATIONS.length });
    expect(currentVersion(db)).toBe(MIGRATIONS.length);
  });

  it("is idempotent — safe to run on every app start", () => {
    migrate(db);
    const second = migrate(db);
    expect(second).toEqual({ from: MIGRATIONS.length, to: MIGRATIONS.length });
  });

  it("refuses a database from a newer build", () => {
    migrate(db);
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 5}`);
    // Old code writing to a newer schema would violate promises the new schema
    // made; refusing is the only safe move.
    expect(() => migrate(db)).toThrow(/Refusing to run against a newer database/);
  });

  it("reports version 0 for a database with no user_version set", () => {
    // currentVersion falls back to 0 rather than NaN/undefined, which is what
    // makes migrate() work on a brand-new file.
    const fresh = createNodeDriver(":memory:");
    expect(currentVersion(fresh)).toBe(0);
    fresh.close();
  });

  it("creates every synced table", () => {
    migrate(db);
    const names = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
      .map((r) => r.name);
    for (const t of SYNCED_TABLES) expect(names).toContain(t);
    expect(names).toContain("sync_state");
  });

  it("enforces foreign keys", () => {
    migrate(db);
    // Without PRAGMA foreign_keys = ON, SQLite ignores every REFERENCES clause
    // and this insert would succeed against a product that does not exist.
    expect(() =>
      db.run(
        `INSERT INTO inventory (id, product_id, quantity_milli, org_id, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        ["inv-1", "does-not-exist", 1000, ORG, NOW],
      ),
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe("transactions", () => {
  beforeEach(() => migrate(db));

  it("rolls back on failure", () => {
    expect(() =>
      db.transaction(() => {
        db.run(
          `INSERT INTO customers (id, name, org_id, updated_at) VALUES (?, ?, ?, ?)`,
          ["c1", "Ravi", ORG, NOW],
        );
        throw new Error("boom");
      }),
    ).toThrow("boom");

    // A half-applied sync batch would leave us disagreeing with the server
    // about what was acknowledged.
    expect(db.all("SELECT id FROM customers")).toHaveLength(0);
  });

  it("commits on success", () => {
    db.transaction(() => {
      db.run(
        `INSERT INTO customers (id, name, org_id, updated_at) VALUES (?, ?, ?, ?)`,
        ["c1", "Ravi", ORG, NOW],
      );
    });
    expect(db.all("SELECT id FROM customers")).toHaveLength(1);
  });

  it("leaves the connection usable after a rollback", () => {
    try {
      db.transaction(() => {
        throw new Error("boom");
      });
    } catch {
      /* expected */
    }
    // A transaction left open would wedge every later write.
    db.run(`INSERT INTO customers (id, name, org_id, updated_at) VALUES (?,?,?,?)`, [
      "c2",
      "Later",
      ORG,
      NOW,
    ]);
    expect(db.all("SELECT id FROM customers")).toHaveLength(1);
  });
});

describe("the offline write path", () => {
  beforeEach(() => migrate(db));

  it("accepts a client-generated UUID with no server round-trip", () => {
    // The spec: records created offline never conflict, because the client mints
    // the primary key.
    const id = "3f1a8c9e-0000-4000-8000-000000000001";
    db.run(
      `INSERT INTO invoices (id, date, org_id, updated_at, dirty)
       VALUES (?, ?, ?, ?, 1)`,
      [id, "2026-07-17", ORG, NOW],
    );
    const row = db.get<{ id: string; dirty: number; version: number }>(
      "SELECT id, dirty, version FROM invoices WHERE id = ?",
      [id],
    );
    expect(row?.id).toBe(id);
    // Unsynced and unversioned until the server says otherwise.
    expect(row?.dirty).toBe(1);
    expect(row?.version).toBe(0);
  });

  it("finds dirty rows for the flush", () => {
    db.run(`INSERT INTO products (id, name, org_id, updated_at, dirty) VALUES (?,?,?,?,1)`, [
      "p1",
      "Crocin",
      ORG,
      NOW,
    ]);
    db.run(`INSERT INTO products (id, name, org_id, updated_at, dirty) VALUES (?,?,?,?,0)`, [
      "p2",
      "Dolo",
      ORG,
      NOW,
    ]);
    const dirty = db.all<{ id: string }>("SELECT id FROM products WHERE dirty = 1");
    expect(dirty.map((r) => r.id)).toEqual(["p1"]);
  });

  it("keeps money as integer paise", () => {
    db.run(
      `INSERT INTO invoices (id, date, total_paise, org_id, updated_at) VALUES (?,?,?,?,?)`,
      ["i1", "2026-07-17", 245000, ORG, NOW],
    );
    const row = db.get<{ total_paise: number }>(
      "SELECT total_paise FROM invoices WHERE id = ?",
      ["i1"],
    );
    // 2450.00 rupees, exactly — no float ever touches it.
    expect(row?.total_paise).toBe(245000);
  });
});

describe("tombstones", () => {
  beforeEach(() => migrate(db));

  it("keeps deleted rows so the delete can sync", () => {
    db.run(`INSERT INTO customers (id, name, org_id, updated_at) VALUES (?,?,?,?)`, [
      "c1",
      "Ravi",
      ORG,
      NOW,
    ]);
    db.run(`UPDATE customers SET deleted_at = ?, dirty = 1 WHERE id = ?`, [NOW, "c1"]);

    // A hard DELETE would leave nothing to send, and the delete would never
    // beat a concurrent remote edit.
    expect(db.all("SELECT id FROM customers")).toHaveLength(1);
    expect(db.all("SELECT id FROM customers WHERE deleted_at IS NULL")).toHaveLength(0);
  });
});

describe("stock as a movement ledger", () => {
  beforeEach(() => {
    migrate(db);
    db.run(`INSERT INTO products (id, name, org_id, updated_at) VALUES (?,?,?,?)`, [
      "p1",
      "Crocin",
      ORG,
      NOW,
    ]);
  });

  it("derives the level by summing signed deltas", () => {
    // Stock is a CRDT counter: the movements are the truth, the level is
    // derived, so two counters selling concurrently both count.
    for (const [id, qty] of [
      ["m1", 10_000],
      ["m2", -1_000],
      ["m3", -1_000],
    ] as const) {
      db.run(
        `INSERT INTO stock_movements (id, product_id, type, qty_milli, created_at, org_id, updated_at)
         VALUES (?, ?, 'sale', ?, ?, ?, ?)`,
        [id, "p1", qty, NOW, ORG, NOW],
      );
    }
    const row = db.get<{ level: number }>(
      `SELECT COALESCE(SUM(qty_milli), 0) AS level FROM stock_movements
       WHERE org_id = ? AND product_id = ? AND deleted_at IS NULL`,
      [ORG, "p1"],
    );
    expect(row?.level).toBe(8_000);
  });
});

describe("full SQL with joins, on-device", () => {
  beforeEach(() => migrate(db));

  it("joins an invoice to its customer and lines", () => {
    // The spec's claim: "Full SQL with joins powers every list and report,
    // entirely on-device." That is only possible because local rows are
    // plaintext — this query cannot exist over ciphertext.
    db.run(`INSERT INTO customers (id, name, org_id, updated_at) VALUES (?,?,?,?)`, [
      "c1",
      "Sri Sai Medicals",
      ORG,
      NOW,
    ]);
    db.run(
      `INSERT INTO invoices (id, number, customer_id, date, total_paise, org_id, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      ["i1", "INV-1042", "c1", "2026-07-17", 245000, ORG, NOW],
    );
    for (const [id, amount] of [
      ["li1", 200000],
      ["li2", 45000],
    ] as const) {
      db.run(
        `INSERT INTO invoice_items (id, invoice_id, amount_paise, org_id, updated_at)
         VALUES (?,?,?,?,?)`,
        [id, "i1", amount, ORG, NOW],
      );
    }

    const row = db.get<{ number: string; customer: string; lines: number; sum_paise: number }>(
      `SELECT i.number, c.name AS customer,
              COUNT(li.id) AS lines, SUM(li.amount_paise) AS sum_paise
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN invoice_items li ON li.invoice_id = i.id
       WHERE i.org_id = ? AND i.deleted_at IS NULL
       GROUP BY i.id`,
      [ORG],
    );

    expect(row).toMatchObject({
      number: "INV-1042",
      customer: "Sri Sai Medicals",
      lines: 2,
      sum_paise: 245000,
    });
  });

  it("cascades invoice lines when an invoice is hard-deleted", () => {
    db.run(`INSERT INTO invoices (id, date, org_id, updated_at) VALUES (?,?,?,?)`, [
      "i1",
      "2026-07-17",
      ORG,
      NOW,
    ]);
    db.run(
      `INSERT INTO invoice_items (id, invoice_id, org_id, updated_at) VALUES (?,?,?,?)`,
      ["li1", "i1", ORG, NOW],
    );
    db.run("DELETE FROM invoices WHERE id = ?", ["i1"]);
    expect(db.all("SELECT id FROM invoice_items")).toHaveLength(0);
  });
});

describe("the driver seam", () => {
  it("closes cleanly", () => {
    const d = createNodeDriver(":memory:");
    migrate(d);
    d.close();
    // A leaked handle per app start would exhaust the browser's OPFS locks.
    expect(() => d.all("SELECT 1")).toThrow();
  });

  it("passes parameters rather than interpolating them", () => {
    migrate(db);
    // If params were string-interpolated, this name would end the statement.
    const nasty = "Robert'); DROP TABLE customers;--";
    db.run(`INSERT INTO customers (id, name, org_id, updated_at) VALUES (?,?,?,?)`, [
      "c1",
      nasty,
      ORG,
      NOW,
    ]);
    expect(
      db.get<{ name: string }>("SELECT name FROM customers WHERE id = ?", ["c1"])?.name,
    ).toBe(nasty);
    // The table is still there.
    expect(db.all("SELECT id FROM customers")).toHaveLength(1);
  });
});

describe("sync_state", () => {
  beforeEach(() => migrate(db));

  it("stores the pull cursor", () => {
    db.run("INSERT INTO sync_state (key, value) VALUES ('cursor', ?)", [NOW]);
    db.run("UPDATE sync_state SET value = ? WHERE key = 'cursor'", [
      "2026-07-17T11:00:00.000Z",
    ]);
    expect(
      db.get<{ value: string }>("SELECT value FROM sync_state WHERE key='cursor'")?.value,
    ).toBe("2026-07-17T11:00:00.000Z");
  });
});
