"use client";

import { Badge } from "@vyora/ui";
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
      className="rounded-pill outline-none focus-visible:shadow-focus"
    >
      <Badge tone={online ? "success" : "warning"} dot>
        {online ? "Synced" : "Offline"}
      </Badge>
    </button>
  );
}
