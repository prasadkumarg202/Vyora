"use client";

import { type BusinessTypeConfig } from "@vyora/core";
import { Badge, Button, Card, Input } from "@vyora/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getSetting,
  listCustomers,
  saveCampaign,
  type CustomerRow,
} from "~/lib/db/repository";

/**
 * Mass Campaigns (route: /promotions) — a Vyora Edge feature, opt-in per shop.
 *
 * Mass marketing is off until the owner enables it in Settings → Marketing
 * channels, so businesses that don't need it never see it. When on, it shows
 * only the channels switched on — WhatsApp, SMS, Google Ads — with festival and
 * per-trade templates, an AI writer, and one-tap send. Per-recipient send works
 * today via wa.me / sms: links; bulk auto-send and Ads publishing activate once
 * the credentials in Settings are filled.
 */

type Cat = "festival" | "offer" | "trade";
interface Template { id: string; name: string; emoji: string; cat: Cat; trades?: string[]; msg: string }

const FESTIVALS: Template[] = [
  { id: "diwali", name: "Diwali", emoji: "🪔", cat: "festival", msg: "🪔 Happy Diwali from {shop}! ✨\nLight up the festival with {offer}.\nVisit us today — limited time!" },
  { id: "dussehra", name: "Dussehra", emoji: "🏹", cat: "festival", msg: "🏹 Shubh Dussehra from {shop}!\nCelebrate with {offer}.\nGrab yours before stocks run out!" },
  { id: "holi", name: "Holi", emoji: "🎨", cat: "festival", msg: "🎨 Happy Holi from {shop}! 🌈\nAdd colour to your celebrations with {offer}.\nVisit us this week!" },
  { id: "eid", name: "Eid", emoji: "🌙", cat: "festival", msg: "🌙 Eid Mubarak from {shop}!\nCelebrate with {offer}.\nOrder or visit today!" },
  { id: "pongal", name: "Pongal / Sankranti", emoji: "🌾", cat: "festival", msg: "🌾 Happy Pongal from {shop}!\nHarvest the savings with {offer}.\nVisit us to celebrate!" },
  { id: "newyear", name: "New Year", emoji: "🎆", cat: "festival", msg: "🎆 Happy New Year from {shop}!\nStart the year with {offer}.\nVisit us this week!" },
];
const OFFERS: Template[] = [
  { id: "sale", name: "Discount sale", emoji: "🏷️", cat: "offer", msg: "🏷️ Big sale at {shop}!\n{offer} — limited time.\nVisit before it ends!" },
  { id: "newarrival", name: "New arrivals", emoji: "🆕", cat: "offer", msg: "🆕 New arrivals at {shop}!\n{offer}. Be the first to grab them.\nVisit today!" },
  { id: "restock", name: "Back in stock", emoji: "📦", cat: "offer", msg: "📦 Back in stock at {shop}!\n{offer}. Order now!" },
  { id: "loyalty", name: "Thank you", emoji: "💛", cat: "offer", msg: "💛 Thank you for shopping with {shop}!\nEnjoy {offer} as a valued customer.\nSee you soon!" },
  { id: "weekend", name: "Weekend special", emoji: "🎉", cat: "offer", msg: "🎉 Weekend special at {shop}!\n{offer} — this weekend only.\nVisit us!" },
];
const TRADE: Template[] = [
  { id: "rx-refill", name: "Refill reminder", emoji: "💊", cat: "trade", trades: ["pharmacy", "medical"], msg: "💊 {shop} refill reminder!\nRunning low on medicines? {offer}.\nReply to reserve or visit." },
  { id: "food-weekend", name: "Weekend menu", emoji: "🍽️", cat: "trade", trades: ["restaurant", "catering", "hotel"], msg: "🍽️ This weekend at {shop}!\n{offer}. Dine-in or order on WhatsApp.\nBook your table!" },
  { id: "jwl-festive", name: "Festive gold", emoji: "💍", cat: "trade", trades: ["jewellery"], msg: "💍 Festive collection at {shop}!\n{offer} on making charges.\nVisit for new designs." },
  { id: "grocery-combo", name: "Monthly combo", emoji: "🛒", cat: "trade", trades: ["grocery", "kirana"], msg: "🛒 {shop} monthly combo!\n{offer} on groceries.\nOrder on WhatsApp — home delivery." },
  { id: "mobile-launch", name: "New launch", emoji: "📱", cat: "trade", trades: ["mobile", "electronics"], msg: "📱 New launch at {shop}!\n{offer} + easy EMI.\nVisit for a demo." },
  { id: "garment-season", name: "Season sale", emoji: "👗", cat: "trade", trades: ["garments"], msg: "👗 Season sale at {shop}!\n{offer} on the new collection.\nVisit this week!" },
];

type Channel = "whatsapp" | "sms" | "ads";

export function PromotionsModule({ orgId, config }: { orgId: string; config: BusinessTypeConfig | null }) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [chOn, setChOn] = useState<Record<Channel, boolean>>({ whatsapp: false, sms: false, ads: false });
  const [channel, setChannel] = useState<Channel>("whatsapp");

  const [tab, setTab] = useState<Cat>("festival");
  const [templateId, setTemplateId] = useState<string>(FESTIVALS[0]!.id);
  const [offer, setOffer] = useState("20% off");
  const [message, setMessage] = useState("");
  const [shop, setShop] = useState("our shop");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiBusy, setAiBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [en, wa, sms, ads, name] = await Promise.all([
        getSetting("mk_enabled"), getSetting("mk_wa"), getSetting("mk_sms"), getSetting("mk_ads"), getSetting("shop_name"),
      ]);
      setEnabled(en === "1");
      const on = { whatsapp: wa === "1", sms: sms === "1", ads: ads === "1" };
      setChOn(on);
      setChannel(on.whatsapp ? "whatsapp" : on.sms ? "sms" : on.ads ? "ads" : "whatsapp");
      setShop(name || config?.label || "our shop");
      try { setCustomers(await listCustomers(orgId, 1000)); } catch { /* ok */ }
      setReady(true);
    })();
  }, [orgId, config]);

  const tradeTemplates = useMemo(() => TRADE.filter((t) => !config || (t.trades ?? []).includes(config.businessType)), [config]);
  const list = tab === "festival" ? FESTIVALS : tab === "offer" ? OFFERS : tradeTemplates;
  const template = useMemo(() => [...FESTIVALS, ...OFFERS, ...TRADE].find((t) => t.id === templateId) ?? FESTIVALS[0]!, [templateId]);
  const compose = useCallback((t: Template) => t.msg.replaceAll("{shop}", shop).replaceAll("{offer}", offer.trim() || "special offers"), [shop, offer]);
  useEffect(() => { if (channel !== "ads") setMessage(compose(template)); }, [template, compose, channel]);

  async function generateAI() {
    setAiBusy(true); setError(null);
    try {
      const res = await fetch("/api/promo", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ business: config?.label ?? "shop", occasion: template.name, offer, shop, language: "English + Hindi", channel }),
      });
      if (res.ok) { const { text } = (await res.json()) as { text?: string }; if (text) setMessage(text); }
      else { const d = (await res.json().catch(() => ({}))) as { error?: string }; setError(d.error || "AI unavailable — using the template."); }
    } catch { setError("AI unavailable — using the template."); }
    finally { setAiBusy(false); }
  }

  const withPhone = customers.filter((c) => c.phone);
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSel = withPhone.length > 0 && withPhone.every((c) => selected.has(c.id));
  function toast(m: string) { setFlash(m); window.setTimeout(() => setFlash(null), 2600); }

  function send(c: CustomerRow) {
    const phone = c.phone?.replace(/\D/g, ""); if (!phone) return;
    const enc = encodeURIComponent(message);
    const url = channel === "sms" ? `sms:${phone}?body=${enc}` : `https://wa.me/91${phone}?text=${enc}`;
    window.open(url, "_blank", "noreferrer");
  }
  async function copyMsg() { try { await navigator.clipboard.writeText(message); toast("Copied"); } catch { /* ignore */ } }
  async function saveRec() {
    try { await saveCampaign({ id: crypto.randomUUID(), orgId, name: `${template.emoji} ${template.name} · ${channel}`, channel, message }); toast("Saved to campaigns"); }
    catch (err) { setError((err as Error).message); }
  }

  if (!ready) return <p className="p-6 text-body text-content-muted">Loading…</p>;

  if (!enabled) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h1">Mass Campaigns</h1>
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="text-3xl">📣</span>
          <h2 className="text-h3">Mass marketing is off</h2>
          <p className="max-w-md text-body text-content-muted">
            Not every shop needs bulk campaigns. Turn it on and pick your channels (WhatsApp, SMS, Google Ads) in Settings.
          </p>
          <Link href="/settings" className="rounded-control bg-primary px-4 py-2 text-body font-medium text-white">Enable in Settings</Link>
        </Card>
      </div>
    );
  }

  const CHANNELS: { id: Channel; label: string; emoji: string }[] = [
    { id: "whatsapp", label: "WhatsApp", emoji: "💬" },
    { id: "sms", label: "SMS", emoji: "✉️" },
    { id: "ads", label: "Google Ads", emoji: "🔎" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Mass Campaigns</h1>
          <p className="text-body text-content-muted">Festival & offer templates, an AI writer, and send over your enabled channels.</p>
        </div>
        <Badge tone="primary">Vyora Edge</Badge>
      </div>

      {/* Channel selector */}
      <div className="flex flex-wrap gap-2">
        {CHANNELS.map((c) => {
          const active = c.id === channel;
          const isOn = chOn[c.id];
          return (
            <button key={c.id} onClick={() => isOn && setChannel(c.id)} disabled={!isOn}
              className="flex items-center gap-2 rounded-card border px-4 py-2 text-body"
              style={{ borderColor: active ? "oklch(0.52 0.2 285)" : undefined, backgroundColor: active ? "oklch(0.96 0.03 285)" : undefined, opacity: isOn ? 1 : 0.5 }}>
              <span>{c.emoji}</span>{c.label}
              {isOn ? (active ? <Badge tone="primary">Active</Badge> : null) : <Badge tone="neutral">Off</Badge>}
            </button>
          );
        })}
        <Link href="/settings" className="self-center text-caption font-medium text-primary hover:underline">Manage channels →</Link>
      </div>

      {flash ? <div className="rounded-control border border-success-border bg-success-tonal px-3 py-2 text-body text-success">{flash}</div> : null}
      {error ? <p className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Compose */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex gap-1 border-b border-border">
            {([["festival", "Festivals"], ["offer", "Offers"], ["trade", `Your ${config?.label ?? "trade"}`]] as [Cat, string][]).map(([id, label]) => (
              <button key={id} onClick={() => { setTab(id); const f = (id === "festival" ? FESTIVALS : id === "offer" ? OFFERS : tradeTemplates)[0]; if (f) setTemplateId(f.id); }}
                className="-mb-px border-b-2 px-3 py-2 text-body"
                style={{ borderColor: tab === id ? "oklch(0.52 0.2 285)" : "transparent", color: tab === id ? "oklch(0.52 0.2 285)" : "inherit", fontWeight: tab === id ? 600 : 400 }}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {list.map((t) => (
              <button key={t.id} onClick={() => setTemplateId(t.id)} className="rounded-pill border px-3 py-1 text-caption"
                style={{ borderColor: t.id === templateId ? "transparent" : "oklch(0.9 0.01 285)", backgroundColor: t.id === templateId ? "oklch(0.93 0.05 285)" : "transparent", color: t.id === templateId ? "oklch(0.42 0.16 285)" : "inherit", fontWeight: t.id === templateId ? 600 : 400 }}>{t.emoji} {t.name}</button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-caption font-medium uppercase text-content-muted">Your offer</label>
            <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. 20% off, buy 1 get 1" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-caption font-medium uppercase text-content-muted">{channel === "ads" ? "Ad copy" : "Message"}</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={channel === "ads" ? 3 : 5}
              className="rounded-input border border-border bg-surface px-3 py-2 text-body outline-none focus-visible:border-primary focus-visible:shadow-focus"
              placeholder={channel === "ads" ? "Tap “Write with AI” for a Google Ads headline + description" : ""} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void generateAI()} disabled={aiBusy}>{aiBusy ? "Writing…" : "✨ Write with AI"}</Button>
            <Button variant="outline" size="sm" onClick={() => void copyMsg()}>Copy</Button>
            <Button variant="outline" size="sm" onClick={() => void saveRec()}>Save campaign</Button>
          </div>
        </Card>

        {/* Right: audience or ads */}
        {channel === "ads" ? (
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Google Ads</h2>
            <p className="text-body text-content-muted">AI drafts your search-ad headline and description. Copy it into Google Ads to publish.</p>
            <div className="rounded-card border border-border bg-canvas p-3">
              <div className="whitespace-pre-line rounded-card bg-white px-3 py-2 text-body text-black shadow-card">{message || "Your ad copy will appear here."}</div>
            </div>
            <div className="flex gap-2">
              <a href="https://ads.google.com/" target="_blank" rel="noreferrer" className="rounded-control bg-primary px-3 py-1.5 text-caption font-medium text-white">Open Google Ads</a>
              <Button size="sm" variant="outline" onClick={() => void copyMsg()}>Copy ad</Button>
            </div>
            <p className="text-caption normal-case text-content-muted">Auto-publishing needs your Ads account connected in Settings.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-caption font-medium uppercase text-content-muted">{channel === "sms" ? "SMS preview" : "WhatsApp preview"}</span>
              <div className="rounded-card border border-border p-3" style={{ backgroundColor: channel === "sms" ? "oklch(0.96 0.02 250)" : "oklch(0.96 0.03 150)" }}>
                <div className="whitespace-pre-line rounded-card bg-white px-3 py-2 text-body text-black shadow-card">{message}</div>
              </div>
            </div>
            <Card className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-h3">Send to customers</h2>
                <span className="text-caption normal-case text-content-muted">{selected.size} selected · {withPhone.length} contactable</span>
              </div>
              {withPhone.length === 0 ? (
                <p className="text-body text-content-muted">Add customers with phone numbers to send campaigns.</p>
              ) : (
                <>
                  <button onClick={() => setSelected(allSel ? new Set() : new Set(withPhone.map((c) => c.id)))} className="self-start text-caption font-medium text-primary hover:underline">{allSel ? "Clear all" : "Select all"}</button>
                  <div className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
                    {withPhone.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 py-2">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} className="h-4 w-4 accent-primary" />
                          <span className="text-body">{c.name}</span>
                          <span className="font-mono text-caption text-content-muted">{c.phone}</span>
                        </label>
                        <button onClick={() => send(c)} className="text-caption font-medium text-primary hover:underline">Send →</button>
                      </div>
                    ))}
                  </div>
                  <p className="text-caption normal-case text-content-muted">
                    Tap “Send →” to message each customer{channel === "sms" ? " from your SMS app" : " on WhatsApp"}. Bulk auto-send activates once you add your {channel === "sms" ? "SMS provider key" : "WhatsApp Cloud API token"} in Settings.
                  </p>
                </>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
