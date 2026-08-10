"use client";

import type { BusinessTypeConfig } from "@vyora/core";
import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  campaignTemplates,
  smsSegments,
  SMS_SEGMENT_CHARS,
  type CampaignTemplate,
} from "~/components/marketing/campaign-templates";
import {
  listCampaigns,
  markCampaignSent,
  saveCampaign,
  type CampaignRow,
} from "~/lib/db/repository";

/**
 * The Marketing module — a campaign builder, entirely on the local database.
 *
 * A campaign is drafted here (name, channel, message) and saved with status
 * 'draft'. "Mark sent" flips it to 'sent' as a local update — nothing is
 * actually delivered; the message send is the sync engine's and a provider's
 * job, deliberately out of scope. Both writes are dirty until flushed.
 */

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
] as const;

export function MarketingModule({
  orgId,
  userId,
  config,
}: {
  orgId: string;
  userId: string;
  config: BusinessTypeConfig | null;
}) {
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<string>("whatsapp");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Starters for this trade — the vertical's own first, then the universals. */
  const templates = useMemo(() => campaignTemplates(config), [config]);

  function applyTemplate(t: CampaignTemplate) {
    setName(t.name);
    setChannel(t.channel);
    setMessage(t.message);
    setError(null);
  }

  const refresh = useCallback(async () => {
    try {
      setCampaigns(await listCampaigns(orgId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    setSaving(true);
    setError(null);
    try {
      const msg = message.trim();
      await saveCampaign({
        id: crypto.randomUUID(),
        orgId,
        name: trimmed,
        channel,
        ...(msg ? { message: msg } : {}),
        createdBy: userId,
      });
      setName("");
      setMessage("");
      setChannel("whatsapp");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function markSent(id: string) {
    setBusy(id);
    setError(null);
    try {
      await markCampaignSent({ orgId, campaignId: id });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const canSave = name.trim() !== "" && !saving;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Marketing</h1>
        <p className="text-body text-content-muted">
          Build a campaign — it is saved on this device. Marking it sent is a
          local status change; no message is actually delivered.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3">Start from a template</h2>
          <p className="text-caption normal-case text-content-muted">
            Written for a {config?.label.toLowerCase() ?? "shop"}. Pick one, then
            edit it — {"{party}"} and {"{shop}"} fill in when it goes out.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="campaign-templates">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t)}
              title={t.intent}
              className="rounded-pill border border-border bg-surface px-3 py-1 text-caption text-content-muted transition-colors hover:border-primary hover:text-primary"
            >
              {t.title}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-name">Campaign name</Label>
          <Input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Diwali offer"
            data-testid="campaign-name"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="c-channel">Channel</Label>
          <select
            id="c-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            data-testid="campaign-channel"
            className="min-h-touch rounded-input border border-border bg-surface px-3 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="c-message">Message</Label>
          {/* A textarea, not a single-line box: these messages run to two or
              three sentences, and a shopkeeper editing one should be able to
              see the whole thing before it goes to a few hundred customers. */}
          <textarea
            id="c-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Pick a template above, or write your own."
            data-testid="campaign-message"
            className="rounded-input border border-border bg-surface px-3 py-2 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption normal-case text-content-muted">
              {message.length} characters
            </span>
            {/* SMS bills per segment, so the cost of one extra sentence is real
                money across a customer list. WhatsApp has no such cliff. */}
            {channel === "sms" && message.length > 0 ? (
              <span
                className={`text-caption normal-case ${
                  smsSegments(message) > 1 ? "text-warning" : "text-content-muted"
                }`}
              >
                {smsSegments(message)} SMS
                {smsSegments(message) > 1
                  ? ` — over ${SMS_SEGMENT_CHARS} characters, so each customer is billed twice`
                  : ""}
              </span>
            ) : null}
          </div>
        </div>

        <Button onClick={handleSave} disabled={!canSave} data-testid="save-campaign">
          {saving ? "Saving…" : "Save draft"}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Campaigns</h2>
        {campaigns === null ? (
          <p className="text-body text-content-muted">Loading…</p>
        ) : campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Draft a campaign above — it stays on this device until synced."
          />
        ) : (
          <Card className="divide-y divide-border p-0" data-testid="campaign-list">
            {campaigns.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid="campaign-row">
                <div className="flex flex-col gap-1">
                  <span className="text-body font-medium">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge tone="info">{channelLabel(c.channel)}</Badge>
                    <Badge tone={c.status === "sent" ? "success" : "neutral"} data-testid="campaign-status">
                      {c.status === "sent" ? "Sent" : "Draft"}
                    </Badge>
                    {c.dirty ? <Badge tone="warning" dot>Unsynced</Badge> : null}
                  </div>
                </div>
                {c.status === "draft" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === c.id}
                    onClick={() => markSent(c.id)}
                    data-testid="mark-sent"
                  >
                    {busy === c.id ? "…" : "Mark sent"}
                  </Button>
                ) : null}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function channelLabel(channel: string): string {
  return CHANNELS.find((c) => c.value === channel)?.label ?? channel;
}
