import type { Envelope, KeyBytes } from "./types";

/**
 * AES-256-GCM via WebCrypto. Available in browsers, workers and Node >= 20, so
 * the same code encrypts on a phone and in a test.
 *
 * No key ever leaves this module as raw bytes once imported: importKey with
 * extractable = false means even a compromised caller cannot read it back out.
 */

/** 96 bits — the GCM-recommended IV size. Anything else weakens the mode. */
const IV_BYTES = 12;
const KEY_BITS = 256;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * A fresh random IV for every single encryption.
 *
 * GCM fails catastrophically on IV reuse under the same key: two records sharing
 * an IV leak the XOR of their plaintexts and allow forgery. So IVs are always
 * random per record and never derived from anything caller-controlled.
 */
function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

/** A random 256-bit key. This is how a DEK is born. */
export function randomKeyBytes(): KeyBytes {
  return crypto.getRandomValues(new Uint8Array(KEY_BITS / 8)) as KeyBytes;
}

async function importAesKey(
  raw: KeyBytes,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  if (raw.length !== KEY_BITS / 8) {
    throw new Error(
      `AES-256 needs a ${KEY_BITS / 8}-byte key; got ${raw.length}`,
    );
  }
  // extractable: false — the key cannot be exported back to bytes.
  return crypto.subtle.importKey(
    "raw",
    // A copy: importKey does not clone, and callers zero their buffers.
    raw.slice() as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    usages,
  );
}

/**
 * Encrypt bytes under a key.
 *
 * `aad` is authenticated but not encrypted — pass the routing metadata so the
 * server cannot re-point a record at another tenant without the tag failing.
 */
export async function encryptBytes(
  key: KeyBytes,
  plaintext: Uint8Array,
  aad?: string,
): Promise<Envelope> {
  const cryptoKey = await importAesKey(key, ["encrypt"]);
  const iv = randomIv();

  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
      ...(aad ? { additionalData: enc.encode(aad) as unknown as BufferSource } : {}),
    },
    cryptoKey,
    plaintext as unknown as BufferSource,
  );

  return {
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
    ...(aad ? { aad } : {}),
  };
}

/**
 * Decrypt an envelope.
 *
 * Throws on a bad key, a tampered ciphertext, or mismatched AAD — GCM cannot
 * tell those apart, and neither should the error, since distinguishing them
 * would be an oracle.
 */
export async function decryptBytes(
  key: KeyBytes,
  envelope: Envelope,
): Promise<Uint8Array> {
  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${String(envelope.v)}`);
  }
  const cryptoKey = await importAesKey(key, ["decrypt"]);

  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(envelope.iv) as unknown as BufferSource,
        ...(envelope.aad
          ? { additionalData: enc.encode(envelope.aad) as unknown as BufferSource }
          : {}),
      },
      cryptoKey,
      fromBase64(envelope.ct) as unknown as BufferSource,
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error("Decryption failed: wrong key, or the data was altered.");
  }
}

/** Encrypt a JSON-serialisable record body. */
export async function encryptJson(
  key: KeyBytes,
  value: unknown,
  aad?: string,
): Promise<Envelope> {
  return encryptBytes(key, enc.encode(JSON.stringify(value)), aad);
}

/** Decrypt a record body back to JSON. */
export async function decryptJson<T>(
  key: KeyBytes,
  envelope: Envelope,
): Promise<T> {
  return JSON.parse(dec.decode(await decryptBytes(key, envelope))) as T;
}

/**
 * Best-effort wipe of key material.
 *
 * JavaScript cannot guarantee this — the GC may have copied the buffer already —
 * so it narrows the window rather than closing it. Real protection comes from
 * the key being non-extractable and short-lived.
 */
export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}
