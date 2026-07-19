"use client";

import { type BusinessTypeConfig } from "@vyora/core";
import { Badge, Button, Card } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

import {
  listCustomers,
  listInvoices,
  listProducts,
  listPurchases,
} from "~/lib/db/repository";

/**
 * Administration (route: /administration) — devices, security posture and a
 * real data export, per the IA (permissions, devices, encryption keys, audit,
 * export). The offline-readiness panel (<OfflineCheck/>) sits below this in the
 * page, since a shop reporting "it lost my invoices" is a device/sync question.
 *
 * Export runs entirely on-device against the local ledger, so an owner can walk
 * away with their data at any time — the anti-lock-in promise, working offline.
 */

interface DeviceInfo {
  platform: string;
  agent: string;
  online: boolean;
}

export function AdministrationModule({
  orgId,
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const browser =
      /Edg\//.test(ua) ? "Edge" :
      /Chrome\//.test(ua) ? "Chrome" :
      /Firefox\//.test(ua) ? "Firefox" :
      /Safari\//.test(ua) ? "Safari" : "Browser";
    setDevice({
      platform: (navigator as { platform?: string }).platform ?? "Unknown",
      agent: browser,
      online: navigator.onLine,
    });
  }, []);

  const exportData = useCallback(async () => {
    setExporting(true);
    setNote(null);
    try {
      const [invoices, products, customers, purchases] = await Promise.all([
        listInvoices(orgId, 1000),
        listProducts(orgId, 1000),
        listCustomers(orgId, 1000),
        listPurchases(orgId, 1000),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        orgId,
        businessType: config?.businessType ?? null,
        counts: {
          invoices: invoices.length,
          products: products.length,
          customers: customers.length,
          purchases: purchases.length,
        },
        invoices,
        products,
        customers,
        purchases,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vyora-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNote(
        `Exported ${invoices.length} invoices, ${products.length} products, ${customers.length} customers, ${purchases.length} purchases.`,
      );
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setExporting(false);
    }
  }, [orgId, config]);

  const SECURITY: { label: string; ok: boolean; detail: string }[] = [
    { label: "Tenant isolation (RLS)", ok: true, detail: "Every row scoped to your org on the server." },
    { label: "Device-bound sessions", ok: true, detail: "Sign-in is tied to this device and its keys." },
    { label: "Local DB is origin-private", ok: true, detail: "OPFS storage no other site can read." },
    { label: "Zero-knowledge body encryption", ok: false, detail: "Record bodies encrypt on sync — rolling out per record type." },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Administration</h1>
          <p className="text-body text-content-muted">
            Devices, security and data export for this workspace.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* This device */}
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-h3">This device</h2>
            {device ? (
              <Badge tone={device.online ? "success" : "warning"} dot>
                {device.online ? "Online" : "Offline"}
              </Badge>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-y-2 text-body">
            <dt className="text-content-muted">Browser</dt>
            <dd className="text-right font-medium">{device?.agent ?? "…"}</dd>
            <dt className="text-content-muted">Platform</dt>
            <dd className="text-right font-medium">{device?.platform ?? "…"}</dd>
          </dl>
          <p className="text-caption normal-case text-content-muted">
            Registered devices, remote sign-out and encryption-key rotation are
            managed here as multi-device sync lands.
          </p>
        </Card>

        {/* Security posture */}
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-h3">Security</h2>
          <div className="flex flex-col divide-y divide-border">
            {SECURITY.map((s) => (
              <div key={s.label} className="flex items-start justify-between gap-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-body font-medium">{s.label}</span>
                  <span className="text-caption normal-case text-content-muted">{s.detail}</span>
                </div>
                <Badge tone={s.ok ? "success" : "warning"}>{s.ok ? "On" : "Rolling out"}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Data export */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-h3">Export your data</h2>
        <p className="text-body text-content-muted">
          Download everything on this device as JSON — invoices, products,
          customers and purchases. No lock-in: your books are yours, anytime,
          even offline.
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={exportData} disabled={exporting} data-testid="export-data">
            {exporting ? "Preparing…" : "Export workspace (JSON)"}
          </Button>
          {note ? <span className="text-caption normal-case text-content-muted">{note}</span> : null}
        </div>
      </Card>
    </div>
  );
}
