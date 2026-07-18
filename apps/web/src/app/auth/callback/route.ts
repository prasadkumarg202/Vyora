import { NextResponse } from "next/server";

import { safeNext } from "~/lib/auth/safe-next";
import { createClient } from "~/lib/supabase/server";

/**
 * The magic-link landing point.
 *
 * sendOtp() passes `${origin}/auth/callback` as emailRedirectTo, so a user who
 * clicks the link in the email (rather than typing the code) arrives here with
 * a one-time `code` to exchange for a session.
 *
 * Every exit is a redirect to a first-party path — see safeNext() for why the
 * `next` param cannot be trusted with that.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const backToLogin = (message: string) => {
    const url = new URL("/login", origin);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url);
  };

  // Supabase reports a rejected or expired link with these, not with an
  // exchange failure, so they have to be read before looking for the code.
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  if (error || errorDescription) {
    return backToLogin(errorDescription ?? error ?? "Authentication failed.");
  }

  const code = searchParams.get("code");
  if (!code) {
    return backToLogin("No verification code was provided.");
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return backToLogin(exchangeError.message || "Could not verify that link.");
  }

  return NextResponse.redirect(
    new URL(safeNext(searchParams.get("next")), origin),
  );
}
