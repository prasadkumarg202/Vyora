import { z } from "zod";

/**
 * Environment contract for the tenant PWA.
 *
 * Two rules from the spec drive the shape of this file:
 *   1. Secrets live in env only — never in the repo, never in the bundle.
 *   2. The encryption boundary means the client never needs a service-role key,
 *      so server-only names are kept out of anything prefixed NEXT_PUBLIC_.
 *
 * Anything NEXT_PUBLIC_* is inlined into JavaScript served to browsers and is
 * therefore public by definition. Only put values here that you would print on
 * a billboard.
 *
 * The Supabase values are optional until Phase 3 wires up Auth — nothing reads
 * them yet, so demanding them would only break builds for a dependency that
 * does not exist. Format is still enforced when a value *is* present: absent is
 * fine, malformed is not. Phase 3 drops the `.optional()`.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  /**
   * Razorpay's publishable key id. Public by design — it identifies the
   * merchant to the checkout widget and authorises nothing on its own.
   * Absent until KYC clears, which is why billing runs against the mock
   * provider by default.
   */
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().min(1).optional(),
});

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Bypasses RLS. Server-side only — must never reach a browser bundle.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // --- Billing (Phase 8) ---
  // Razorpay account credentials. Absent = the mock provider, which walks the
  // identical order -> checkout -> webhook path without moving money, so the
  // flow is finished and tested before KYC completes.
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  /**
   * Shared secret for webhook HMAC. Separate from the API secret because
   * Razorpay signs webhooks with it, and a leaked webhook secret must not also
   * grant API access.
   */
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
});

/**
 * Referenced explicitly rather than by index: Next.js statically replaces
 * `process.env.NEXT_PUBLIC_*` at build time, so dynamic lookups come back
 * undefined in the browser.
 */
const clientRuntime = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
};

function parse<T extends z.ZodType>(schema: T, input: unknown, scope: string) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid ${scope} environment variables:\n${issues}\n\n` +
        `See .env.example for the expected values.`,
    );
  }
  return result.data as z.infer<T>;
}

const isServer = typeof window === "undefined";

export const clientEnv = parse(clientSchema, clientRuntime, "client");

/**
 * Server-only env. Accessing this in the browser throws instead of silently
 * returning undefined, which is how service-role keys leak.
 */
export const serverEnv = isServer
  ? parse(serverSchema, process.env, "server")
  : (new Proxy({} as z.infer<typeof serverSchema>, {
      get(_target, prop) {
        throw new Error(
          `Attempted to read server env "${String(prop)}" from the browser. ` +
            `Server secrets must never cross the client boundary.`,
        );
      },
    }) as z.infer<typeof serverSchema>);
