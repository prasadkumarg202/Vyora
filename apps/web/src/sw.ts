/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time by @serwist/next.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  /**
   * The new worker waits. It does NOT take over a running tab.
   *
   * This was `skipWaiting: true`, reasoning that a stale shell strands users on
   * old schema assumptions after a sync-engine change. The concern is real; the
   * cure was worse. Activating immediately leaves a page running the *old*
   * JavaScript while fetches start resolving against the *new* precache, and the
   * first lazy-loaded chunk that no longer exists fails with "Failed to fetch
   * dynamically imported module".
   *
   * For a shopkeeper that lands mid-invoice, with a customer at the counter, as
   * the app simply breaking. Every deploy was a chance to do that to somebody.
   *
   * So the new worker sits in `waiting` until the page asks for it. The page
   * shows a quiet "Update ready" pill and applies it when the shopkeeper taps —
   * which is never in the middle of a bill, because they are the one choosing.
   * See components/update-prompt.tsx.
   */
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

/**
 * The page's way of saying "now is a good moment".
 *
 * Without this the waiting worker would sit there until every tab closed, which
 * for an app someone leaves open all day means never. The shopkeeper taps the
 * pill, this fires, the worker activates and the page reloads on
 * `controllerchange`.
 */
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

serwist.addEventListeners();
