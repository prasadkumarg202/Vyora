import type { Envelope } from "@vyora/crypto";

/**
 * The outbox, from design/Vyora Offline Architecture.dc.html and
 * design/Vyora Sync Engine.dc.html.
 *
 * Every mutation writes an encrypted, UUID-keyed change record to the outbox
 * and moves through a small state machine:
 *
 *   pending -> syncing -> synced
 *              syncing -> failed -> retry
 *
 * Applied strictly in createdAt order per entity, idempotent by UUID, and
 * pruned after acknowledgement.
 */

export type OutboxState = "pending" | "syncing" | "synced" | "failed";

export type ChangeOp = "insert" | "update" | "delete";

/** The record types whose conflict strategy the Sync Engine spec pins down. */
export type EntityKind =
  | "invoice"
  | "product"
  | "stock"
  | "customer"
  | "supplier"
  | "payment"
  | "purchase"
  | "expense";

/**
 * A change record, exactly as the spec draws it.
 *
 * `payload` is AES-256 ciphertext — the queue holds encrypted bodies, so even
 * the local outbox never contains plaintext business data.
 */
export interface ChangeRecord {
  /** Client-generated UUID. Also the idempotency key: re-sending is safe. */
  id: string;
  entity: EntityKind;
  op: ChangeOp;
  /** The encrypted body. Null for a delete — a tombstone carries no body. */
  payload: Envelope | null;
  /** The server version this change was made against; drives conflict checks. */
  baseVersion: number;
  /** Epoch millis. Ordering key — changes apply oldest-first per entity. */
  createdAt: number;
  state: OutboxState;
  attempts: number;
  /** Routing metadata, plaintext by design so the server can sync and isolate. */
  orgId: string;
  /** The row this change targets (distinct from the change's own id). */
  recordId: string;
  /** When the next retry becomes due; set by the backoff policy. */
  nextAttemptAt?: number;
  /** Why the last attempt failed — shown on the one-tap retry. */
  lastError?: string;
}

/** What the server returns for each pushed change. */
export interface PushAck {
  /** The change id, echoed. */
  id: string;
  status: "applied" | "conflict" | "rejected";
  /** The authoritative version after applying. */
  version?: number;
  /** On conflict, the server's current record so we can merge locally. */
  server?: RemoteRecord;
  reason?: string;
}

/** A record as it comes back from the server (pull, or a conflict response). */
export interface RemoteRecord {
  id: string;
  orgId: string;
  entity: EntityKind;
  payload: Envelope | null;
  version: number;
  updatedAt: string;
  /** Tombstone marker — a delete always beats a concurrent edit. */
  deletedAt?: string | null;
}

/** The local copy a merge is applied to. */
export interface LocalRecord {
  id: string;
  orgId: string;
  entity: EntityKind;
  payload: Envelope | null;
  version: number;
  updatedAt: string;
  deletedAt?: string | null;
}
