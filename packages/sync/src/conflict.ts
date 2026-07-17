import type { EntityKind, LocalRecord, RemoteRecord } from "./types";

/**
 * Conflict resolution, per design/Vyora Sync Engine.dc.html:
 *
 *   Invoices        Immutable + append   corrections are new credit/debit notes
 *   Products        Field-level merge    price from one device, stock from another
 *   Stock levels    CRDT delta counter   concurrent sales both decrement
 *   Customer        Last-writer-wins     low-contention descriptive data
 *   Any delete      Tombstone            deletion always beats a concurrent edit
 *
 * All deterministic and automatic — the spec is explicit that resolution "needs
 * no user prompt".
 *
 * These functions decide *which* record wins. They deliberately do not decrypt:
 * field-level merge of encrypted bodies happens in mergeFields, which the caller
 * feeds decrypted objects, keeping the DEK out of this module entirely.
 */

export type Strategy =
  | "immutable"
  | "field-merge"
  | "crdt-counter"
  | "last-writer-wins"
  | "tombstone";

/**
 * What an entity's own strategy can be.
 *
 * Tombstone is excluded on purpose: it is not a property of a record type but a
 * rule that outranks all of them, so it is decided before the table is
 * consulted. Encoding that in the type keeps the switch below exhaustive.
 */
export type EntityStrategy = Exclude<Strategy, "tombstone">;

export type Resolution =
  | { winner: "local"; strategy: Strategy; reason: string }
  | { winner: "remote"; strategy: Strategy; reason: string }
  | { winner: "merge"; strategy: Strategy; reason: string };

/**
 * The strategy table. Data, not a switch — a new entity type is a table entry,
 * and an unknown one fails loudly rather than defaulting to something lossy.
 */
const STRATEGY: Record<EntityKind, EntityStrategy> = {
  invoice: "immutable",
  product: "field-merge",
  stock: "crdt-counter",
  customer: "last-writer-wins",
  supplier: "last-writer-wins",
  // Money movements are as immutable as the invoices they settle.
  payment: "immutable",
  purchase: "immutable",
  expense: "last-writer-wins",
};

export function strategyFor(entity: EntityKind): EntityStrategy {
  const s = STRATEGY[entity];
  if (!s) {
    // Defaulting to LWW would silently lose data for a type nobody thought
    // about. Better to stop.
    throw new Error(`No conflict strategy defined for entity "${entity}".`);
  }
  return s;
}

/**
 * Resolve a local/remote pair.
 *
 * Tombstone is checked before the per-entity strategy: the spec says deletion
 * always beats a concurrent edit, regardless of type.
 */
export function resolve(
  local: LocalRecord,
  remote: RemoteRecord,
): Resolution {
  if (local.id !== remote.id) {
    throw new Error("Cannot resolve two different records.");
  }
  if (local.orgId !== remote.orgId) {
    // Never merge across tenants, whatever the versions say.
    throw new Error("Cannot resolve records from different organisations.");
  }

  // --- tombstone wins, always ---
  if (remote.deletedAt && !local.deletedAt) {
    return {
      winner: "remote",
      strategy: "tombstone",
      reason: "Deleted on another device; the local edit is discarded.",
    };
  }
  if (local.deletedAt && !remote.deletedAt) {
    return {
      winner: "local",
      strategy: "tombstone",
      reason: "Deleted here; the remote edit is discarded.",
    };
  }
  if (local.deletedAt && remote.deletedAt) {
    return {
      winner: "remote",
      strategy: "tombstone",
      reason: "Deleted on both; converged.",
    };
  }

  const strategy = strategyFor(local.entity);

  switch (strategy) {
    case "immutable":
      // Once issued, an invoice is never edited — the server's copy is the
      // issued one, and a correction arrives later as a separate credit note.
      return {
        winner: "remote",
        strategy,
        reason:
          "Issued records are immutable; corrections are new credit/debit notes.",
      };

    case "crdt-counter":
      // Deltas are summed by the caller. Neither side "wins": overwriting is
      // exactly the bug this strategy exists to prevent — two counters each
      // selling the last unit must both decrement.
      return {
        winner: "merge",
        strategy,
        reason: "Stock deltas are summed, not overwritten.",
      };

    case "field-merge":
      return {
        winner: "merge",
        strategy,
        reason: "Different fields changed; both edits are kept.",
      };

    case "last-writer-wins":
      return lastWriterWins(local, remote, strategy);

    default:
      // Adding a Strategy without handling it here is a compile error, not a
      // record that silently resolves to nothing.
      return assertNever(strategy);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled conflict strategy: ${String(value)}`);
}

/**
 * Highest version wins; updated_at breaks a tie.
 *
 * Version first because it is monotonic per record and set by the server, while
 * updated_at comes from device clocks — a phone with a wrong clock must not be
 * able to win every merge forever.
 */
function lastWriterWins(
  local: LocalRecord,
  remote: RemoteRecord,
  strategy: Strategy,
): Resolution {
  if (remote.version > local.version) {
    return { winner: "remote", strategy, reason: "Remote has a higher version." };
  }
  if (local.version > remote.version) {
    return { winner: "local", strategy, reason: "Local has a higher version." };
  }

  const l = Date.parse(local.updatedAt);
  const r = Date.parse(remote.updatedAt);
  if (Number.isNaN(l) || Number.isNaN(r)) {
    // An unparseable timestamp must not silently hand the win to either side.
    throw new Error("Cannot compare records with an invalid updatedAt.");
  }
  if (r > l) return { winner: "remote", strategy, reason: "Remote is newer." };
  if (l > r) return { winner: "local", strategy, reason: "Local is newer." };

  // Same version, same instant: pick deterministically so every device
  // converges on the same answer rather than each keeping its own.
  return {
    winner: "remote",
    strategy,
    reason: "Identical version and timestamp; converging on the server copy.",
  };
}

/**
 * Field-level merge of two decrypted bodies against their common ancestor.
 *
 * A three-way merge, not a shallow spread: without the base we cannot tell
 * "B changed this field" from "B never touched it", and would clobber A's edit
 * with B's stale value. That is the exact bug the spec's "price from one
 * device, stock from another" example is about.
 *
 * Conflicting edits to the *same* field fall back to the LWW winner.
 */
export function mergeFields<T extends Record<string, unknown>>(
  base: T | null,
  local: T,
  remote: T,
  preferOnConflict: "local" | "remote" = "remote",
): T {
  const out: Record<string, unknown> = { ...remote };
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const key of keys) {
    const b = base ? base[key] : undefined;
    const l = local[key];
    const r = remote[key];

    const localChanged = !deepEqual(l, b);
    const remoteChanged = !deepEqual(r, b);

    if (localChanged && !remoteChanged) {
      out[key] = l; // only we touched it
    } else if (!localChanged && remoteChanged) {
      out[key] = r; // only they touched it
    } else if (localChanged && remoteChanged && !deepEqual(l, r)) {
      out[key] = preferOnConflict === "local" ? l : r;
    }
    // Neither changed, or both made the same change: remote already holds it.
  }
  return out as T;
}

/**
 * Sum concurrent stock deltas.
 *
 * The whole point: two counters each selling the last unit must both decrement,
 * so the result is base + local delta + remote delta, never "whichever wrote
 * last".
 */
export function mergeCounter(
  base: number,
  localValue: number,
  remoteValue: number,
): number {
  return base + (localValue - base) + (remoteValue - base);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  // Bodies are JSON from the crypto envelope, so this is sound here.
  return JSON.stringify(a) === JSON.stringify(b);
}
