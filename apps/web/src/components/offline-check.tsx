"use client";

import { Badge, Button, Card } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

import { all, isOfflineCapable, openDatabase, run } from "~/lib/db/client";

/**
 * Proves the on-device database actually works on THIS device.
 *
 * Not a toy: "is this browser offline-capable" is a real question with a real
 * answer that varies by browser, by hosting headers, and by private-browsing
 * mode. A shop owner whose device silently cannot persist would lose a day's
 * invoices, so the app checks rather than assumes.
 */

interface Probe {
  capable: boolean;
  crossOriginIsolated: boolean;
  schemaVersion?: number;
  rowCount?: number;
  error?: string;
}

export function OfflineCheck() {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setBusy(true);
    const base = {
      capable: isOfflineCapable(),
      crossOriginIsolated:
        typeof globalThis.crossOriginIsolated === "boolean"
          ? globalThis.crossOriginIsolated
          : false,
    };

    if (!base.capable) {
      setProbe({
        ...base,
        error:
          "This browser cannot store data offline here. It needs a secure context and cross-origin isolation.",
      });
      setBusy(false);
      return;
    }

    try {
      const { schemaVersion } = await openDatabase();
      // Write, then read back through SQL — the round-trip is the proof.
      const rows = await all<{ n: number }>(
        "SELECT COUNT(*) AS n FROM sync_state WHERE key LIKE 'probe:%'",
      );
      setProbe({ ...base, schemaVersion, rowCount: rows[0]?.n ?? 0 });
    } catch (err) {
      setProbe({ ...base, error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const writeProbe = async () => {
    setBusy(true);
    try {
      await run(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
        [`probe:${Date.now()}`, new Date().toISOString()],
      );
      await check();
    } catch (err) {
      setProbe((p) => ({ ...(p ?? { capable: true, crossOriginIsolated: true }), error: (err as Error).message }));
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="offline-check">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3">On-device database</h2>
        {probe ? (
          <Badge tone={probe.error ? "danger" : "success"} dot data-testid="offline-status">
            {probe.error ? "Unavailable" : "Ready"}
          </Badge>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-body">
        <dt className="text-content-muted">Cross-origin isolated</dt>
        <dd data-testid="coi">{String(probe?.crossOriginIsolated ?? "…")}</dd>

        <dt className="text-content-muted">OPFS + SharedArrayBuffer</dt>
        <dd data-testid="capable">{String(probe?.capable ?? "…")}</dd>

        <dt className="text-content-muted">Schema version</dt>
        <dd data-testid="schema-version">{probe?.schemaVersion ?? "—"}</dd>

        <dt className="text-content-muted">Rows written here</dt>
        <dd data-testid="row-count">{probe?.rowCount ?? "—"}</dd>
      </dl>

      {probe?.error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger" data-testid="offline-error">
          {probe.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button onClick={writeProbe} disabled={busy || !!probe?.error} data-testid="write-probe">
          Write a row
        </Button>
        <Button variant="outline" onClick={check} disabled={busy}>
          Re-check
        </Button>
      </div>

      <p className="text-caption normal-case text-content-muted">
        Rows written here survive a reload and a restart — that is the whole
        promise. If this says Unavailable, the device cannot bill offline.
      </p>
    </Card>
  );
}
