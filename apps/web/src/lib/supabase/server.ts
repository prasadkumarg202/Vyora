import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv, serverEnv } from "~/env";

/**
 * Server Supabase client, scoped to the caller's session.
 *
 * Still uses the publishable key — the user's JWT is what carries org_id, so
 * RLS applies exactly as it does in the browser. This is intentional: server
 * code gets no ambient authority just for being on the server.
 */
export async function createClient() {
  const cookieStore = await cookies();

  if (
    !clientEnv.NEXT_PUBLIC_SUPABASE_URL ||
    !clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error("Supabase is not configured. See apps/web/.env.local.");
  }

  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Safe to ignore: middleware
            // refreshes the session on every request, so the write it drops
            // here has already happened there.
          }
        },
      },
    },
  );
}

/**
 * Admin client. Bypasses RLS entirely — no tenant isolation, no policies.
 *
 * Only for operations a tenant genuinely cannot perform on itself, e.g. reading
 * a user's auth record during sign-in before any membership exists. Every call
 * site must scope by org_id by hand, because the database will not do it for
 * you here.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never run in the browser.");
  }

  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set; admin operations are unavailable.",
    );
  }

  return createServerClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
