"use client";

import { Badge, Button, Card } from "@vyora/ui";
import { useRef, useState } from "react";

import {
  createBackup,
  downloadBackup,
  readBackupFile,
  restoreBackup,
  type BackupFile,
} from "~/lib/db/backup";

/**
 * Backup & restore.
 *
 * Sync keeps a copy in the cloud; this makes a copy the shop owns outright — a
 * plain JSON file on their own computer, openable without us. That matters most
 * for exactly the people this app is for: a phone that gets lost or wiped, on a
 * connection that was never reliable enough to trust sync alone.
 *
 * Restoring adds back what is missing and never overwrites what is here, so
 * clicking it twice is safe.
 */
export function BackupPanel({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function makeBackup() {
    setBusy("backup");
    setError(null);
    setMessage(null);
    try {
      const backup = await createBackup(orgId);
      const total = Object.values(backup.counts).reduce((a, b) => a + b, 0);
      downloadBackup(backup);
      setMessage(`Saved ${total.toLocaleString("en-IN")} records to your downloads.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pickFile(file: File) {
    setError(null);
    setMessage(null);
    try {
      setPending(await readBackupFile(file));
    } catch (err) {
      setError((err as Error).message);
      setPending(null);
    }
  }

  async function doRestore() {
    if (!pending) return;
    setBusy("restore");
    setError(null);
    try {
      const result = await restoreBackup(orgId, pending);
      const total = Object.values(result.restored).reduce((a, b) => a + b, 0);
      setMessage(
        `Restored ${total.toLocaleString("en-IN")} records. Anything already here was left untouched.`,
      );
      setPending(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">Backup &amp; restore</h2>
        <p className="text-body text-content-muted">
          Keep a copy of everything on your own computer — a plain file you can
          open, store anywhere, and bring back on any device.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-body text-success">{message}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-card border border-border bg-canvas p-4">
          <span className="text-2xl">💾</span>
          <h3 className="text-body-lg font-semibold">Save a backup</h3>
          <p className="text-body text-content-muted">
            Everything — bills, parties, stock, payments, accounts — in one file.
          </p>
          <Button className="mt-auto self-start" onClick={makeBackup} disabled={busy !== null}>
            {busy === "backup" ? "Preparing…" : "Download backup"}
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-card border border-border bg-canvas p-4">
          <span className="text-2xl">↩️</span>
          <h3 className="text-body-lg font-semibold">Restore from a backup</h3>
          <p className="text-body text-content-muted">
            Adds back anything missing. Records already on this device are left
            exactly as they are.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickFile(f);
            }}
            className="min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body file:mr-3 file:rounded-control file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white"
          />
          {pending ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">
                  {Object.values(pending.counts ?? {}).reduce((a, b) => a + b, 0)} records
                </Badge>
                <span className="text-caption normal-case text-content-muted">
                  from {pending.createdAt.slice(0, 10)}
                </span>
              </div>
              <Button className="self-start" onClick={doRestore} disabled={busy !== null}>
                {busy === "restore" ? "Restoring…" : "Restore this backup"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <p className="text-caption normal-case text-content-muted">
        Restored records sync to the cloud like any other, so a device you bring
        back joins the rest automatically.
      </p>
    </Card>
  );
}
