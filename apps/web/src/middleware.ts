import type { NextRequest } from "next/server";

import { updateSession } from "~/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the PWA's own files. Two of these
     * exclusions are load-bearing rather than cosmetic:
     *
     *  - sw.js: the service worker is fetched without cookies, so gating it
     *    would redirect it to /login and break offline entirely.
     *  - sqlite/: sqlite-wasm and its OPFS proxy worker are fetched by a Worker
     *    without credentials. Gating them returns a 307 to /login, the wasm
     *    never loads, and the local database silently fails to open.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|sqlite/|manifest.webmanifest|sw.js|swe-worker-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
