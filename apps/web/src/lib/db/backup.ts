"use client";

import { SYNCED_TABLES } from "@vyora/db";

import { all, batch } from "./client";
import { ready } from "./repository";

/**
 * Backup and restore — the whole shop, in one file.
 *
 * Cloud sync is the safety net, but a shopkeeper on a ₹6,000 phone with patchy
 * data deserves a copy they can hold: a file on their own machine, readable
 * without us, restorable without a login. That is what this writes.
 *
 * The format is deliberately boring — plain JSON, one array per table, with a
 * version stamp — so it can be opened, inspected, and if it ever came to it,
 * imported somewhere else entirely. No lock-in worth the name has a proprietary
 * backup format.
 */

const BACKUP_VERSION = 1;

export interface BackupFile {
  vyora: number;
  createdAt: string;
  orgId: string;
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Read every synced table for this org into one object. */
export async function createBackup(orgId: string): Promise<BackupFile> {
  await ready();
  const tables: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};

  for (const table of SYNCED_TABLES) {
    // Table names come from our own constant, never from user input.
    const rows = await all<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE org_id = ?`,
      [orgId],
    );
    tables[table] = rows;
    counts[table] = rows.length;
  }

  return {
    vyora: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    orgId,
    counts,
    tables,
  };
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vyora-backup-${backup.createdAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface RestoreResult {
  restored: Record<string, number>;
  skipped: string[];
}

/**
 * Restore a backup into this device.
 *
 * Rows are inserted with INSERT OR IGNORE and marked dirty, so restoring twice
 * cannot duplicate anything and everything restored still flows to the cloud.
 * Existing rows are left alone: a restore adds back what was lost, it does not
 * overwrite what is here — the destructive version of this is a different
 * button, and one we should make people ask for explicitly.
 */
export async function restoreBackup(
  orgId: string,
  file: BackupFile,
): Promise<RestoreResult> {
  await ready();
  if (file.vyora !== BACKUP_VERSION) {
    throw new Error(
      `This backup was written by a different version of Vyora (v${file.vyora}). Update the app and try again.`,
    );
  }

  const restored: Record<string, number> = {};
  const skipped: string[] = [];

  for (const table of SYNCED_TABLES) {
    const rows = file.tables[table];
    if (!rows || rows.length === 0) continue;

    // Columns come from the backup, so restore what this build understands and
    // say plainly what it skipped rather than failing the whole file.
    const known = await all<{ name: string }>(`PRAGMA table_info(${table})`);
    const columns = new Set(known.map((c) => c.name));
    const first = rows[0]!;
    const useable = Object.keys(first).filter((c) => columns.has(c));
    const dropped = Object.keys(first).filter((c) => !columns.has(c));
    if (dropped.length > 0) skipped.push(`${table}: ${dropped.join(", ")}`);
    if (useable.length === 0) continue;

    const placeholders = useable.map(() => "?").join(",");
    await batch(
      rows.map((row) => ({
        sql: `INSERT OR IGNORE INTO ${table} (${useable.join(",")}) VALUES (${placeholders})`,
        params: useable.map((c) => {
          // Force every restored row into this org and mark it for sync.
          if (c === "org_id") return orgId;
          if (c === "dirty") return 1;
          const v = row[c];
          return v === undefined ? null : (v as string | number | null);
        }),
      })),
    );
    restored[table] = rows.length;
  }

  return { restored, skipped };
}

/** Parse and sanity-check a file the user picked. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("That file is not a Vyora backup — it is not valid JSON.");
  }
  const backup = parsed as BackupFile;
  if (!backup || typeof backup !== "object" || !backup.tables || !backup.vyora) {
    throw new Error("That file is not a Vyora backup.");
  }
  return backup;
}
