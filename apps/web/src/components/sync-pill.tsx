"use client";

import { useEffect, useState } from "react";

/**
 * Global connectivity pill — the spec requires it on every app screen.
 *
 * For now it reflects connectivity only. Phase 6 wires it to the outbox so it
 * can report pending/syncing/failed counts and act as the manual flush
 * trigger. Being offline never blocks an action; this is signal, not a gate.
 */
export function SyncPill() {
  // Assume online for the server render, then correct on mount. Rendering
  // "Offline" first would flash the wrong state for every online user.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <button
      type="button"
      data-sync-state={online ? "synced" : "offline"}
      aria-live="polite"
      className={
        "inline-flex min-h-touch items-center gap-2 rounded-pill border px-3 " +
        "text-caption transition-colors " +
        (online
          ? "border-success/30 bg-success/10 text-success"
          : "border-warning/40 bg-warning/15 text-warning")
      }
    >
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-pill " +
          (online ? "bg-success" : "bg-warning")
        }
      />
      {online ? "Synced" : "Offline"}
    </button>
  );
}
