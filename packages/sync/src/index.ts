/**
 * @vyora/sync — the offline outbox and conflict resolution.
 *
 * Every write commits locally first; sync is a background concern that catches
 * up. The queue holds AES-256 ciphertext, so business data is encrypted before
 * it ever enters the outbox, let alone the network.
 *
 * The engine is pure: these functions decide what happens, and the host
 * performs the I/O. That is what makes "two counters sell the last unit" a unit
 * test instead of a field report.
 */
export {
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

export {
  mergeCounter,
  mergeFields,
  resolve,
  strategyFor,
  type Resolution,
  type Strategy,
} from "./conflict";

export type {
  ChangeOp,
  ChangeRecord,
  EntityKind,
  LocalRecord,
  OutboxState,
  PushAck,
  RemoteRecord,
} from "./types";
