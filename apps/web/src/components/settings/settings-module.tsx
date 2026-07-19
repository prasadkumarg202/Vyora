"use client";

import {
  resolveFields,
  type BusinessTypeConfig,
} from "@vyora/core";
import { Badge, Card } from "@vyora/ui";

/**
 * Settings (route: /settings) — the workspace's business profile and the
 * configuration its whole behaviour is derived from.
 *
 * Vyora is metadata-driven, so "settings" is mostly the business type chosen at
 * onboarding: it decides the fields every form captures, the GST posture, the
 * invoice template and the reports. Showing it here makes that contract visible
 * and auditable. Editable profile fields (name, GSTIN, address) sync through the
 * same offline outbox as every record once the settings store lands.
 */

export function SettingsModule({
  config,
  supplierStateCode,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
  supplierStateCode: string;
}) {
  const fields = config ? resolveFields(config) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Settings</h1>
          <p className="text-body text-content-muted">
            Your workspace profile and the business-type configuration that drives every form.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {config ? (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-h3">Business type</h2>
            <div className="grid grid-cols-2 gap-y-3 text-body sm:grid-cols-4">
              <Field label="Trade" value={config.label} />
              <Field label="Sector" value={config.sector} />
              <Field label="GST default" value={config.gst.defaultLabel} />
              <Field label="Invoice" value={config.invoice.template} />
              <Field label="Place of supply (state code)" value={supplierStateCode} />
              <Field label="Reports" value={`${config.reports.length} for your trade`} />
            </div>
            <p className="text-caption normal-case text-content-muted">
              Changing your business type re-shapes every screen. It&apos;s set at
              onboarding; contact support to switch trades on an active workspace.
            </p>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Fields your {config.label} captures</h2>
            <p className="text-body text-content-muted">
              These are declared by your business type and appear across Sales,
              invoices and reports — no two trades bill the same way.
            </p>
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <span
                  key={f.key}
                  className="flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1 text-caption"
                >
                  {f.label}
                  {f.required ? (
                    <span className="text-danger" title="Required">*</span>
                  ) : null}
                  <span className="text-content-muted">· {f.type}</span>
                </span>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Invoice template</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{config.invoice.template}</Badge>
              {config.invoice.extras.map((x) => (
                <Badge key={x} tone="info">{x}</Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {config.invoice.columns.map((c) => (
                <span key={c} className="rounded-control border border-border bg-canvas px-2.5 py-1 text-caption text-content-muted">
                  {c}
                </span>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-5">
          <p className="text-body text-content-muted">
            No business type on this workspace yet. Finish onboarding to configure your trade.
          </p>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption font-medium uppercase text-content-muted">{label}</span>
      <span className="text-body font-medium">{value}</span>
    </div>
  );
}
