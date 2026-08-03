"use client";

import { formatPaise, type Paise } from "@vyora/core";
import { Badge, Button, Card, EmptyState } from "@vyora/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DateRangePicker, resolvePreset, type DateRange } from "~/components/common/date-range";
import {
  expensesSummary,
  getSetting,
  listOverdueInvoices,
  listProducts,
  reportsSummary,
  salesByProduct,
  type OverdueInvoiceRow,
  type ProductRow,
  type ProductSales,
  type ReportsSummary,
} from "~/lib/db/repository";

/**
 * Growth Studio — what to do next, argued from the shop's own numbers.
 *
 * Every figure here is computed on-device from invoices, stock movements and
 * payments the shop already has, so the briefing is exact and works with no
 * internet. The AI layer sits on top and only ever *narrates* those numbers —
 * it is handed a compact summary and asked to explain and prioritise, never to
 * invent a figure. With no key configured, or offline, a rule-based briefing
 * takes its place, so this screen is never empty.
 */

type Tab = "pulse" | "storefront" | "listing";

const TABS: { key: Tab; label: string; blurb: string }[] = [
  { key: "pulse", label: "Business pulse", blurb: "How the shop is doing, what moved, and the three things worth doing this week." },
  { key: "storefront", label: "Share catalogue", blurb: "Send your price list to customers on WhatsApp — no website needed." },
  { key: "listing", label: "Get found online", blurb: "A ready-to-paste business description and a checklist for your Google listing." },
];

const DAY = 86_400_000;
const daysSince = (ymd: string | null): number =>
  ymd ? Math.floor((Date.now() - new Date(`${ymd}T00:00:00`).getTime()) / DAY) : Infinity;

interface Pulse {
  summary: ReportsSummary;
  previous: ReportsSummary;
  expenses: number;
  movers: { name: string; qty: number }[];
  dead: { name: string; onHand: number; days: number }[];
  low: ProductRow[];
  overdue: OverdueInvoiceRow[];
}

export function GrowthModule({ orgId }: { orgId: string }) {
  const [tab, setTab] = useState<Tab>("pulse");
  const [range, setRange] = useState<DateRange>(() => resolvePreset("thisMonth"));
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [shopName, setShopName] = useState("");
  const [narrative, setNarrative] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Same span, immediately before the chosen one — the only fair comparison. */
  const previousRange = useMemo(() => {
    const from = new Date(`${range.from}T00:00:00`);
    const to = new Date(`${range.to}T00:00:00`);
    const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY) + 1);
    const prevTo = new Date(from.getTime() - DAY);
    const prevFrom = new Date(prevTo.getTime() - (span - 1) * DAY);
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    return { from: ymd(prevFrom), to: ymd(prevTo) };
  }, [range.from, range.to]);

  const load = useCallback(async () => {
    try {
      const [summary, previous, exp, sales, prods, overdue, name] = await Promise.all([
        reportsSummary(orgId, range.from, range.to),
        reportsSummary(orgId, previousRange.from, previousRange.to),
        expensesSummary(orgId, range.from, range.to),
        salesByProduct(orgId),
        listProducts(orgId, 500),
        listOverdueInvoices(orgId, 50),
        getSetting("shop_name"),
      ]);

      const byId = new Map<string, ProductSales>(sales.map((s) => [s.product_id, s]));
      const named = (id: string) => prods.find((p) => p.id === id)?.name ?? "Item";

      const movers = [...sales]
        .sort((a, b) => b.qty_sold_milli - a.qty_sold_milli)
        .slice(0, 5)
        .map((s) => ({ name: named(s.product_id), qty: s.qty_sold_milli / 1000 }));

      // Money sitting still: stock on the shelf that has not sold in two months.
      const dead = prods
        .filter((p) => p.on_hand_milli > 0 && daysSince(byId.get(p.id)?.last_sold ?? null) >= 60)
        .map((p) => ({
          name: p.name,
          onHand: p.on_hand_milli / 1000,
          days: daysSince(byId.get(p.id)?.last_sold ?? null),
        }))
        .sort((a, b) => b.onHand - a.onHand)
        .slice(0, 5);

      setProducts(prods);
      setShopName(name ?? "");
      setPulse({
        summary,
        previous,
        expenses: exp.totalPaise,
        movers,
        dead,
        low: prods.filter((p) => p.on_hand_milli <= 0).slice(0, 5),
        overdue,
      });
      setNarrative(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId, range.from, range.to, previousRange.from, previousRange.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const delta = useMemo(() => {
    if (!pulse) return 0;
    const prev = pulse.previous.salesPaise;
    if (prev <= 0) return pulse.summary.salesPaise > 0 ? 100 : 0;
    return Math.round(((pulse.summary.salesPaise - prev) / prev) * 100);
  }, [pulse]);

  /** A compact, factual brief — the only thing the model is allowed to work from. */
  function contextFor(p: Pulse): string {
    const rupee = (n: number) => `₹${(n / 100).toFixed(0)}`;
    return [
      `Period: ${range.from} to ${range.to} (${range.label}).`,
      `Sales: ${rupee(p.summary.salesPaise)} across ${p.summary.salesCount} bills.`,
      `Previous equal period: ${rupee(p.previous.salesPaise)} (${delta >= 0 ? "+" : ""}${delta}%).`,
      `Collected: ${rupee(p.summary.collectedPaise)}. Outstanding overall: ${rupee(p.summary.outstandingPaise)}.`,
      `Purchases: ${rupee(p.summary.purchasesPaise)}. Expenses: ${rupee(p.expenses)}.`,
      p.movers.length ? `Best sellers: ${p.movers.map((m) => `${m.name} (${m.qty})`).join(", ")}.` : "",
      p.dead.length ? `Not sold in 60+ days: ${p.dead.map((d) => `${d.name} (${d.onHand} left)`).join(", ")}.` : "",
      p.low.length ? `Out of stock: ${p.low.map((l) => l.name).join(", ")}.` : "",
      p.overdue.length ? `${p.overdue.length} unpaid bills, oldest from ${p.overdue[0]?.date}.` : "No unpaid bills.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** Always-available briefing: the same facts, argued by rule instead of model. */
  function offlineBriefing(p: Pulse): string {
    const bits: string[] = [];
    bits.push(
      delta >= 0
        ? `Sales are ${formatPaise(p.summary.salesPaise as Paise)} this period, ${delta}% above the previous one.`
        : `Sales are ${formatPaise(p.summary.salesPaise as Paise)}, ${Math.abs(delta)}% below the previous period.`,
    );
    if (p.summary.outstandingPaise > 0) {
      bits.push(
        `${formatPaise(p.summary.outstandingPaise as Paise)} is still to be collected across ${p.overdue.length} bill(s) — chasing the oldest few is the fastest cash you can raise.`,
      );
    }
    if (p.dead.length > 0) {
      bits.push(
        `${p.dead[0]!.name} has not sold in ${p.dead[0]!.days} days with ${p.dead[0]!.onHand} on the shelf — worth a clearance offer.`,
      );
    }
    if (p.low.length > 0) {
      bits.push(`${p.low.map((l) => l.name).join(", ")} showed zero stock — reorder before the next rush.`);
    }
    if (p.movers.length > 0) {
      bits.push(`${p.movers[0]!.name} is your best seller; keep it stocked and put it in front.`);
    }
    return bits.join(" ");
  }

  async function writeBriefing() {
    if (!pulse) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question:
            "Write my business briefing for this period in under 130 words: two sentences on how the shop is doing, then exactly three numbered actions for this week, most valuable first. Be specific, use the figures given, and speak plainly to a shop owner.",
          context: contextFor(pulse),
        }),
      });
      if (res.ok) {
        const { text } = (await res.json()) as { text?: string };
        if (text) {
          setNarrative(text);
          return;
        }
      }
      setNarrative(offlineBriefing(pulse));
      setAiNote("Written from your numbers on this device — the AI service was not reachable.");
    } catch {
      setNarrative(offlineBriefing(pulse));
      setAiNote("Written from your numbers on this device — you appear to be offline.");
    } finally {
      setAiBusy(false);
    }
  }

  // ---- Catalogue sharing ---------------------------------------------------

  const catalogueText = useMemo(() => {
    const inStock = products.filter((p) => (p.price_paise ?? 0) > 0).slice(0, 40);
    const lines = inStock.map(
      (p) => `• ${p.name} — ${formatPaise((p.price_paise ?? 0) as Paise)}`,
    );
    return [
      `*${shopName || "Our shop"}* — price list`,
      "",
      ...lines,
      "",
      "Reply with what you need and we will keep it ready. 🙏",
    ].join("\n");
  }, [products, shopName]);

  function shareCatalogue() {
    window.open(`https://wa.me/?text=${encodeURIComponent(catalogueText)}`, "_blank", "noreferrer");
  }

  // ---- Google listing helper ----------------------------------------------

  const [listingText, setListingText] = useState<string | null>(null);
  const [listingBusy, setListingBusy] = useState(false);

  async function draftListing() {
    setListingBusy(true);
    try {
      const top = products.slice(0, 12).map((p) => p.name).join(", ");
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question:
            "Write a Google Business Profile description for this shop in about 60 words: warm, factual, no marketing clichés, mentioning what we sell and that customers can call or message on WhatsApp. Return only the description.",
          context: `Shop name: ${shopName || "(not set)"}\nWhat we sell: ${top || "(catalogue empty)"}`,
        }),
      });
      if (res.ok) {
        const { text } = (await res.json()) as { text?: string };
        if (text) {
          setListingText(text);
          return;
        }
      }
      setListingText(
        `${shopName || "Our shop"} — a neighbourhood shop stocking ${
          products.slice(0, 6).map((p) => p.name).join(", ") || "everyday essentials"
        }. Call or message us on WhatsApp and we will keep your order ready. GST invoices provided.`,
      );
    } catch {
      setListingText(
        `${shopName || "Our shop"} — a neighbourhood shop. Call or message us on WhatsApp and we will keep your order ready.`,
      );
    } finally {
      setListingBusy(false);
    }
  }

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Growth Studio</h1>
        <p className="text-body text-content-muted">
          What your own numbers say you should do next — and the fastest ways to
          reach more customers.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "rounded-control border px-4 py-2 text-body font-medium transition-colors " +
              (tab === t.key
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-content-muted hover:border-primary hover:text-primary")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-body text-content-muted">{current.blurb}</p>

      {error ? (
        <p role="alert" className="rounded-control border border-danger-border bg-danger-tonal px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      {/* ---------------- Business pulse ---------------- */}
      {tab === "pulse" ? (
        <>
          <DateRangePicker value={range} onChange={setRange} />

          {pulse === null ? (
            <p className="text-body text-content-muted">Reading your books…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Tile
                  label="Sales"
                  value={formatPaise(pulse.summary.salesPaise as Paise)}
                  foot={`${pulse.summary.salesCount} bills`}
                  trend={delta}
                />
                <Tile
                  label="Collected"
                  value={formatPaise(pulse.summary.collectedPaise as Paise)}
                  foot="money actually received"
                />
                <Tile
                  label="Outstanding"
                  value={formatPaise(pulse.summary.outstandingPaise as Paise)}
                  foot={`${pulse.overdue.length} unpaid bills`}
                  warn={pulse.summary.outstandingPaise > 0}
                />
                <Tile
                  label="Purchases + expenses"
                  value={formatPaise((pulse.summary.purchasesPaise + pulse.expenses) as Paise)}
                  foot="money going out"
                />
              </div>

              <Card className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-h3">This period, in words</h2>
                  <Button onClick={writeBriefing} disabled={aiBusy}>
                    {aiBusy ? "Thinking…" : narrative ? "Write it again" : "✨ Write my briefing"}
                  </Button>
                </div>
                {narrative ? (
                  <>
                    <p className="whitespace-pre-wrap text-body-lg text-content">{narrative}</p>
                    {aiNote ? (
                      <p className="text-caption normal-case text-content-muted">{aiNote}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-body text-content-muted">
                    Every figure above is read from your own invoices and stock
                    movements. Ask for a briefing and it will be explained in
                    plain language, with the three things most worth doing this
                    week.
                  </p>
                )}
              </Card>

              <div className="grid gap-3 lg:grid-cols-3">
                <ListCard
                  title="Selling best"
                  empty="No sales recorded yet."
                  rows={pulse.movers.map((m) => ({ left: m.name, right: `${m.qty}` }))}
                />
                <ListCard
                  title="Money sitting still"
                  empty="Nothing has gone stale — good."
                  tone="warning"
                  rows={pulse.dead.map((d) => ({
                    left: d.name,
                    right: `${d.onHand} left · ${d.days === Infinity ? "never sold" : `${d.days}d`}`,
                  }))}
                />
                <ListCard
                  title="Chase these first"
                  empty="Nothing outstanding."
                  tone="danger"
                  rows={pulse.overdue.slice(0, 5).map((o) => ({
                    left: o.customer_name ?? "Walk-in",
                    right: formatPaise((o.total_paise - o.amount_paid_paise) as Paise),
                  }))}
                />
              </div>
            </>
          )}
        </>
      ) : null}

      {/* ---------------- Catalogue ---------------- */}
      {tab === "storefront" ? (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-h3">Your price list, ready to send</h2>
          <p className="text-body text-content-muted">
            Built from your catalogue every time you open this — no separate
            store to keep updated. Send it to one customer or a group.
          </p>
          {products.length === 0 ? (
            <EmptyState
              title="No items priced yet"
              description="Add items with a selling price in Products, and your shareable price list builds itself."
            />
          ) : (
            <>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-card border border-border bg-canvas p-4 text-body text-content">
                {catalogueText}
              </pre>
              <div className="flex flex-wrap gap-3">
                <Button onClick={shareCatalogue}>Share on WhatsApp</Button>
                <Button
                  variant="outline"
                  onClick={() => void navigator.clipboard?.writeText(catalogueText)}
                >
                  Copy text
                </Button>
              </div>
              <p className="text-caption normal-case text-content-muted">
                Showing the first 40 priced items. A full online storefront with
                order-taking is on the roadmap — this is the part that works
                today, on the channel your customers already use.
              </p>
            </>
          )}
        </Card>
      ) : null}

      {/* ---------------- Google listing ---------------- */}
      {tab === "listing" ? (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-h3">Business description</h2>
              <Button onClick={draftListing} disabled={listingBusy}>
                {listingBusy ? "Writing…" : "✨ Draft it for me"}
              </Button>
            </div>
            <p className="text-body text-content-muted">
              Written from your shop name and what you actually stock. Paste it
              into your Google listing, WhatsApp Business profile or shopfront
              board.
            </p>
            {listingText ? (
              <>
                <p className="whitespace-pre-wrap rounded-card border border-border bg-canvas p-4 text-body-lg text-content">
                  {listingText}
                </p>
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => void navigator.clipboard?.writeText(listingText)}
                >
                  Copy
                </Button>
              </>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Getting found: the checklist</h2>
            <ol className="flex flex-col gap-2">
              {[
                "Create a free Google Business Profile at business.google.com — it is what puts you on Maps.",
                "Use the exact shop name on your board, your bills and your listing. Mismatches cost you searches.",
                "Add your opening hours, phone number and a WhatsApp link.",
                "Put up 5 photos: the shopfront, inside, your counter, and two of what you sell.",
                "Ask three regular customers to leave a review this week. Reviews move you up more than anything else.",
                "Paste the description above into the listing, and keep it in step with what you stock.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3 rounded-card border border-border bg-canvas p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-primary text-caption font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-body text-content">{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-caption normal-case text-content-muted">
              Vyora does not post to Google on your behalf — that needs Google&apos;s
              own approval, and a listing claimed in your name is worth more than
              one claimed in ours.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  foot,
  trend,
  warn,
}: {
  label: string;
  value: string;
  foot: string;
  trend?: number;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
      <span className="text-caption font-medium uppercase text-content-muted">{label}</span>
      <span className={"font-mono text-h2 " + (warn ? "text-warning" : "text-content")}>{value}</span>
      <div className="flex items-center gap-2">
        <span className="text-caption normal-case text-content-muted">{foot}</span>
        {trend !== undefined ? (
          <Badge tone={trend >= 0 ? "success" : "danger"}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function ListCard({
  title,
  rows,
  empty,
  tone,
}: {
  title: string;
  rows: { left: string; right: string }[];
  empty: string;
  tone?: "warning" | "danger";
}) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <h3 className="text-body-lg font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-body text-content-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r, i) => (
            <li
              key={`${r.left}-${i}`}
              className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0"
            >
              <span className="text-body text-content">{r.left}</span>
              <span
                className={
                  "font-mono text-body " +
                  (tone === "danger"
                    ? "text-danger"
                    : tone === "warning"
                      ? "text-warning"
                      : "text-content-muted")
                }
              >
                {r.right}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
