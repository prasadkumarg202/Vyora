import type { ChangeRecord, OutboxState } from "./types";

/**
 * The outbox state machine and its retry policy.
 *
 * Pure functions over a change record: given a record and an event, what is the
 * next record? Keeping the transitions here — rather than inline in the sync
 * loop — is what makes "never silently dropped" testable.
 */

/**
 * Exponential backoff: 2s, 4s, 8s ... capped at 5 minutes, per the spec.
 *
 * The cap matters more than the curve: without it, a change that failed
 * overnight would schedule its next attempt days out and the shop would open to
 * a queue that never drains.
 */
export const BASE_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 5 * 60_000;

/**
 * After this many attempts a change stops auto-retrying and surfaces as failed
 * with a one-tap retry. It is never dropped — the spec is explicit.
 */
export const MAX_ATTEMPTS = 8;

export function backoffMs(attempts: number): number {
  if (attempts <= 0) return BASE_DELAY_MS;
  // 2^n grows past Number.MAX_SAFE_INTEGER around n=52; clamp before shifting
  // so a corrupted attempts count cannot produce Infinity or a negative delay.
  const exponent = Math.min(attempts - 1, 30);
  return Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
}

/** A change is due when it is pending, or failed and past its backoff. */
export function isDue(change: ChangeRecord, now: number): boolean {
  if (change.state === "pending") return true;
  if (change.state !== "failed") return false;
  if (change.attempts >= MAX_ATTEMPTS) return false; // waits for a manual retry
  return (change.nextAttemptAt ?? 0) <= now;
}

/**
 * Collect step (01): pending envelopes, oldest first, bounded batch.
 *
 * Order is by createdAt across the whole batch, not per entity, because a
 * batch is applied in the order given: an invoice that references a product
 * created moments earlier must not overtake it.
 */
export function collect(
  changes: readonly ChangeRecord[],
  now: number,
  limit = 50,
): ChangeRecord[] {
  return changes
    .filter((c) => isDue(c, now))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function markSyncing(change: ChangeRecord): ChangeRecord {
  assertTransition(change.state, "syncing");
  return { ...change, state: "syncing" };
}

export function markSynced(change: ChangeRecord): ChangeRecord {
  assertTransition(change.state, "synced");
  // Clear the error: a record that succeeded must not keep showing why it once
  // failed.
  const { lastError: _drop, nextAttemptAt: _also, ...rest } = change;
  return { ...rest, state: "synced" };
}

/**
 * A failed attempt. Increments attempts and schedules the next try.
 *
 * Once MAX_ATTEMPTS is reached it stays failed with no nextAttemptAt: the user
 * gets a one-tap retry rather than the app quietly giving up.
 */
export function markFailed(
  change: ChangeRecord,
  error: string,
  now: number,
): ChangeRecord {
  assertTransition(change.state, "failed");
  const attempts = change.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  return {
    ...change,
    state: "failed",
    attempts,
    lastError: error,
    ...(exhausted ? {} : { nextAttemptAt: now + backoffMs(attempts) }),
  };
}

/** The one-tap retry: puts an exhausted change back in the queue. */
export function retryNow(change: ChangeRecord, now: number): ChangeRecord {
  return { ...change, state: "pending", nextAttemptAt: now };
}

/**
 * Synced records are pruned after acknowledgement, per the spec — the outbox is
 * a queue, not a log. The audit trail lives in audit_logs.
 */
export function prune(changes: readonly ChangeRecord[]): ChangeRecord[] {
  return changes.filter((c) => c.state !== "synced");
}

const ALLOWED: Record<OutboxState, readonly OutboxState[]> = {
  pending: ["syncing"],
  syncing: ["synced", "failed"],
  // A failed change re-enters the queue as pending (backoff or manual retry).
  failed: ["pending", "syncing"],
  // Terminal: a synced change is pruned, never revived.
  synced: [],
};

export function canTransition(from: OutboxState, to: OutboxState): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * Illegal transitions throw rather than being ignored.
 *
 * A silent no-op here would look like a stuck queue and be nearly impossible to
 * diagnose from a shop owner's bug report.
 */
function assertTransition(from: OutboxState, to: OutboxState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal outbox transition: ${from} -> ${to}`);
  }
}
