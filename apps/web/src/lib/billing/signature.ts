/**
 * HMAC-SHA256 verification for payment callbacks.
 *
 * Written against Web Crypto rather than node:crypto because this app also
 * runs on Cloudflare Workers via OpenNext, where node:crypto is not the
 * default runtime. Web Crypto exists in both.
 *
 * The comparison is constant-time. A `===` on the hex digest leaks, through
 * timing, how many leading characters an attacker got right — which is enough
 * to forge a signature one byte at a time. `crypto.subtle.verify` would also
 * do, but Razorpay hands us a hex string rather than raw bytes, so we compute
 * and compare ourselves.
 */

const encoder = new TextEncoder();

export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent, value-independent comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  // Compare the same number of bytes whatever the inputs, so a length
  // mismatch is not itself a timing signal.
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * True when `signature` is the HMAC of `body` under `secret`.
 *
 * Takes the raw request body as text: re-serialising parsed JSON changes key
 * order and whitespace, and the digest with it. Read the body once, verify it,
 * then parse.
 */
export async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await hmacSha256Hex(secret, body);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

/**
 * Razorpay's browser-callback signature: HMAC of `${orderId}|${paymentId}`.
 *
 * Verifying this proves the callback was not tampered with in the page — but
 * it does NOT prove the payment captured, because the browser can simply never
 * call back. It is a UX signal only; the webhook remains the authority.
 */
export async function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await hmacSha256Hex(secret, `${orderId}|${paymentId}`);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}
