import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { clientEnv } from "~/env";

/**
 * Routes reachable without a session.
 *
 * Two of these are load-bearing rather than convenient:
 *   - /pricing: a shop comparing us against Vyapar must reach the price list
 *     without an account, and search engines have to be able to index it.
 *   - /api/billing/webhook: the payment gateway posts here with no cookies. A
 *     redirect to /login would be a non-2xx as far as Razorpay is concerned,
 *     so it would retry forever and no payment would ever be recorded. The
 *     route is not unprotected — it verifies an HMAC signature, which is
 *     stronger authentication than a session cookie.
 */
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/~offline",
  "/download",
  "/pricing",
  "/api/billing/webhook",
];

const isPublic = (pathname: string) =>
  // "/" is the public marketing landing page; the page itself sends
  // signed-in users on to /dashboard.
  pathname === "/" ||
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

/**
 * Refreshes the session on every request and gates the app.
 *
 * Two things must hold here:
 *   1. Never return a response that drops the refreshed auth cookies, or the
 *      user is silently signed out on the next navigation.
 *   2. Use getUser(), never getSession(). getSession() reads the cookie without
 *      verifying its signature — fine for optimistic UI, useless as a gate.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (
    !clientEnv.NEXT_PUBLIC_SUPABASE_URL ||
    !clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    // Unconfigured: let the request through so the app can render its own
    // "not configured" error rather than redirect-looping to /login.
    return response;
  }

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Come back here after signing in.
    if (pathname !== "/") {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
