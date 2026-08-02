"use client";

import { Badge, Button, Card, Input } from "@vyora/ui";
import { useEffect, useState, type ReactNode } from "react";

import { getSetting, setSetting } from "~/lib/db/repository";

/**
 * Marketing channels — opt-in mass-campaign settings (Settings screen).
 *
 * Mass marketing is off by default; a shop that doesn't need it never sees it.
 * When enabled, the owner turns on the channels they use — WhatsApp, SMS,
 * Google Ads — and drops in the credentials each needs. Stored on-device. The
 * Promotions studio reads these to show only the channels that are switched on.
 */

const KEYS = [
  "mk_enabled",
  "mk_wa", "mk_wa_bulk", "mk_wa_token", "mk_wa_phone",
  "mk_sms", "mk_sms_provider", "mk_sms_sender", "mk_sms_key",
  "mk_ads", "mk_ads_customer",
] as const;
type Key = (typeof KEYS)[number];

export function MarketingChannels() {
  const [v, setV] = useState<Record<Key, string>>(() => Object.fromEntries(KEYS.map((k) => [k, ""])) as Record<Key, string>);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const entries = await Promise.all(KEYS.map(async (k) => [k, (await getSetting(k)) ?? ""] as const));
      const next = Object.fromEntries(entries) as Record<Key, string>;
      if (!next.mk_wa) next.mk_wa = "1"; // WhatsApp per-customer on by default once enabled
      setV(next);
    })();
  }, []);

  const on = (k: Key) => v[k] === "1";
  const set = (k: Key, val: string) => setV((s) => ({ ...s, [k]: val }));
  const toggle = (k: Key) => set(k, on(k) ? "0" : "1");

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await Promise.all(KEYS.map((k) => setSetting(k, v[k] ?? "")));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3">Marketing channels</h2>
          <p className="text-body text-content-muted">
            Turn on mass campaigns only if your business needs them. Choose the channels you use.
          </p>
        </div>
        <Switch on={on("mk_enabled")} onClick={() => toggle("mk_enabled")} />
      </div>

      {on("mk_enabled") ? (
        <div className="flex flex-col gap-3">
          {/* WhatsApp */}
          <Channel label="WhatsApp" on={on("mk_wa")} onToggle={() => toggle("mk_wa")} note="Send to each customer via a wa.me link — works today, no setup.">
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={on("mk_wa_bulk")} onChange={() => toggle("mk_wa_bulk")} />
              Bulk auto-send via WhatsApp Cloud API
            </label>
            {on("mk_wa_bulk") ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={v.mk_wa_phone} onChange={(e) => set("mk_wa_phone", e.target.value)} placeholder="WhatsApp phone number ID" className="font-mono" />
                <Input value={v.mk_wa_token} onChange={(e) => set("mk_wa_token", e.target.value)} placeholder="Cloud API access token" className="font-mono" />
              </div>
            ) : null}
          </Channel>

          {/* SMS */}
          <Channel label="SMS" on={on("mk_sms")} onToggle={() => toggle("mk_sms")} note="Send from your phone's messaging app, or connect a bulk SMS provider.">
            {on("mk_sms") ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <Input value={v.mk_sms_provider} onChange={(e) => set("mk_sms_provider", e.target.value)} placeholder="Provider (e.g. Fast2SMS)" />
                <Input value={v.mk_sms_sender} onChange={(e) => set("mk_sms_sender", e.target.value)} placeholder="Sender ID (6 chars)" className="font-mono uppercase" />
                <Input value={v.mk_sms_key} onChange={(e) => set("mk_sms_key", e.target.value)} placeholder="API key" className="font-mono" />
              </div>
            ) : null}
          </Channel>

          {/* Google Ads */}
          <Channel label="Google Ads" on={on("mk_ads")} onToggle={() => toggle("mk_ads")} note="AI writes the ad copy; connect your Ads account to publish.">
            {on("mk_ads") ? (
              <Input value={v.mk_ads_customer} onChange={(e) => set("mk_ads_customer", e.target.value)} placeholder="Google Ads customer ID (xxx-xxx-xxxx)" className="font-mono" />
            ) : null}
          </Channel>
        </div>
      ) : (
        <p className="text-caption normal-case text-content-muted">Mass marketing is off. Turn it on above to send festival & offer campaigns.</p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy} className="self-start">{busy ? "Saving…" : "Save"}</Button>
        {saved ? <span className="text-caption normal-case text-success">Saved.</span> : null}
      </div>
    </Card>
  );
}

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={onClick} className="relative h-6 w-11 shrink-0 rounded-pill transition-colors"
      style={{ backgroundColor: on ? "oklch(0.55 0.2 285)" : "oklch(0.85 0.01 285)" }}>
      <span className="absolute top-0.5 size-5 rounded-pill bg-white transition-all" style={{ left: on ? "22px" : "2px" }} />
    </button>
  );
}

function Channel({ label, on, onToggle, note, children }: { label: string; on: boolean; onToggle: () => void; note: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-canvas p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium">{label}</span>
          {on ? <Badge tone="success" dot>On</Badge> : <Badge tone="neutral">Off</Badge>}
        </div>
        <Switch on={on} onClick={onToggle} />
      </div>
      <p className="text-caption normal-case text-content-muted">{note}</p>
      {on ? children : null}
    </div>
  );
}
