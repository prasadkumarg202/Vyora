"use client";

import { Badge } from "@vyora/ui";
import { useEffect, useState } from "react";

import {
  requestSync,
  retrySync,
  startSync,
  subscribeSync,
  type SyncStatus,
} from "~/lib/sync/runner";

/**
 * Global sync pill — connectivity plus the live outbox state, on every screen.
 *
 * It starts the sync runner on mount and reflects what the outbox engine is
 * doing: Offline, Syncing…, N pending, N failed (one-tap retry) or Synced. Being
 * offline never blocks an action — this is signal, and the manual flush.
 */
export function SyncPill() {
  const [s, setS] = useState<SyncStatus>({ online: true, pending: 0, syncing: false, failed: 0 });

  useEffect(() => {
    const unsub = subscribeSync(setS);
    startSync();
    return unsub;
  }, []);

  let tone: "success" | "warning" | "danger" | "info" = "success";
  let text = "Synced";
  let onClick: (() => void) | undefined;

  if (!s.online) {
    tone = "warning";
    text = s.pending > 0 ? `Offline · ${s.pending} to sync` : "Offline";
  } else if (s.syncing) {
    tone = "info";
    text = "Syncing…";
  } else if (s.failed > 0) {
    tone = "danger";
    text = `${s.failed} failed · retry`;
    onClick = retrySync;
  } else if (s.pending > 0) {
    tone = "warning";
    text = `${s.pending} pending`;
    onClick = requestSync;
  }

  // The tooltip carries any error from the last pass, not only ones that
  // reached the failed state. A pass that timed out, or could not read the
  // local database, otherwise leaves the pill saying "Synced" — the app being
  // reassuring instead of honest.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-sync-state={!s.online ? "offline" : s.syncing ? "syncing" : s.failed ? "failed" : s.pending ? "pending" : "synced"}
      aria-live="polite"
      title={s.lastError ?? undefined}
      className="rounded-pill outline-none focus-visible:shadow-focus disabled:cursor-default"
    >
      <Badge tone={tone} dot>
        {text}
      </Badge>
    </button>
  );
}
