import { decryptJson, encryptJson } from "./aes";
import type { Envelope, KeyBytes, RoutingMetadata } from "./types";

/**
 * The encryption boundary, as one function each way.
 *
 * The spec draws a hard line: `id`, `org_id`, `updated_at` and `version` stay
 * plaintext so the system can sync and isolate; everything else — customer,
 * line items, amounts, GSTIN, notes — is ciphertext the server cannot read.
 *
 * Callers go through here rather than calling encryptJson directly, so the line
 * is drawn in one place instead of at every call site.
 */

/** What actually goes over the wire and into Postgres. */
export interface EncryptedRecord extends RoutingMetadata {
  /** The encrypted body. Opaque to the server, by design. */
  bodyEnc: Envelope;
}

/**
 * Routing metadata is bound into the AAD.
 *
 * Without this, ciphertext is portable: a server (or anyone with database
 * access) could move an encrypted body to another id or another org_id and the
 * client would decrypt it happily. Authenticating the routing fields means any
 * such move fails the GCM tag.
 */
function routingAad(meta: RoutingMetadata): string {
  return JSON.stringify({
    id: meta.id,
    orgId: meta.orgId,
    updatedAt: meta.updatedAt,
    version: meta.version,
  });
}

export async function encryptRecord<T>(
  dek: KeyBytes,
  meta: RoutingMetadata,
  body: T,
): Promise<EncryptedRecord> {
  return { ...meta, bodyEnc: await encryptJson(dek, body, routingAad(meta)) };
}

/**
 * Decrypt a record body.
 *
 * Throws if the routing metadata does not match what was sealed in — i.e. if
 * the record has been moved or rewritten.
 */
export async function decryptRecord<T>(
  dek: KeyBytes,
  record: EncryptedRecord,
): Promise<T> {
  const { bodyEnc, ...meta } = record;
  const expected = routingAad(meta);

  if (bodyEnc.aad !== undefined && bodyEnc.aad !== expected) {
    throw new Error(
      "Record metadata does not match its sealed body — it may have been moved or altered.",
    );
  }
  return decryptJson<T>(dek, bodyEnc);
}

/**
 * Guard for the encryption boundary.
 *
 * The rule is easy to state and easy to break by accident: a helpful `customer`
 * or `total` column added to a sync payload silently un-encrypts it. Sync
 * asserts this before anything leaves the device.
 */
const ALLOWED_PLAINTEXT_KEYS = new Set([
  "id",
  "orgId",
  "org_id",
  "updatedAt",
  "updated_at",
  "version",
  "bodyEnc",
  "body_enc",
  // Outbox routing — describes the change, not the business data.
  "entity",
  "op",
  "baseVersion",
  "base_version",
  "createdAt",
  "created_at",
  "state",
  "attempts",
  "payload",
  "deletedAt",
  "deleted_at",
]);

export function assertNoPlaintextLeak(payload: object, context = "payload"): void {
  const leaked = Object.keys(payload).filter(
    (k) => !ALLOWED_PLAINTEXT_KEYS.has(k),
  );
  if (leaked.length > 0) {
    throw new Error(
      `${context} would send business data in plaintext: ${leaked.join(", ")}. ` +
        `Only routing metadata may leave the device unencrypted.`,
    );
  }
}
