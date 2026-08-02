"use client";

import { Badge, Button, Card, EmptyState, Input, Label } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

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

export function MarketingModule({ orgId, userId }: { orgId: string; userId: string }) {
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<string>("whatsapp");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <Input
            id="c-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Flat 20% off this weekend!"
            data-testid="campaign-message"
          />
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
