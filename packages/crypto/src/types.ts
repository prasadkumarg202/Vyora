/**
 * The key hierarchy from design/Vyora Security Architecture.dc.html.
 *
 *   passphrase / 24-word recovery code   (never stored, never transmitted)
 *        |  Argon2id KDF, per-org salt
 *        v
 *   KEK — key-encryption key             (derived in memory on unlock, discarded on lock)
 *        |  unwraps
 *        v
 *   DEK — random 256-bit data key        (encrypts all records; stored only wrapped)
 *
 * The server holds the wrapped DEK and can never unwrap it. "No passphrase, no
 * data" is the designed behaviour, not a limitation to work around.
 */

/** Raw 256-bit key material. Nothing outside this package should hold one. */
export type KeyBytes = Uint8Array & { readonly __brand: "KeyBytes" };

/** AES-256-GCM ciphertext plus everything needed to decrypt it (except a key). */
export interface Envelope {
  /** Schema version, so a future format change can be detected, not guessed. */
  v: 1;
  /** Per-record IV. Never reused under the same key — see randomIv(). */
  iv: string;
  /** Ciphertext with the GCM tag appended, base64. */
  ct: string;
  /**
   * Additional authenticated data: not encrypted, but tamper-evident. Routing
   * metadata lives here so the server can sync and isolate without reading
   * content, and cannot silently re-point a record at another tenant.
   */
  aad?: string;
}

/** The DEK as the server stores it: encrypted under the KEK. */
export interface WrappedDek {
  v: 1;
  /** Argon2id parameters, stored so a future cost bump stays backward-readable. */
  kdf: Argon2idParams;
  /** The wrapped DEK envelope (AES-256-GCM under the KEK). */
  envelope: Envelope;
}

/**
 * Argon2id cost parameters.
 *
 * Persisted per wrapped key rather than hardcoded: raising the cost later must
 * not lock existing users out of their own data, so every wrapped DEK carries
 * the parameters it was created with.
 */
export interface Argon2idParams {
  /** Per-org salt, base64. Not secret; must be unique per org. */
  salt: string;
  /** Memory in KiB. */
  memoryKib: number;
  /** Iterations (time cost). */
  iterations: number;
  /** Lanes / threads. */
  parallelism: number;
}

/** Routing metadata that stays plaintext, per the spec's encryption boundary. */
export interface RoutingMetadata {
  id: string;
  orgId: string;
  updatedAt: string;
  version: number;
}
