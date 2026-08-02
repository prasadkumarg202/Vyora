"use client";

import { type BusinessTypeConfig } from "@vyora/core";
import { Badge, Button, Card, Input } from "@vyora/ui";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

/**
 * Help & Support (route: /support) — a 4-tier escalation support system.
 *
 * The design's support ladder, made real and self-serve: an instant AI chatbot,
 * then the data-aware AI Assistant, then a human virtual assistant (call /
 * video / screen-share), and finally an on-site technician. Each tier can hand
 * off to the next; a shop is never stuck. Human tiers connect over WhatsApp —
 * the channel Indian MSMEs actually use — with a reference number, and the
 * chatbot works offline.
 */

const SUPPORT_WHATSAPP = "918047100000";
const SUPPORT_INSTAGRAM = "vyora.app";
const SUPPORT_PHONE = "+91 80471 00000";

function waLink(text: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
const shortRef = () => "VS-" + crypto.randomUUID().slice(0, 6).toUpperCase();

type Tier = 1 | 2 | 3 | 4;
const TIERS: { id: Tier; icon: string; name: string; blurb: string }[] = [
  { id: 1, icon: "🤖", name: "AI Chatbot", blurb: "Instant answers, 24/7 · resolves ~68%" },
  { id: 2, icon: "✨", name: "AI Assistant", blurb: "Understands your books & guides you" },
  { id: 3, icon: "👩‍💻", name: "Virtual Assistant", blurb: "A human on call / video / screen-share" },
  { id: 4, icon: "🚚", name: "On-site Assistant", blurb: "A technician visits your shop" },
];

interface Msg { role: "user" | "bot"; text: string; }

const CHIPS = ["How do I bill?", "GST filing", "Sync stuck offline", "Printer setup", "Add a product"] as const;

export function SupportModule({ config }: { orgId: string; config: BusinessTypeConfig | null }) {
  const [tier, setTier] = useState<Tier>(1);
  const [resolved, setResolved] = useState(false);

  // Tier 1 chatbot
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "Hi! I'm the Vyora assistant. Ask me anything, or tap a topic. I work even offline. If I can't fix it, I'll get you a human." },
  ]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const answer = useMemo(() => makeSupportBot(), []);

  // Tier 3 / 4 forms
  const [vForm, setVForm] = useState({ phone: "", issue: "", when: "As soon as possible" });
  const [pForm, setPForm] = useState({ address: "", issue: "", slot: "Today" });
  const [ticket, setTicket] = useState<{ ref: string; kind: "call" | "visit" } | null>(null);

  function ask(qRaw: string) {
    const q = qRaw.trim();
    if (!q) return;
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "bot", text: answer(q) }]);
    setInput("");
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
  }

  function submitVirtual() {
    const ref = shortRef();
    setTicket({ ref, kind: "call" });
    window.open(
      waLink(`Support request ${ref} (Virtual assistant)\nIssue: ${vForm.issue || "—"}\nCall me: ${vForm.phone || "—"}\nWhen: ${vForm.when}`),
      "_blank",
      "noreferrer",
    );
  }
  function submitPhysical() {
    const ref = shortRef();
    setTicket({ ref, kind: "visit" });
    window.open(
      waLink(`On-site visit request ${ref}\nIssue: ${pForm.issue || "—"}\nAddress: ${pForm.address || "—"}\nSlot: ${pForm.slot}`),
      "_blank",
      "noreferrer",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Help &amp; Support</h1>
          <p className="text-body text-content-muted">
            Four levels of help, escalating automatically — from instant AI to a person at your shop.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {/* Quick human channels */}
      <div className="grid grid-cols-3 gap-3">
        <a href={waLink("Hi Vyora support, I need help.")} target="_blank" rel="noreferrer" className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-card transition hover:border-primary">
          <span className="text-2xl">💬</span><span className="text-body font-semibold">WhatsApp</span><span className="text-caption normal-case text-content-muted">Chat with us</span>
        </a>
        <a href={`https://ig.me/m/${SUPPORT_INSTAGRAM}`} target="_blank" rel="noreferrer" className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-card transition hover:border-primary">
          <span className="text-2xl">📸</span><span className="text-body font-semibold">Instagram</span><span className="text-caption normal-case text-content-muted">DM @{SUPPORT_INSTAGRAM}</span>
        </a>
        <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-card transition hover:border-primary">
          <span className="text-2xl">📞</span><span className="text-body font-semibold">Call</span><span className="text-caption normal-case text-content-muted">{SUPPORT_PHONE}</span>
        </a>
      </div>

      {/* Escalation ladder */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TIERS.map((t) => {
          const active = t.id === tier;
          const done = t.id < tier;
          return (
            <button key={t.id} onClick={() => { setTier(t.id); setResolved(false); setTicket(null); }}
              className="flex flex-col gap-1 rounded-card border p-4 text-left transition"
              style={{ borderColor: active ? "oklch(0.52 0.2 285)" : undefined, backgroundColor: active ? "oklch(0.96 0.03 285)" : undefined }}>
              <div className="flex items-center justify-between">
                <span className="text-2xl">{t.icon}</span>
                {done ? <Badge tone="success" dot>Tried</Badge> : active ? <Badge tone="primary">Level {t.id}</Badge> : <span className="text-caption text-content-muted">Level {t.id}</span>}
              </div>
              <span className="text-body font-semibold">{t.name}</span>
              <span className="text-caption normal-case text-content-muted">{t.blurb}</span>
            </button>
          );
        })}
      </div>

      {resolved ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-3xl">✅</span>
          <h2 className="text-h3">Glad that helped!</h2>
          <p className="text-body text-content-muted">Reopen support anytime — we escalate to a human whenever you need one.</p>
          <Button variant="outline" onClick={() => { setResolved(false); setTier(1); }}>Back to help</Button>
        </Card>
      ) : ticket ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-3xl">🎫</span>
          <h2 className="text-h3">Request {ticket.ref} created</h2>
          <p className="max-w-md text-body text-content-muted">
            {ticket.kind === "call"
              ? "A support specialist will call you shortly. We've opened WhatsApp so you can add anything else."
              : "We'll schedule a technician visit and confirm on WhatsApp. Keep your phone handy."}
          </p>
          <Button variant="outline" onClick={() => setTicket(null)}>Done</Button>
        </Card>
      ) : tier === 1 ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2"><h2 className="text-h3">AI Chatbot</h2><Badge tone="success" dot>Online · offline-ready</Badge></div>
          <div ref={listRef} className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <span className={"max-w-[80%] whitespace-pre-line rounded-card px-4 py-2.5 text-body " + (m.role === "user" ? "bg-primary text-white" : "border border-border bg-canvas")}>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => ask(c)} className="rounded-pill border border-border bg-surface px-3 py-1 text-caption text-content-muted hover:border-primary hover:text-primary">{c}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" />
            <Button type="submit" disabled={!input.trim()}>Ask</Button>
          </form>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-caption normal-case text-content-muted">Did this help?</span>
            <Button size="sm" variant="outline" onClick={() => setResolved(true)}>Yes, solved</Button>
            <Button size="sm" onClick={() => setTier(2)}>Still stuck → AI Assistant</Button>
            <button onClick={() => setTier(3)} className="ml-auto text-caption font-medium text-primary hover:underline">Talk to a human now →</button>
          </div>
        </Card>
      ) : tier === 2 ? (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-h3">AI Assistant</h2>
          <p className="text-body text-content-muted">
            The AI Assistant reads your own books — ask it “what are my sales today”, “who owes me money”, “what’s low on stock” — and it walks you through fixes step by step.
          </p>
          <div className="flex flex-col gap-2">
            <Guide title="Sync stuck / offline" steps="Check the pill at the top — if it says Offline, reconnect to internet; it syncs automatically. Still stuck? Administration → Export to back up, then reopen the app." />
            <Guide title="Printer / invoice not printing" steps="Open the invoice → Print / Save PDF → use your browser's print dialog and pick your printer or “Save as PDF”." />
            <Guide title="GST looks wrong" steps="Open GST to see the month's position, and Reports → GST for the invoice-wise breakup. Each item's rate drives the tax." />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Link href="/assistant" className="rounded-control bg-primary px-3 py-1.5 text-caption font-medium text-white">Open AI Assistant</Link>
            <Button size="sm" variant="outline" onClick={() => setResolved(true)}>This solved it</Button>
            <Button size="sm" onClick={() => setTier(3)}>Need a human → Virtual assistant</Button>
          </div>
        </Card>
      ) : tier === 3 ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2"><h2 className="text-h3">Virtual Assistant</h2><Badge tone="info">Human · 9am–9pm</Badge></div>
          <p className="text-body text-content-muted">A support specialist will call you and can screen-share to fix it with you live.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1"><label className="text-caption font-medium uppercase text-content-muted">Your phone</label><Input value={vForm.phone} onChange={(e) => setVForm({ ...vForm, phone: e.target.value.replace(/[^\d+]/g, "") })} className="font-mono" placeholder="Where should we call?" /></div>
            <div className="flex flex-col gap-1"><label className="text-caption font-medium uppercase text-content-muted">Preferred time</label>
              <select value={vForm.when} onChange={(e) => setVForm({ ...vForm, when: e.target.value })} className="min-h-touch rounded-input border border-border bg-surface px-3 text-body">
                <option>As soon as possible</option><option>Within an hour</option><option>This evening</option><option>Tomorrow morning</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1"><label className="text-caption font-medium uppercase text-content-muted">What&apos;s the issue?</label>
            <textarea value={vForm.issue} onChange={(e) => setVForm({ ...vForm, issue: e.target.value })} rows={2} className="rounded-input border border-border bg-surface px-3 py-2 text-body outline-none focus-visible:border-primary focus-visible:shadow-focus" placeholder="Briefly describe the problem" />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button onClick={submitVirtual}>Request a call</Button>
            <Button size="sm" variant="outline" onClick={() => setTier(4)}>Need someone in person → On-site</Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2"><h2 className="text-h3">On-site Assistant</h2><Badge tone="warning">Field · metro cities</Badge></div>
          <p className="text-body text-content-muted">For hardware, setup or training, a technician comes to your shop.</p>
          <div className="flex flex-col gap-1"><label className="text-caption font-medium uppercase text-content-muted">Shop address</label>
            <textarea value={pForm.address} onChange={(e) => setPForm({ ...pForm, address: e.target.value })} rows={2} className="rounded-input border border-border bg-surface px-3 py-2 text-body outline-none focus-visible:border-primary focus-visible:shadow-focus" placeholder="Where should we come?" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1"><label className="text-caption font-medium uppercase text-content-muted">What do you need?</label><Input value={pForm.issue} onChange={(e) => setPForm({ ...pForm, issue: e.target.value })} placeholder="e.g. barcode scanner setup" /></div>
            <div className="flex flex-col gap-1"><label className="text-caption font-medium uppercase text-content-muted">Slot</label>
              <select value={pForm.slot} onChange={(e) => setPForm({ ...pForm, slot: e.target.value })} className="min-h-touch rounded-input border border-border bg-surface px-3 text-body">
                <option>Today</option><option>Tomorrow</option><option>This week</option>
              </select>
            </div>
          </div>
          <div className="border-t border-border pt-3"><Button onClick={submitPhysical}>Book a visit</Button></div>
        </Card>
      )}
    </div>
  );
}

function Guide({ title, steps }: { title: string; steps: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen((v) => !v)} className="flex flex-col gap-1 rounded-control border border-border bg-canvas px-3 py-2 text-left">
      <span className="flex items-center justify-between text-body font-medium">{title}<span className="text-content-muted">{open ? "−" : "+"}</span></span>
      {open ? <span className="text-body text-content-muted">{steps}</span> : null}
    </button>
  );
}

/** On-device FAQ bot — keyword matched, works offline. */
function makeSupportBot(): (q: string) => string {
  return (qRaw: string) => {
    const q = qRaw.toLowerCase();
    const has = (...ws: string[]) => ws.some((w) => q.includes(w));
    if (has("bill", "invoice", "sell", "sale")) return "Open Sales, add a line (fields match your trade — a chemist gets Batch & Expiry), enter rate and quantity, then Save invoice. Or try Scan & Sell to bill by scanning barcodes. Works offline.";
    if (has("gst", "tax", "gstr", "filing")) return "GST is computed automatically from each item's rate. See your monthly position in GST, and invoice-wise detail in Reports → GST.";
    if (has("offline", "internet", "sync", "network", "stuck")) return "Everything works offline; records save on your device and sync when you reconnect. The pill up top shows sync status. If it's stuck, reconnect to internet — it catches up automatically.";
    if (has("printer", "print", "pdf")) return "Open the invoice → Print / Save PDF, then pick your printer or “Save as PDF” in the browser dialog.";
    if (has("product", "item", "stock", "inventory", "barcode")) return "Add items in Products (name, SKU/barcode, price, GST). Scan & Sell adds them by camera; Stock Radar flags slow-movers.";
    if (has("upi", "payment", "collect", "pay")) return "Set your UPI ID in Settings → Payments, and every invoice gets a Pay-via-UPI button and a scannable QR.";
    if (has("udhaar", "credit", "due", "owe", "reminder")) return "Credit Radar scores each customer and shows safe udhaar limits with one-tap WhatsApp reminders.";
    if (has("human", "person", "agent", "call")) return "Tap “Talk to a human now” below, or WhatsApp us above — we can call and screen-share.";
    if (has("hi", "hello", "help", "what can")) return "I can help with billing, GST, offline sync, printing, products, UPI and udhaar. Tap a topic, or escalate to a person anytime.";
    return "I can help with billing, GST, offline use, printing, products, UPI and udhaar. Try a topic below — or escalate to the AI Assistant or a human.";
  };
}
