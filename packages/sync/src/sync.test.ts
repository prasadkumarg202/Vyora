import { describe, expect, it } from "vitest";

import {
  mergeCounter,
  mergeFields,
  resolve,
  strategyFor,
} from "./conflict";
import {
  BASE_DELAY_MS,
  MAX_ATTEMPTS,
  MAX_DELAY_MS,
  backoffMs,
  canTransition,
  collect,
  isDue,
  markFailed,
  markSynced,
  markSyncing,
  prune,
  retryNow,
} from "./outbox";
import type { ChangeRecord, EntityKind, LocalRecord, RemoteRecord } from "./types";

const NOW = 1_752_624_000_000;

const change = (over: Partial<ChangeRecord> = {}): ChangeRecord => ({
  id: "c1",
  entity: "invoice",
  op: "insert",
  payload: { v: 1, iv: "aa", ct: "bb" },
  baseVersion: 1,
  createdAt: NOW,
  state: "pending",
  attempts: 0,
  orgId: "org-1",
  recordId: "r1",
  ...over,
});

const local = (over: Partial<LocalRecord> = {}): LocalRecord => ({
  id: "r1",
  orgId: "org-1",
  entity: "customer",
  payload: null,
  version: 1,
  updatedAt: "2026-07-17T10:00:00.000Z",
  ...over,
});

const remote = (over: Partial<RemoteRecord> = {}): RemoteRecord => ({
  id: "r1",
  orgId: "org-1",
  entity: "customer",
  payload: null,
  version: 1,
  updatedAt: "2026-07-17T10:00:00.000Z",
  ...over,
});

describe("backoff", () => {
  it("follows 2s, 4s, 8s ...", () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(3)).toBe(8_000);
    expect(backoffMs(4)).toBe(16_000);
  });

  it("caps at 5 minutes", () => {
    expect(backoffMs(20)).toBe(MAX_DELAY_MS);
    // A corrupted attempts count must not produce Infinity or a negative delay.
    expect(backoffMs(9_999)).toBe(MAX_DELAY_MS);
  });

  it("never returns a delay below the base", () => {
    expect(backoffMs(0)).toBe(BASE_DELAY_MS);
    expect(backoffMs(-5)).toBe(BASE_DELAY_MS);
  });
});

describe("outbox state machine", () => {
  it("allows only the spec's transitions", () => {
    expect(canTransition("pending", "syncing")).toBe(true);
    expect(canTransition("syncing", "synced")).toBe(true);
    expect(canTransition("syncing", "failed")).toBe(true);
    expect(canTransition("failed", "pending")).toBe(true);
    // synced is terminal — it gets pruned, not revived.
    expect(canTransition("synced", "pending")).toBe(false);
    expect(canTransition("pending", "synced")).toBe(false);
  });

  it("throws on an illegal transition rather than no-op'ing", () => {
    // A silent no-op would look like a stuck queue and be undiagnosable.
    expect(() => markSynced(change({ state: "pending" }))).toThrow(/Illegal/);
    expect(() => markSyncing(change({ state: "synced" }))).toThrow(/Illegal/);
  });

  it("schedules a retry with backoff on failure", () => {
    const failed = markFailed(markSyncing(change()), "network down", NOW);
    expect(failed.state).toBe("failed");
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe("network down");
    expect(failed.nextAttemptAt).toBe(NOW + 2_000);
  });

  it("stops auto-retrying after MAX_ATTEMPTS but never drops the change", () => {
    let c = change({ state: "syncing", attempts: MAX_ATTEMPTS - 1 });
    c = markFailed(c, "still down", NOW);

    expect(c.attempts).toBe(MAX_ATTEMPTS);
    expect(c.state).toBe("failed");
    // No next attempt: it waits for the user.
    expect(c.nextAttemptAt).toBeUndefined();
    expect(isDue(c, NOW + 10 ** 9)).toBe(false);

    // ...and the one-tap retry puts it back in the queue.
    const retried = retryNow(c, NOW);
    expect(retried.state).toBe("pending");
    expect(isDue(retried, NOW)).toBe(true);
  });

  it("clears the error once synced", () => {
    const failed = markFailed(markSyncing(change()), "boom", NOW);
    const synced = markSynced(markSyncing(retryNow(failed, NOW)));
    expect(synced.state).toBe("synced");
    expect(synced.lastError).toBeUndefined();
  });

  it("holds a failed change until its backoff elapses", () => {
    const failed = markFailed(markSyncing(change()), "boom", NOW);
    expect(isDue(failed, NOW + 1_999)).toBe(false);
    expect(isDue(failed, NOW + 2_000)).toBe(true);
  });

  it("prunes synced records only", () => {
    const kept = prune([
      change({ id: "a", state: "pending" }),
      change({ id: "b", state: "synced" }),
      change({ id: "c", state: "failed" }),
    ]);
    expect(kept.map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("collect", () => {
  it("takes due changes oldest first", () => {
    const batch = collect(
      [
        change({ id: "b", createdAt: NOW + 200 }),
        change({ id: "a", createdAt: NOW + 100 }),
        change({ id: "c", createdAt: NOW + 300 }),
      ],
      NOW + 1_000,
    );
    // Order matters: an invoice must not overtake the product it references.
    expect(batch.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("bounds the batch", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      change({ id: `c${i}`, createdAt: NOW + i }),
    );
    expect(collect(many, NOW + 10_000, 50)).toHaveLength(50);
  });

  it("skips changes that are already in flight or done", () => {
    const batch = collect(
      [
        change({ id: "a", state: "syncing" }),
        change({ id: "b", state: "synced" }),
        change({ id: "c", state: "pending" }),
      ],
      NOW,
    );
    expect(batch.map((c) => c.id)).toEqual(["c"]);
  });

  it("orders deterministically when timestamps tie", () => {
    const batch = collect(
      [change({ id: "z", createdAt: NOW }), change({ id: "a", createdAt: NOW })],
      NOW,
    );
    // Two devices must agree on the order, so ties break on id.
    expect(batch.map((c) => c.id)).toEqual(["a", "z"]);
  });
});

describe("conflict strategy table", () => {
  it("matches the spec", () => {
    expect(strategyFor("invoice")).toBe("immutable");
    expect(strategyFor("product")).toBe("field-merge");
    expect(strategyFor("stock")).toBe("crdt-counter");
    expect(strategyFor("customer")).toBe("last-writer-wins");
  });

  it("refuses an entity with no defined strategy", () => {
    // Defaulting to LWW would silently lose data for an unconsidered type.
    expect(() => strategyFor("mystery" as EntityKind)).toThrow(/No conflict strategy/);
  });
});

describe("tombstones beat edits", () => {
  it("remote delete wins over a local edit", () => {
    const r = resolve(local({ version: 9 }), remote({ deletedAt: "2026-07-17T11:00:00.000Z" }));
    // Even though local has a much higher version.
    expect(r).toMatchObject({ winner: "remote", strategy: "tombstone" });
  });

  it("local delete wins over a remote edit", () => {
    const r = resolve(local({ deletedAt: "2026-07-17T11:00:00.000Z" }), remote({ version: 9 }));
    expect(r).toMatchObject({ winner: "local", strategy: "tombstone" });
  });

  it("converges when both deleted", () => {
    const r = resolve(
      local({ deletedAt: "2026-07-17T11:00:00.000Z" }),
      remote({ deletedAt: "2026-07-17T12:00:00.000Z" }),
    );
    expect(r.strategy).toBe("tombstone");
  });

  it("beats even an immutable invoice", () => {
    const r = resolve(
      local({ entity: "invoice" }),
      remote({ entity: "invoice", deletedAt: "2026-07-17T11:00:00.000Z" }),
    );
    expect(r.strategy).toBe("tombstone");
  });
});

describe("last-writer-wins", () => {
  it("prefers the higher version", () => {
    expect(resolve(local({ version: 1 }), remote({ version: 2 })).winner).toBe("remote");
    expect(resolve(local({ version: 3 }), remote({ version: 2 })).winner).toBe("local");
  });

  it("uses updatedAt only to break a version tie", () => {
    const r = resolve(
      local({ version: 2, updatedAt: "2026-07-17T10:00:00.000Z" }),
      remote({ version: 2, updatedAt: "2026-07-17T11:00:00.000Z" }),
    );
    expect(r.winner).toBe("remote");
  });

  it("does not let a skewed device clock beat a higher version", () => {
    // A phone with a wrong clock must not win every merge forever.
    const r = resolve(
      local({ version: 1, updatedAt: "2099-01-01T00:00:00.000Z" }),
      remote({ version: 2, updatedAt: "2026-07-17T10:00:00.000Z" }),
    );
    expect(r.winner).toBe("remote");
  });

  it("converges deterministically on an exact tie", () => {
    const r = resolve(local({ version: 2 }), remote({ version: 2 }));
    // Both devices must reach the same answer.
    expect(r.winner).toBe("remote");
  });

  it("refuses an unparseable timestamp", () => {
    expect(() =>
      resolve(local({ version: 1, updatedAt: "not a date" }), remote({ version: 1 })),
    ).toThrow(/invalid updatedAt/);
  });
});

describe("guards", () => {
  it("never merges different records", () => {
    expect(() => resolve(local({ id: "a" }), remote({ id: "b" }))).toThrow(/different records/);
  });

  it("never merges across organisations", () => {
    expect(() => resolve(local({ orgId: "org-1" }), remote({ orgId: "org-2" }))).toThrow(
      /different organisations/,
    );
  });
});

describe("invoices are immutable", () => {
  it("keeps the issued server copy", () => {
    const r = resolve(
      local({ entity: "invoice", version: 5 }),
      remote({ entity: "invoice", version: 4 }),
    );
    // Even with a higher local version: corrections are new credit notes.
    expect(r).toMatchObject({ winner: "remote", strategy: "immutable" });
  });

  it("treats payments and purchases the same", () => {
    expect(strategyFor("payment")).toBe("immutable");
    expect(strategyFor("purchase")).toBe("immutable");
  });
});

describe("field-level merge", () => {
  it("keeps both edits — the spec's price/stock example", () => {
    const base = { name: "Crocin", price: 3000, stock: 10 };
    const mine = { name: "Crocin", price: 3500, stock: 10 }; // device A: price
    const theirs = { name: "Crocin", price: 3000, stock: 7 }; // device B: stock

    expect(mergeFields(base, mine, theirs)).toEqual({
      name: "Crocin",
      price: 3500,
      stock: 7,
    });
  });

  it("does not clobber a local edit with a stale remote value", () => {
    // Without the base, a shallow spread would overwrite price with 3000.
    const base = { price: 3000, hsn: "3004" };
    const mine = { price: 3500, hsn: "3004" };
    const theirs = { price: 3000, hsn: "3004" };
    expect(mergeFields(base, mine, theirs).price).toBe(3500);
  });

  it("falls back to the remote on a same-field conflict", () => {
    const base = { price: 3000 };
    expect(mergeFields(base, { price: 3500 }, { price: 4000 }).price).toBe(4000);
    expect(mergeFields(base, { price: 3500 }, { price: 4000 }, "local").price).toBe(3500);
  });

  it("keeps a field only one side added", () => {
    const merged = mergeFields<Record<string, unknown>>(
      { a: 1 },
      { a: 1, mine: true },
      { a: 1, theirs: true },
    );
    expect(merged).toMatchObject({ a: 1, mine: true, theirs: true });
  });

  it("handles a missing base without clobbering", () => {
    const merged = mergeFields(null, { a: 1, b: 2 }, { a: 9, b: 2 });
    // No ancestor: both look changed, so the conflict rule applies.
    expect(merged.a).toBe(9);
  });

  it("compares nested values structurally", () => {
    const base = { addr: { city: "Hyderabad" }, n: 1 };
    const mine = { addr: { city: "Hyderabad" }, n: 2 };
    const theirs = { addr: { city: "Chennai" }, n: 1 };
    expect(mergeFields(base, mine, theirs)).toEqual({ addr: { city: "Chennai" }, n: 2 });
  });
});

describe("stock is a CRDT counter", () => {
  it("resolves to a merge, never an overwrite", () => {
    const r = resolve(local({ entity: "stock" }), remote({ entity: "stock" }));
    expect(r).toMatchObject({ winner: "merge", strategy: "crdt-counter" });
  });

  it("sums concurrent sales instead of losing one", () => {
    // Two counters each sell the last unit: 10 -> 9 and 10 -> 9.
    // LWW would give 9. The truth is 8.
    expect(mergeCounter(10, 9, 9)).toBe(8);
  });

  it("handles a sale and a restock together", () => {
    expect(mergeCounter(10, 8, 20)).toBe(18); // -2 and +10
  });

  it("is commutative", () => {
    expect(mergeCounter(10, 8, 20)).toBe(mergeCounter(10, 20, 8));
  });

  it("is a no-op when neither side moved", () => {
    expect(mergeCounter(10, 10, 10)).toBe(10);
  });
});
