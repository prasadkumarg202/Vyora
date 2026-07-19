"use client";

import { type BusinessTypeConfig } from "@vyora/core";
import { Badge, Button, Card, Input } from "@vyora/ui";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

/**
 * Help & Support (route: /support) — the shop owner's help centre.
 *
 * Real reach-out is one tap: WhatsApp and Instagram open a pre-filled chat with
 * Vyora support (deep links, no backend needed), and the instant answers here
 * come from an on-device FAQ bot so a shopkeeper gets unblocked even offline.
 * "Raise a ticket" composes the message and hands it to WhatsApp — the channel
 * Indian MSMEs actually use — rather than an email nobody checks.
 */

// Vyora support handles — swap for the live numbers/handles.
const SUPPORT_WHATSAPP = "918047100000"; // country code + number, no +
const SUPPORT_INSTAGRAM = "vyora.app";
const SUPPORT_PHONE = "+91 80471 00000";
const SUPPORT_EMAIL = "support@vyora.app";

function waLink(text: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
function igLink(): string {
  return `https://ig.me/m/${SUPPORT_INSTAGRAM}`;
}

interface Msg {
  role: "user" | "bot";
  text: string;
}

const FAQ_CHIPS = [
  "How do I bill?",
  "GST filing",
  "Does it work offline?",
  "Add a product",
  "Export my data",
] as const;

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I create a bill?",
    a: "Open Sales and add a line — the fields already match your business type. Enter rate and quantity, then Save invoice. It saves on this device instantly, even with no internet.",
  },
  {
    q: "How does GST work?",
    a: "Vyora computes GST automatically from each item's rate. Your monthly position (output − input = payable) is in the GST screen, and you can review filing figures in Reports.",
  },
  {
    q: "Will it work without internet?",
    a: "Yes. Every record saves on your device first and syncs automatically when you reconnect. The status pill at the top shows whether you're synced.",
  },
  {
    q: "How do I add a product?",
    a: "Open Products, add name, SKU, HSN, price and GST%. It's immediately available in Sales, Inventory and Purchase.",
  },
  {
    q: "How do I get my data out?",
    a: "Administration → Export workspace (JSON) downloads everything — invoices, products, customers, purchases — anytime. Your books are always yours.",
  },
  {
    q: "How do I change my plan?",
    a: "Open Subscription to see your plan and usage, and to upgrade or manage billing.",
  },
];

export function SupportModule({
  config,
}: {
  orgId: string;
  config: BusinessTypeConfig | null;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "Hi! I'm the Vyora help bot. Ask me how to do something, or tap a topic below. Need a person? Use WhatsApp or Instagram above.",
    },
  ]);
  const [input, setInput] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [ticket, setTicket] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const answer = useMemo(() => makeSupportBot(), []);

  function ask(qRaw: string) {
    const q = qRaw.trim();
    if (!q) return;
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "bot", text: answer(q) }]);
    setInput("");
    requestAnimationFrame(() =>
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Help &amp; Support</h1>
          <p className="text-body text-content-muted">
            Instant answers, or chat with us on WhatsApp or Instagram. We&apos;re here 9am–9pm.
          </p>
        </div>
        {config ? <Badge tone="primary">{config.label}</Badge> : null}
      </div>

      {/* Channels */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ChannelCard
          href={waLink("Hi Vyora support, I need help with my account.")}
          title="WhatsApp"
          detail="Chat with a human"
          emoji="💬"
          bg="oklch(0.62 0.17 150)"
        />
        <ChannelCard
          href={igLink()}
          title="Instagram"
          detail="DM @vyora.app"
          emoji="📸"
          bg="oklch(0.55 0.2 20)"
        />
        <ChannelCard
          href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
          title="Call us"
          detail={SUPPORT_PHONE}
          emoji="📞"
          bg="oklch(0.55 0.2 285)"
        />
        <ChannelCard
          href={`mailto:${SUPPORT_EMAIL}`}
          title="Email"
          detail={SUPPORT_EMAIL}
          emoji="✉️"
          bg="oklch(0.5 0.02 285)"
        />
      </div>

      {/* Chatbot */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-h3">Help bot</h2>
          <Badge tone="success" dot>Online · offline-ready</Badge>
        </div>
        <div ref={listRef} className="flex max-h-72 flex-col gap-3 overflow-y-auto" data-testid="support-thread">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <span
                className={
                  "max-w-[80%] whitespace-pre-line rounded-card px-4 py-2.5 text-body " +
                  (m.role === "user"
                    ? "bg-primary text-white"
                    : "border border-border bg-canvas text-content")
                }
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {FAQ_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => ask(c)}
              className="rounded-pill border border-border bg-surface px-3 py-1 text-caption text-content-muted transition-colors hover:border-primary hover:text-primary"
            >
              {c}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" aria-label="Ask support" />
          <Button type="submit" disabled={input.trim().length === 0}>Ask</Button>
        </form>
        <p className="text-caption normal-case text-content-muted">
          Still stuck? <a className="text-primary hover:underline" href={waLink("Hi Vyora, the bot couldn't help — I need a person.")} target="_blank" rel="noreferrer">Talk to a human on WhatsApp →</a>
        </p>
      </Card>

      {/* FAQ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3">Frequently asked</h2>
        <Card className="flex flex-col divide-y divide-border p-0">
          {FAQS.map((f, i) => (
            <button
              key={i}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="flex flex-col gap-1 px-4 py-3 text-left"
            >
              <span className="flex items-center justify-between gap-3 text-body font-medium">
                {f.q}
                <span className="text-content-muted">{openFaq === i ? "−" : "+"}</span>
              </span>
              {openFaq === i ? (
                <span className="text-body text-content-muted">{f.a}</span>
              ) : null}
            </button>
          ))}
        </Card>
      </section>

      {/* Raise a ticket → WhatsApp */}
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-h3">Raise a ticket</h2>
        <p className="text-body text-content-muted">
          Describe the issue and send it straight to our team on WhatsApp or Instagram — the fastest way to reach us.
        </p>
        <textarea
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          rows={3}
          placeholder="What's going wrong? Include invoice numbers or steps if you can."
          className="rounded-input border border-border bg-surface px-3 py-2 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a
              href={waLink(`Support request from my ${config?.label ?? "Vyora"} shop:\n\n${ticket || "(describe issue)"}`)}
              target="_blank"
              rel="noreferrer"
            >
              Send on WhatsApp
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={igLink()} target="_blank" rel="noreferrer">Send on Instagram</a>
          </Button>
          <Link href="/assistant" className="text-body font-medium text-primary hover:underline">
            Or ask the AI Assistant →
          </Link>
        </div>
      </Card>
    </div>
  );
}

function ChannelCard({
  href,
  title,
  detail,
  emoji,
  bg,
}: {
  href: string;
  title: string;
  detail: string;
  emoji: string;
  bg: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 shadow-card transition hover:border-primary"
    >
      <span
        className="flex size-10 items-center justify-center rounded-control text-body-lg"
        style={{ backgroundColor: bg, color: "white" }}
      >
        {emoji}
      </span>
      <span className="text-body font-semibold">{title}</span>
      <span className="text-caption normal-case text-content-muted">{detail}</span>
    </a>
  );
}

/** On-device FAQ bot — keyword matched, so it works with no network. */
function makeSupportBot(): (q: string) => string {
  return (qRaw: string) => {
    const q = qRaw.toLowerCase();
    const has = (...ws: string[]) => ws.some((w) => q.includes(w));

    if (has("bill", "invoice", "sell", "sale")) {
      return "To bill: open Sales, add a line (the fields match your trade — a chemist gets Batch & Expiry), enter rate and quantity, then Save invoice. It saves on your device instantly, even offline.";
    }
    if (has("gst", "tax", "gstr", "filing")) {
      return "GST is computed automatically from each item's rate. See your monthly output − input = payable in the GST screen, and filing figures in Reports.";
    }
    if (has("offline", "internet", "sync", "network")) {
      return "Everything works offline. Records save on your device first and sync automatically when you reconnect — the pill at the top shows your sync status.";
    }
    if (has("product", "item", "catalog", "stock", "inventory")) {
      return "Open Products to add name, SKU, HSN, price and GST%. It's instantly usable in Sales, Inventory and Purchase. Stock levels live in Inventory.";
    }
    if (has("export", "download", "backup", "data")) {
      return "Administration → Export workspace (JSON) downloads all your data anytime. No lock-in — your books are yours.";
    }
    if (has("plan", "subscription", "upgrade", "pay", "price", "billing")) {
      return "Open Subscription to see your plan and usage, and to upgrade or manage billing.";
    }
    if (has("whatsapp", "call", "human", "person", "agent")) {
      return "Tap WhatsApp or Instagram at the top to reach a human, or call us 9am–9pm. For hardware/on-site setup we can arrange a visit in metro cities.";
    }
    if (has("hi", "hello", "help", "what can")) {
      return "I can help with billing, GST, offline sync, products, data export and plans. Tap a topic below, or reach a human on WhatsApp.";
    }
    return "I can help with billing, GST, offline use, products, data export and plans. Try a topic below — or tap WhatsApp to talk to a person.";
  };
}
