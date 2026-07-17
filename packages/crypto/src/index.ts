/**
 * @vyora/crypto — the zero-knowledge boundary.
 *
 * Business data is encrypted on the device with a key the server never holds.
 * Everything that crosses the wire goes through encryptRecord/decryptRecord, so
 * the line between "routing metadata" and "business data" is drawn once, here,
 * rather than at every call site.
 */
export {
  encryptBytes,
  decryptBytes,
  encryptJson,
  decryptJson,
  randomKeyBytes,
  toBase64,
  fromBase64,
  wipe,
} from "./aes";

export {
  DEFAULT_ARGON2_PARAMS,
  createWrappedDek,
  deriveKek,
  generateRecoveryCode,
  isValidRecoveryCode,
  normaliseRecoveryCode,
  randomSalt,
  rewrapDek,
  unwrapDek,
  unwrapDekWithRecoveryCode,
  wrapDekWithRecoveryCode,
} from "./keys";

export {
  assertNoPlaintextLeak,
  decryptRecord,
  encryptRecord,
  type EncryptedRecord,
} from "./record";

export type {
  Argon2idParams,
  Envelope,
  KeyBytes,
  RoutingMetadata,
  WrappedDek,
} from "./types";
