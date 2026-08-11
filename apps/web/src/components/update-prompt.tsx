"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Update ready" — the shopkeeper picks the moment, never the deploy.
 *
 * The desktop app is a window onto the hosted site, so shipping a web change
 * reaches every installed copy with no download and nothing to install. That is
 * a genuine advantage over a native competitor, where every fix is an installer
 * the shop has to be talked through. But it only stays an advantage if landing
 * a change never costs somebody a half-typed bill.
 *
 * So the new service worker waits (see sw.ts), and this is what asks. It is a
 * pill in the corner, not a modal: a modal in the middle of a sale is exactly
 * the interruption the whole design is avoiding. Ignore it and nothing happens —
 * the update applies on the next natural restart, which for a counter PC is
 * tomorrow morning.
 *
 * Nothing is lost either way. Invoices are written to local SQLite as they are
 * saved, not held in the page, so a reload after this prompt cannot drop a bill
 * that was already saved — and one that was not is still in the form, which is
 * precisely why the shopkeeper gets to say when.
 */

/** How often to ask the server whether anything new has shipped. */
const CHECK_EVERY_MS = 30 * 60 * 1000;

export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);
  const reloading = useRef(false);

  const offer = useCallback((sw: ServiceWorker | null) => {
    if (sw) setWaiting(sw);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    /**
     * A worker reaching `installed` while one is already controlling the page
     * means an update. Without a controller it is the very first install, which
     * is not something to interrupt anyone about.
     */
    const onControllerChange = () => {
      if (reloading.current) window.location.reload();
    };

    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg || cancelled) return;

        offer(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              offer(reg.waiting ?? installing);
            }
          });
        });

        // A counter PC can stay on one page for days. Poll, and check again
        // whenever the window is brought back to the front — the moment someone
        // returns to the app is the cheapest time to have already noticed.
        const check = () => void reg.update().catch(() => undefined);
        timer = setInterval(check, CHECK_EVERY_MS);
        window.addEventListener("focus", check);
      })
      .catch(() => undefined);

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, [offer]);

  if (!waiting) return null;

  function apply() {
    if (!waiting) return;
    setApplying(true);
    // The reload happens on controllerchange, once the new worker has actually
    // taken over. Reloading here instead would race it and could load the old
    // shell again, leaving the pill up and the shopkeeper tapping it twice.
    reloading.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  return (
    <div
      role="status"
      className="fixed bottom-20 right-4 z-40 flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-overlay md:bottom-4"
    >
      <div className="flex flex-col">
        <span className="text-body font-medium text-content">
          Update ready
        </span>
        <span className="text-caption normal-case text-content-muted">
          Finish what you are doing — it can wait.
        </span>
      </div>
      <button
        type="button"
        onClick={apply}
        disabled={applying}
        className="rounded-control bg-primary px-3 py-1.5 text-caption font-medium text-primary-content transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {applying ? "Updating…" : "Restart now"}
      </button>
      <button
        type="button"
        onClick={() => setWaiting(null)}
        aria-label="Dismiss"
        className="rounded-control px-2 py-1 text-caption text-content-muted hover:bg-canvas"
      >
        Later
      </button>
    </div>
  );
}
