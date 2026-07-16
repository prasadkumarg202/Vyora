"use client";

import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "~/env";

/**
 * Browser Supabase client.
 *
 * Uses the publishable key, which is safe to ship: RLS is the thing protecting
 * data, not the secrecy of this key. Never import the server client here.
 */
export function createClient() {
  if (
    !clientEnv.NEXT_PUBLIC_SUPABASE_URL ||
    !clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to apps/web/.env.local " +
        "and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
