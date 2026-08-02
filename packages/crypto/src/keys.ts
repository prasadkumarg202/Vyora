import { argon2id } from "hash-wasm";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
// bip39 v2 exports wordlists only with the explicit .js subpath.
import { wordlist } from "@scure/bip39/wordlists/english.js";

import {
  decryptBytes,
  encryptBytes,
  fromBase64,
  randomKeyBytes,
  toBase64,
  wipe,
} from "./aes";
import type { Argon2idParams, KeyBytes, WrappedDek } from "./types";

/**
 * The KEK -> DEK hierarchy.
 *
 * The passphrase never leaves the device and is never stored. It derives a KEK
 * in memory, the KEK unwraps the DEK, and the DEK decrypts records. The server
 * holds only the wrapped DEK, which is useless without the passphrase.
 */

/**
 * Argon2id defaults.
 *
 * OWASP's baseline is 19 MiB / t=2 / p=1. These run in a browser on a low-end
 * Indian Android phone — the target device — so memory is the dial we can least
 * afford to push: 64 MiB would swap or fail there. Cost is stored per wrapped
 * key, so raising this later cannot lock anyone out of existing data.
 */
export const DEFAULT_ARGON2_PARAMS: Omit<Argon2idParams, "salt"> = {
  memoryKib: 19 * 1024,
  iterations: 2,
  parallelism: 1,
};

const SALT_BYTES = 16;
const KEY_BYTES = 32;

/** A per-org salt. Not secret, but must be unique — reuse links orgs' KEKs. */
export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * Derive the KEK from a human secret.
 *
 * Deliberately slow: this is the only thing standing between a stolen wrapped
 * DEK and the plaintext, so the cost is the security.
 */
export async function deriveKek(
  passphrase: string,
  params: Argon2idParams,
): Promise<KeyBytes> {
  if (!passphrase) throw new Error("A passphrase is required.");

  const hex = await argon2id({
    password: passphrase,
    salt: fromBase64(params.salt),
    memorySize: params.memoryKib,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: KEY_BYTES,
    outputType: "hex",
  });

  const out = new Uint8Array(KEY_BYTES);
  for (let i = 0; i < KEY_BYTES; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out as KeyBytes;
}

/**
 * Create a brand-new DEK and wrap it under a passphrase.
 *
 * Returns the DEK for immediate use and the wrapped form for the server. The
 * caller must wipe() the DEK when locking.
 */
export async function createWrappedDek(
  passphrase: string,
  overrides?: Partial<Omit<Argon2idParams, "salt">>,
): Promise<{ dek: KeyBytes; wrapped: WrappedDek }> {
  const params: Argon2idParams = {
    salt: randomSalt(),
    ...DEFAULT_ARGON2_PARAMS,
    ...overrides,
  };

  const dek = randomKeyBytes();
  const kek = await deriveKek(passphrase, params);
  try {
    // AAD binds the wrapped key to its own KDF parameters: an attacker cannot
    // swap in cheaper params to make a brute force easier without the tag
    // failing.
    const envelope = await encryptBytes(kek, dek, JSON.stringify(params));
    return { dek, wrapped: { v: 1, kdf: params, envelope } };
  } finally {
    wipe(kek);
  }
}

/**
 * Unwrap the DEK — the "unlock key" step of the login flow.
 *
 * A wrong passphrase surfaces as a failed GCM tag, so this throws rather than
 * returning a useless key.
 */
export async function unwrapDek(
  passphrase: string,
  wrapped: WrappedDek,
): Promise<KeyBytes> {
  if (wrapped.v !== 1) {
    throw new Error(`Unsupported wrapped-key version: ${String(wrapped.v)}`);
  }
  const kek = await deriveKek(passphrase, wrapped.kdf);
  try {
    const dek = await decryptBytes(kek, wrapped.envelope);
    if (dek.length !== KEY_BYTES) {
      throw new Error("Unwrapped key is the wrong size.");
    }
    return dek as KeyBytes;
  } catch {
    // Deliberately does not distinguish "wrong passphrase" from "tampered
    // blob": telling them apart would help an attacker more than the user.
    throw new Error("Could not unlock: wrong passphrase or recovery code.");
  } finally {
    wipe(kek);
  }
}

/**
 * Re-wrap an existing DEK under a new passphrase.
 *
 * Changing a passphrase must not change the DEK — every record already
 * encrypted under it would become unreadable.
 */
export async function rewrapDek(
  dek: KeyBytes,
  newPassphrase: string,
  overrides?: Partial<Omit<Argon2idParams, "salt">>,
): Promise<WrappedDek> {
  const params: Argon2idParams = {
    salt: randomSalt(),
    ...DEFAULT_ARGON2_PARAMS,
    ...overrides,
  };
  const kek = await deriveKek(newPassphrase, params);
  try {
    const envelope = await encryptBytes(kek, dek, JSON.stringify(params));
    return { v: 1, kdf: params, envelope };
  } finally {
    wipe(kek);
  }
}

/**
 * The 24-word recovery code — the only way back in without the passphrase.
 *
 * BIP39 with a 256-bit entropy gives 24 words and a checksum, so a mistyped
 * word is caught before it becomes "your data is gone". This is the second
 * secret the spec allows; there is no third, and no reset.
 */
export function generateRecoveryCode(): string {
  return generateMnemonic(wordlist, 256);
}

export function isValidRecoveryCode(code: string): boolean {
  return validateMnemonic(normaliseRecoveryCode(code), wordlist);
}

/** Users retype these by hand: tolerate case and stray whitespace, not typos. */
export function normaliseRecoveryCode(code: string): string {
  return code.trim().toLowerCase().split(/\s+/).join(" ");
}

/**
 * Wrap a DEK under a recovery code as a second, independent unlock path.
 *
 * The seed goes through Argon2id like any passphrase rather than being used
 * directly: it keeps one derivation path for every secret, so a bug can only
 * exist in one place.
 */
export async function wrapDekWithRecoveryCode(
  dek: KeyBytes,
  recoveryCode: string,
): Promise<WrappedDek> {
  const code = normaliseRecoveryCode(recoveryCode);
  if (!isValidRecoveryCode(code)) {
    throw new Error("That is not a valid 24-word recovery code.");
  }
  return rewrapDek(dek, toBase64(mnemonicToSeedSync(code)));
}

export async function unwrapDekWithRecoveryCode(
  recoveryCode: string,
  wrapped: WrappedDek,
): Promise<KeyBytes> {
  const code = normaliseRecoveryCode(recoveryCode);
  if (!isValidRecoveryCode(code)) {
    throw new Error("That is not a valid 24-word recovery code.");
  }
  return unwrapDek(toBase64(mnemonicToSeedSync(code)), wrapped);
}
