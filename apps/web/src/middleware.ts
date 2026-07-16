import type { NextRequest } from "next/server";

import { updateSession } from "~/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the PWA's own files. The service
     * worker in particular must not be redirected to /login — it is fetched
     * without cookies, so gating it would break offline entirely.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|swe-worker-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
