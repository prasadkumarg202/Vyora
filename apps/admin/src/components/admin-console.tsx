"use client";

import { Badge, Button, Card, Input } from "@vyora/ui";
import { useState, type ReactNode } from "react";

/**
 * Vyora Admin Portal — the internal SaaS console.
 *
 * Built to `design/Vyora Admin Portal.dc.html`: a dark-sidebar shell with four
 * nav zones and sixteen sections, switched in-app. Tenant/billing/AI figures are
 * sample data for the investor walkthrough — each array below is one query away
 * from live. The one hard rule the design encodes and this keeps: customer
 * record bodies are encrypted and never shown here; support sees plan, seats and
 * sync health only, and anything deeper needs a time-boxed, owner-approved OTP
 * grant.
 */

// ---------------------------------------------------------------------------
// Navigation (design navDef)
// ---------------------------------------------------------------------------

type PageId =
  | "dashboard" | "health"
  | "customers" | "subscriptions" | "billing" | "monetization" | "competition"
  | "templates" | "flags" | "formbuilder" | "themes"
  | "aiusage" | "support" | "broadcasts" | "audit" | "adminroles";

const NAV: { group: string; items: { id: PageId; label: string }[] }[] = [
  { group: "Overview", items: [
    { id: "dashboard", label: "Dashboard" },
    { id: "health", label: "System health" },
  ] },
  { group: "Growth", items: [
    { id: "customers", label: "Customers" },
    { id: "subscriptions", label: "Subscriptions & licenses" },
    { id: "billing", label: "Billing" },
    { id: "monetization", label: "Monetization" },
    { id: "competition", label: "Competition" },
  ] },
  { group: "Product", items: [
    { id: "templates", label: "Business templates" },
    { id: "flags", label: "Feature flags" },
    { id: "formbuilder", label: "Form builder" },
    { id: "themes", label: "Theme manager" },
  ] },
  { group: "Operations", items: [
    { id: "aiusage", label: "AI usage analytics" },
    { id: "support", label: "Support & tickets" },
    { id: "broadcasts", label: "Broadcasts & push" },
    { id: "audit", label: "Audit logs" },
    { id: "adminroles", label: "Team & roles" },
  ] },
];

const TITLES: Record<PageId, string> = {
  dashboard: "Dashboard", health: "System health",
  customers: "Customer management", subscriptions: "Subscriptions & licenses",
  billing: "Billing", monetization: "Monetization", competition: "Competition",
  templates: "Business templates", flags: "Feature flags",
  formbuilder: "Form builder", themes: "Theme manager",
  aiusage: "AI usage analytics", support: "Support & tickets",
  broadcasts: "Broadcasts & push", audit: "Audit logs", adminroles: "Team & roles",
};

// ---------------------------------------------------------------------------
// Sample data (design constants)
// ---------------------------------------------------------------------------

const DASH_TILES = [
  { l: "Tenants", v: "1,284" },
  { l: "MRR", v: "₹9.4L" },
  { l: "Active seats", v: "3,910" },
  { l: "AI calls / day", v: "58k" },
  { l: "Open tickets", v: "23" },
];
const SIGNUPS = [
  { l: "Mon", h: 60 }, { l: "Tue", h: 72 }, { l: "Wed", h: 55 }, { l: "Thu", h: 84 },
  { l: "Fri", h: 100 }, { l: "Sat", h: 70 }, { l: "Sun", h: 48 },
];
const PLAN_DIST = [
  { name: "1 user", pct: 35 }, { name: "3 users", pct: 36 }, { name: "5 users", pct: 17 },
  { name: "10 users", pct: 9 }, { name: "Unlimited", pct: 3 },
];

type Sev = "ok" | "warn" | "down";
const HEALTH_FRONT: { l: string; v: string; s: Sev }[] = [
  { l: "Web uptime · 30d", v: "99.98%", s: "ok" },
  { l: "Crash-free sessions", v: "99.7%", s: "ok" },
  { l: "LCP · p75", v: "1.8s", s: "ok" },
  { l: "JS error rate", v: "0.4%", s: "warn" },
  { l: "PWA installs · 7d", v: "2,140", s: "ok" },
];
const HEALTH_BACK: { l: string; v: string; s: Sev }[] = [
  { l: "Supabase API · p95", v: "118ms", s: "ok" },
  { l: "Postgres CPU", v: "42%", s: "ok" },
  { l: "Edge fn error rate", v: "0.2%", s: "ok" },
  { l: "Sync queue backlog", v: "1,240", s: "warn" },
  { l: "Storage used", v: "61%", s: "ok" },
];
const APIS: { name: string; v: string; s: Sev }[] = [
  { name: "GSP / GSTN filing", v: "Operational · 320ms", s: "ok" },
  { name: "WhatsApp Cloud API", v: "Operational · 99.9%", s: "ok" },
  { name: "Twilio SMS", v: "Degraded · retries elevated", s: "warn" },
  { name: "Claude", v: "Operational", s: "ok" },
  { name: "Gemini", v: "Operational", s: "ok" },
  { name: "Meta Graph (Instagram/FB)", v: "Incident · posting paused", s: "down" },
];

type TStatus = "active" | "trial" | "overdue";
const TENANTS: { org: string; biz: string; plan: string; mrr: string; s: TStatus }[] = [
  { org: "Sharma Medical", biz: "Pharmacy", plan: "3-user", mrr: "₹208", s: "active" },
  { org: "Anand Restaurant", biz: "Restaurant", plan: "5-user", mrr: "₹333", s: "active" },
  { org: "Kiran Mobiles", biz: "Mobile", plan: "1-user", mrr: "₹83", s: "trial" },
  { org: "Gupta Jewellers", biz: "Jewellery", plan: "10-user", mrr: "₹583", s: "active" },
  { org: "Metro Supermarket", biz: "Grocery", plan: "Unlimited", mrr: "₹999", s: "active" },
  { org: "Style Garments", biz: "Garments", plan: "3-user", mrr: "₹0", s: "overdue" },
];
const PLANS = [
  { name: "1 user", subs: "386", price: "₹999/yr" },
  { name: "3 users", subs: "402", price: "₹2,499/yr" },
  { name: "5 users", subs: "188", price: "₹3,999/yr" },
  { name: "10 users", subs: "96", price: "₹6,999/yr" },
  { name: "Unlimited", subs: "30", price: "₹11,999/yr" },
];
type BStatus = "paid" | "overdue" | "pending";
const BILLING: { inv: string; org: string; amt: string; date: string; s: BStatus }[] = [
  { inv: "B-9042", org: "Metro Supermarket", amt: "₹11,999", date: "12 Jul", s: "paid" },
  { inv: "B-9041", org: "Gupta Jewellers", amt: "₹6,999", date: "11 Jul", s: "paid" },
  { inv: "B-9040", org: "Style Garments", amt: "₹2,499", date: "10 Jul", s: "overdue" },
  { inv: "B-9039", org: "Anand Restaurant", amt: "₹3,999", date: "09 Jul", s: "paid" },
  { inv: "B-9038", org: "Kiran Mobiles", amt: "₹999", date: "08 Jul", s: "pending" },
];
const MON_KPIS = [
  { l: "MRR", v: "₹9.4L" }, { l: "ARR", v: "₹1.13Cr" }, { l: "ARPU / yr", v: "₹8,780" },
  { l: "LTV", v: "₹26,400" }, { l: "CAC", v: "₹410" }, { l: "Trial → paid", v: "34%" },
];
const MON_STREAMS = [
  { name: "Subscriptions", pct: 82 },
  { name: "AI add-on credits", pct: 11 },
  { name: "WhatsApp message credits", pct: 7 },
];
const COMP_ROWS = [
  { f: "Price (entry, per year)", vy: "₹3,599", mb: "₹2,899", zo: "₹9,000+", us: "₹999" },
  { f: "Adapts per business type", vy: "·", mb: "·", zo: "○", us: "●" },
  { f: "Full offline-first", vy: "○", mb: "·", zo: "·", us: "●" },
  { f: "Zero-knowledge encryption", vy: "·", mb: "·", zo: "·", us: "●" },
  { f: "Self-serve GST filing (no CA)", vy: "·", mb: "○", zo: "○", us: "●" },
  { f: "AI copilot on own data", vy: "·", mb: "·", zo: "○", us: "●" },
  { f: "WhatsApp-native marketing", vy: "○", mb: "○", zo: "·", us: "●" },
];
const SWITCHERS = [
  { from: "Vyapar", n: "214" }, { from: "MyBillBook", n: "96" },
  { from: "Zoho Books", n: "41" }, { from: "Paper / Excel", n: "380" },
];
const TEMPLATES: { name: string; fields: string; gst: string; s: "active" | "draft" }[] = [
  { name: "Pharmacy", fields: "10", gst: "12%", s: "active" },
  { name: "Restaurant", fields: "9", gst: "5%", s: "active" },
  { name: "Jewellery", fields: "10", gst: "3%", s: "active" },
  { name: "Mobile Shop", fields: "10", gst: "18%", s: "active" },
  { name: "Catering", fields: "9", gst: "5%", s: "draft" },
  { name: "Manufacturing", fields: "9", gst: "18%", s: "draft" },
];
const FLAG_DEFS = [
  { id: "ai_forecast", name: "AI sales forecasting", desc: "Predictive forecasts in Copilot", on: true },
  { id: "ocr_v2", name: "OCR engine v2", desc: "Improved table extraction", on: true },
  { id: "insta_dm", name: "Instagram DM campaigns", desc: "Marketing via Instagram inbox", on: false },
  { id: "multi_currency", name: "Multi-currency", desc: "Non-INR billing for exports", on: false },
  { id: "einvoice", name: "E-invoicing (IRN)", desc: "Auto IRN for B2B above threshold", on: true },
];
const PALETTE = ["Text", "Number", "Date", "Select", "Currency", "Barcode / scan", "Toggle"];
const THEMES = [
  { id: "indigo", name: "Indigo (default)", h: 285 }, { id: "teal", name: "Teal", h: 175 },
  { id: "blue", name: "Deep blue", h: 250 }, { id: "saffron", name: "Saffron", h: 60 },
];
const PROVIDERS = [
  { name: "Claude", pct: 58 }, { name: "Gemini", pct: 27 }, { name: "OpenRouter", pct: 15 },
];
const INTENTS = [
  { name: "Create invoice", pct: 31 }, { name: "Business insights", pct: 24 },
  { name: "GST assistant", pct: 19 }, { name: "OCR capture", pct: 14 },
];
type TicStage = "ai" | "virtual" | "onsite";
type TicStatus = "open" | "pending" | "resolved";
type TicPrio = "High" | "Medium" | "Low";
const TICKETS: { id: string; org: string; subject: string; ch: string; prio: TicPrio; stage: TicStage; s: TicStatus; sla: "ok" | "risk" | "breached" }[] = [
  { id: "#4821", org: "Sharma Medical", subject: "Sync stuck offline for 2 days", ch: "WhatsApp", prio: "High", stage: "virtual", s: "open", sla: "breached" },
  { id: "#4820", org: "Metro Supermarket", subject: "Barcode scanner pairing", ch: "In-app chat", prio: "Medium", stage: "ai", s: "pending", sla: "risk" },
  { id: "#4819", org: "Style Garments", subject: "GST rate wrong on one item", ch: "In-app chat", prio: "Medium", stage: "virtual", s: "open", sla: "ok" },
  { id: "#4818", org: "Gupta Jewellers", subject: "HUID not printing on invoice", ch: "In-app chat", prio: "Low", stage: "ai", s: "resolved", sla: "ok" },
  { id: "#4816", org: "FreshMart Grocery", subject: "Bulk import of products", ch: "WhatsApp", prio: "Low", stage: "ai", s: "resolved", sla: "ok" },
  { id: "#4815", org: "Anand Restaurant", subject: "KOT printer setup at store", ch: "WhatsApp", prio: "High", stage: "onsite", s: "open", sla: "risk" },
  { id: "#4813", org: "AutoCare Motors", subject: "Refund for double charge", ch: "Email", prio: "High", stage: "virtual", s: "resolved", sla: "breached" },
  { id: "#4812", org: "Kiran Mobiles", subject: "Trial extension request", ch: "Email", prio: "Low", stage: "ai", s: "resolved", sla: "ok" },
];
const TICKET_STATS = {
  open: 23, inProgress: 9, resolvedToday: 41, resolved30d: 612,
  slaMet: 94, slaBreached: 6, avgResolution: "3.4h", firstResponse: "40s",
  csat: "4.6 / 5", resolvedByAI: 68, backlog: 32,
};
const TICKET_CHANNELS = [
  { name: "In-app chat", pct: 46 }, { name: "WhatsApp", pct: 38 },
  { name: "Email", pct: 12 }, { name: "Phone", pct: 4 },
];
const TICKET_PRIOS: { name: TicPrio; count: number; tone: "danger" | "warning" | "neutral" }[] = [
  { name: "High", count: 6, tone: "danger" },
  { name: "Medium", count: 11, tone: "warning" },
  { name: "Low", count: 15, tone: "neutral" },
];
const RESOLVE_TREND = [
  { l: "Mon", h: 62 }, { l: "Tue", h: 78 }, { l: "Wed", h: 54 }, { l: "Thu", h: 88 },
  { l: "Fri", h: 100 }, { l: "Sat", h: 46 }, { l: "Sun", h: 33 },
];
const SUPPORT_OPTIONS = [
  { name: "AI chatbot", detail: "In-app + WhatsApp · 24/7 · resolves 68%", channel: "Automated", tone: "success" as const },
  { name: "WhatsApp support", detail: "+91 80471 0xxxx · chat with a human", channel: "Human", tone: "info" as const },
  { name: "Call / screen-share", detail: "Virtual assistant · 9am–9pm", channel: "Human", tone: "info" as const },
  { name: "On-site visit", detail: "Hardware & setup · metro cities", channel: "Field", tone: "warning" as const },
];
const BROADCASTS: { title: string; ch: string; aud: string; s: "scheduled" | "sent" }[] = [
  { title: "Scheduled maintenance · 20 Jul, 2–3 AM IST", ch: "Push · In-app", aud: "All customers", s: "scheduled" },
  { title: "Diwali offer — 20% off annual plans", ch: "Push · WhatsApp", aud: "Trials + monthly plans", s: "sent" },
  { title: "New: self-serve GST filing is live", ch: "Push · Email", aud: "All customers", s: "sent" },
];
const AUDIT = [
  { actor: "ops@vyora", action: "flag.enable", target: "einvoice", time: "2m" },
  { actor: "ops@vyora", action: "template.edit", target: "Pharmacy", time: "1h" },
  { actor: "billing@vyora", action: "refund.issue", target: "B-9012", time: "3h" },
  { actor: "ops@vyora", action: "tenant.suspend", target: "Style Garments", time: "5h" },
  { actor: "admin@vyora", action: "role.grant", target: "new-hire", time: "1d" },
];
const ROLE_COLS = ["Superadmin", "Ops", "Support", "Billing", "Analyst"];
const ROLES = [
  { cap: "View tenant data (with owner consent)", r: ["●", "●", "●", "·", "·"] },
  { cap: "Adjust invoices / issue credit notes", r: ["●", "·", "●", "·", "·"] },
  { cap: "Refunds & billing changes", r: ["●", "·", "·", "●", "·"] },
  { cap: "Feature flags & templates", r: ["●", "●", "·", "·", "·"] },
  { cap: "Health & analytics dashboards", r: ["●", "●", "○", "○", "●"] },
  { cap: "Audit log (read-only)", r: ["●", "●", "●", "●", "●"] },
];

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const SIDEBAR_BG = "oklch(0.20 0.03 285)";
const SIDEBAR_ACTIVE = "oklch(0.30 0.08 285)";

function sevTone(s: Sev): "success" | "warning" | "danger" {
  return s === "ok" ? "success" : s === "warn" ? "warning" : "danger";
}
function sevColor(s: Sev): string {
  return s === "ok" ? "oklch(0.62 0.17 150)" : s === "warn" ? "oklch(0.70 0.16 75)" : "oklch(0.58 0.22 25)";
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-40 flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
      <span className="text-caption font-semibold uppercase text-content-muted">{label}</span>
      <span className="font-mono text-h2">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3">{title}</h2>
      {children}
    </section>
  );
}

function Bar({ pct, hue = 285 }: { pct: number; hue?: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-canvas">
      <div className="h-full rounded-pill" style={{ width: `${pct}%`, backgroundColor: `oklch(0.55 0.2 ${hue})` }} />
    </div>
  );
}

function matrixMark(m: string) {
  if (m === "●") return <span style={{ color: "oklch(0.55 0.2 285)" }}>●</span>;
  if (m === "○") return <span className="text-content-muted">○</span>;
  return <span className="text-content-muted opacity-40">·</span>;
}

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

export function AdminConsole() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [flags, setFlags] = useState<Record<string, boolean>>(
    () => Object.fromEntries(FLAG_DEFS.map((f) => [f.id, f.on])),
  );

  return (
    <div className="flex min-h-dvh bg-canvas text-content">
      {/* Sidebar */}
      <aside
        className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto px-3 py-5 text-white"
        style={{ backgroundColor: SIDEBAR_BG }}
      >
        <div className="flex items-center gap-3 px-3">
          <span className="flex size-9 items-center justify-center rounded-control font-mono text-body-lg font-semibold text-white" style={{ backgroundColor: "oklch(0.55 0.2 285)" }}>
            V
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-body font-semibold">Vyora</span>
            <span className="text-caption text-white/55">Admin · internal</span>
          </div>
        </div>

        <nav className="flex flex-col gap-4">
          {NAV.map((zone) => (
            <div key={zone.group} className="flex flex-col gap-1">
              <span className="px-3 text-caption font-semibold uppercase tracking-wide text-white/40">
                {zone.group}
              </span>
              {zone.items.map((it) => {
                const active = it.id === page;
                return (
                  <button
                    key={it.id}
                    onClick={() => setPage(it.id)}
                    className="flex items-center rounded-control px-3 py-2 text-left text-body transition-colors"
                    style={{
                      backgroundColor: active ? SIDEBAR_ACTIVE : "transparent",
                      color: active ? "white" : "oklch(0.85 0.02 285)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {it.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 border-t border-white/10 px-3 pt-4">
          <span className="flex size-8 items-center justify-center rounded-pill bg-white/15 text-caption font-semibold">TM</span>
          <div className="flex flex-col leading-tight">
            <span className="text-body">Team member</span>
            <span className="text-caption text-white/50">Platform ops</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-8 py-5">
          <h1 className="text-h2">{TITLES[page]}</h1>
          {page === "dashboard" ? (
            <span className="rounded-pill border border-warning-border bg-warning-tonal px-3 py-1 text-caption text-warning">
              🔒 Customer data stays encrypted — not visible here
            </span>
          ) : null}
        </div>

        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-8 py-8">
          {renderPage(page, flags, setFlags)}
        </div>
      </main>
    </div>
  );
}

function renderPage(
  page: PageId,
  flags: Record<string, boolean>,
  setFlags: (f: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
) {
  switch (page) {
    case "dashboard":
      return (
        <>
          <div className="flex flex-wrap gap-3">
            {DASH_TILES.map((t) => <Tile key={t.l} label={t.l} value={t.v} />)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-4 p-5">
              <h2 className="text-h3">New signups · last 7 days</h2>
              <div className="flex h-48 items-end gap-3">
                {SIGNUPS.map((b) => (
                  <div key={b.l} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full"
                      style={{
                        height: `${b.h}%`,
                        borderRadius: "6px 6px 0 0",
                        backgroundColor: b.h === 100 ? "oklch(0.55 0.2 285)" : "oklch(0.72 0.12 285)",
                      }}
                    />
                    <span className="text-caption text-content-muted">{b.l}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-h3">Plan distribution</h2>
              {PLAN_DIST.map((p) => (
                <div key={p.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-body">
                    <span className="text-content-muted">{p.name}</span>
                    <span className="font-mono">{p.pct}%</span>
                  </div>
                  <Bar pct={p.pct} />
                </div>
              ))}
            </Card>
          </div>
        </>
      );

    case "health":
      return (
        <div className="grid gap-4 lg:grid-cols-3">
          <HealthCard title="Frontend health" rows={HEALTH_FRONT} />
          <HealthCard title="Backend health" rows={HEALTH_BACK} />
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Third-party APIs</h2>
            <div className="flex flex-col divide-y divide-border">
              {APIS.map((a) => (
                <div key={a.name} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-pill" style={{ backgroundColor: sevColor(a.s) }} />
                    <span className="text-body">{a.name}</span>
                  </div>
                  <span className="text-caption normal-case text-content-muted">{a.v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      );

    case "customers":
      return (
        <Section title="Tenants · 1,284 — click one to open the support workspace">
          <Card className="p-0">
            <TableHead cols={[["Organisation", 4], ["Business", 2], ["Plan", 2], ["MRR", 2], ["Status", 2]]} />
            <div className="divide-y divide-border">
              {TENANTS.map((t) => (
                <div key={t.org} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                  <span className="col-span-4 text-body font-medium">{t.org} →</span>
                  <span className="col-span-2 text-body text-content-muted">{t.biz}</span>
                  <span className="col-span-2 text-body text-content-muted">{t.plan}</span>
                  <span className="col-span-2 font-mono text-body">{t.mrr}</span>
                  <span className="col-span-2">
                    <Badge tone={t.s === "active" ? "success" : t.s === "trial" ? "info" : "warning"}>
                      {t.s}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card className="flex items-start gap-3 p-5">
            <span className="text-body-lg">🔒</span>
            <p className="text-body text-content-muted">
              Data is encrypted — owner consent required. Support sees plan, seats
              and sync health only; deeper access needs a time-boxed OTP grant the
              owner approves, and every action is audit-logged.
            </p>
          </Card>
        </Section>
      );

    case "subscriptions":
      return (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Licenses · active / all-time" value="1,102 / 1,486" />
            <Tile label="Trials" value="182" />
            <Tile label="Churn · 30d" value="2.1%" />
          </div>
          <Section title="Plans">
            <Card className="p-0">
              <TableHead cols={[["Plan", 6], ["Subscribers", 3], ["Price", 3]]} />
              <div className="divide-y divide-border">
                {PLANS.map((p) => (
                  <div key={p.name} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                    <span className="col-span-6 text-body font-medium">{p.name}</span>
                    <span className="col-span-3 font-mono text-body text-content-muted">{p.subs}</span>
                    <span className="col-span-3 font-mono text-body">{p.price}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>
        </>
      );

    case "billing":
      return (
        <Section title="Billing & invoices">
          <Card className="p-0">
            <TableHead cols={[["Invoice", 2], ["Tenant", 4], ["Amount", 2], ["Date", 2], ["Status", 2]]} />
            <div className="divide-y divide-border">
              {BILLING.map((b) => (
                <div key={b.inv} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                  <span className="col-span-2 font-mono text-body">{b.inv}</span>
                  <span className="col-span-4 text-body">{b.org}</span>
                  <span className="col-span-2 font-mono text-body">{b.amt}</span>
                  <span className="col-span-2 text-body text-content-muted">{b.date}</span>
                  <span className="col-span-2">
                    <Badge tone={b.s === "paid" ? "success" : b.s === "overdue" ? "warning" : "neutral"}>{b.s}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      );

    case "monetization":
      return (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {MON_KPIS.map((k) => <Tile key={k.l} label={k.l} value={k.v} />)}
          </div>
          <Section title="Revenue streams">
            <Card className="flex flex-col gap-3 p-5">
              {MON_STREAMS.map((s) => (
                <div key={s.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-body">
                    <span className="text-content-muted">{s.name}</span>
                    <span className="font-mono">{s.pct}%</span>
                  </div>
                  <Bar pct={s.pct} />
                </div>
              ))}
            </Card>
          </Section>
          <Card className="flex flex-col gap-2 p-5">
            <h2 className="text-h3">Unit economics</h2>
            <p className="text-body text-content-muted">
              LTV : CAC of 64 : 1 at current churn (2.1%). AI cost per tenant
              ₹38/mo against ₹94/mo of AI-attributed revenue — the copilot is
              margin-positive. Multi-year plans (2y/3y) now 41% of new revenue,
              pulling cash forward.
            </p>
          </Card>
        </>
      );

    case "competition":
      return (
        <>
          <Section title="Capability comparison">
            <Card className="p-0">
              <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-caption font-semibold uppercase text-content-muted">
                <span className="col-span-4">Capability</span>
                <span className="col-span-2 text-center">Vyapar</span>
                <span className="col-span-2 text-center">MyBillBook</span>
                <span className="col-span-2 text-center">Zoho Books</span>
                <span className="col-span-2 text-center font-semibold text-primary">Vyora</span>
              </div>
              <div className="divide-y divide-border">
                {COMP_ROWS.map((r) => (
                  <div key={r.f} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                    <span className="col-span-4 text-body">{r.f}</span>
                    <span className="col-span-2 text-center text-body">{r.f.startsWith("Price") ? r.vy : matrixMark(r.vy)}</span>
                    <span className="col-span-2 text-center text-body">{r.f.startsWith("Price") ? r.mb : matrixMark(r.mb)}</span>
                    <span className="col-span-2 text-center text-body">{r.f.startsWith("Price") ? r.zo : matrixMark(r.zo)}</span>
                    <span className="col-span-2 text-center text-body font-medium">{r.f.startsWith("Price") ? r.us : matrixMark(r.us)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>
          <Section title="Switchers this month · 731">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SWITCHERS.map((s) => (
                <div key={s.from} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
                  <span className="text-caption normal-case text-content-muted">from {s.from}</span>
                  <span className="font-mono text-h3">{s.n}</span>
                </div>
              ))}
            </div>
          </Section>
        </>
      );

    case "templates":
      return (
        <Section title="Business templates · metadata">
          <Card className="p-0">
            <TableHead cols={[["Template", 5], ["Fields", 3], ["GST", 2], ["Status", 2]]} />
            <div className="divide-y divide-border">
              {TEMPLATES.map((t) => (
                <div key={t.name} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                  <span className="col-span-5 text-body font-medium">{t.name}</span>
                  <span className="col-span-3 font-mono text-body text-content-muted">{t.fields}</span>
                  <span className="col-span-2"><Badge tone="neutral">{t.gst}</Badge></span>
                  <span className="col-span-2">
                    <Badge tone={t.s === "active" ? "success" : "neutral"}>{t.s}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      );

    case "flags":
      return (
        <Section title="Feature flags">
          <Card className="flex flex-col divide-y divide-border p-0">
            {FLAG_DEFS.map((f) => {
              const on = flags[f.id];
              return (
                <div key={f.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex flex-col">
                    <span className="text-body font-medium">{f.name}</span>
                    <span className="text-caption normal-case text-content-muted">{f.desc}</span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={on}
                    onClick={() => setFlags((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
                    className="relative h-6 w-11 shrink-0 rounded-pill transition-colors"
                    style={{ backgroundColor: on ? "oklch(0.55 0.2 285)" : "oklch(0.85 0.01 285)" }}
                  >
                    <span
                      className="absolute top-0.5 size-5 rounded-pill bg-white transition-all"
                      style={{ left: on ? "22px" : "2px" }}
                    />
                  </button>
                </div>
              );
            })}
          </Card>
        </Section>
      );

    case "formbuilder":
      return (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Field palette</h2>
            <div className="flex flex-col gap-2">
              {PALETTE.map((p) => (
                <div key={p} className="flex items-center gap-2 rounded-control border border-border bg-canvas px-3 py-2 text-body">
                  <span className="text-content-muted">⠿</span> {p}
                </div>
              ))}
            </div>
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Form · Pharmacy item</h2>
            <FormField label="Item name" hint="Text field" />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Batch No" hint="Text" />
              <FormField label="Expiry" hint="Date" />
            </div>
            <div className="rounded-control border border-dashed border-border px-3 py-6 text-center text-caption normal-case text-content-muted">
              Drop a field here
            </div>
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-h3">Field properties</h2>
            <FormField label="Label" hint="Batch No" />
            <label className="flex items-center justify-between text-body">
              <span>Required</span>
              <span className="size-5 rounded-control" style={{ backgroundColor: "oklch(0.55 0.2 285)" }} />
            </label>
            <label className="flex items-center justify-between text-body">
              <span>Show on invoice</span>
              <span className="size-5 rounded-control" style={{ backgroundColor: "oklch(0.55 0.2 285)" }} />
            </label>
          </Card>
        </div>
      );

    case "themes":
      return (
        <Section title="Theme presets">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {THEMES.map((t) => (
              <div key={t.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
                <div className="flex gap-1">
                  <span className="size-6 rounded-control" style={{ backgroundColor: `oklch(0.55 0.2 ${t.h})` }} />
                  <span className="size-6 rounded-control" style={{ backgroundColor: `oklch(0.72 0.12 ${t.h})` }} />
                  <span className="size-6 rounded-control" style={{ backgroundColor: `oklch(0.92 0.05 ${t.h})` }} />
                </div>
                <span className="text-body font-medium">{t.name}</span>
              </div>
            ))}
          </div>
        </Section>
      );

    case "aiusage":
      return (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Tokens · 30d" value="412M" />
            <Tile label="Est. cost" value="₹1.8L" />
            <Tile label="Avg latency" value="1.2s" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-h3">By provider</h2>
              {PROVIDERS.map((p) => (
                <div key={p.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-body">
                    <span className="text-content-muted">{p.name}</span>
                    <span className="font-mono">{p.pct}%</span>
                  </div>
                  <Bar pct={p.pct} />
                </div>
              ))}
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-h3">Top intents</h2>
              {INTENTS.map((i) => (
                <div key={i.name} className="flex items-baseline justify-between text-body">
                  <span className="text-content-muted">{i.name}</span>
                  <span className="font-mono">{i.pct}%</span>
                </div>
              ))}
            </Card>
          </div>
        </>
      );

    case "support":
      return (
        <>
          {/* Status summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Open" value={String(TICKET_STATS.open)} />
            <Tile label="In progress" value={String(TICKET_STATS.inProgress)} />
            <Tile label="Resolved today" value={String(TICKET_STATS.resolvedToday)} />
            <div className="flex min-w-40 flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
              <span className="text-caption font-semibold uppercase text-content-muted">SLA missed · 30d</span>
              <span className="font-mono text-h2 text-danger">{TICKET_STATS.slaBreached}%</span>
              <span className="text-caption normal-case text-content-muted">{TICKET_STATS.slaMet}% met</span>
            </div>
          </div>

          {/* Analytics */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-h3">Resolved · last 7 days</h2>
              <div className="flex h-36 items-end gap-2">
                {RESOLVE_TREND.map((b) => (
                  <div key={b.l} className="flex flex-1 flex-col items-center gap-2">
                    <div className="w-full" style={{ height: `${b.h}%`, borderRadius: "5px 5px 0 0", backgroundColor: b.h === 100 ? "oklch(0.55 0.2 285)" : "oklch(0.72 0.12 285)" }} />
                    <span className="text-caption text-content-muted">{b.l}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-h3">By channel</h2>
              {TICKET_CHANNELS.map((c) => (
                <div key={c.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-body">
                    <span className="text-content-muted">{c.name}</span>
                    <span className="font-mono">{c.pct}%</span>
                  </div>
                  <Bar pct={c.pct} />
                </div>
              ))}
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-h3">Health</h2>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Avg resolution" value={TICKET_STATS.avgResolution} />
                <MiniStat label="First response" value={TICKET_STATS.firstResponse} />
                <MiniStat label="CSAT" value={TICKET_STATS.csat} tone="success" />
                <MiniStat label="Resolved by AI" value={`${TICKET_STATS.resolvedByAI}%`} />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {TICKET_PRIOS.map((p) => (
                  <Badge key={p.name} tone={p.tone}>{p.name} · {p.count}</Badge>
                ))}
              </div>
            </Card>
          </div>

          {/* Customer support options + escalation */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-h3">Customer support channels</h2>
              <p className="text-caption normal-case text-content-muted">
                What a shop owner can reach when they need help.
              </p>
              <div className="flex flex-col divide-y divide-border">
                {SUPPORT_OPTIONS.map((o) => (
                  <div key={o.name} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-body font-medium">{o.name}</span>
                      <span className="text-caption normal-case text-content-muted">{o.detail}</span>
                    </div>
                    <Badge tone={o.tone}>{o.channel}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="text-h3">Escalation ladder</h2>
              <p className="text-caption normal-case text-content-muted">Automatic when the previous step can&apos;t resolve.</p>
              <div className="flex flex-col gap-2">
                <Escala n="1" title="AI chatbot" detail="in-app + WhatsApp · resolves 68%" />
                <Escala n="2" title="Virtual assistant (human)" detail="call / screen-share · 29%" />
                <Escala n="3" title="Physical assistant" detail="on-site visit · hardware & setup · 3%" />
              </div>
            </Card>
          </div>

          {/* Ticket queue */}
          <Section title="Ticket queue">
            <Card className="p-0">
              <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-caption font-semibold uppercase text-content-muted">
                <span className="col-span-1">ID</span>
                <span className="col-span-3">Tenant</span>
                <span className="col-span-3">Subject</span>
                <span className="col-span-2">Channel</span>
                <span className="col-span-1">Prio</span>
                <span className="col-span-1">SLA</span>
                <span className="col-span-1 text-right">Status</span>
              </div>
              <div className="divide-y divide-border">
                {TICKETS.map((t) => (
                  <div key={t.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                    <span className="col-span-1 font-mono text-caption text-content-muted">{t.id}</span>
                    <span className="col-span-3 text-body">{t.org}</span>
                    <span className="col-span-3 truncate text-body text-content-muted">{t.subject}</span>
                    <span className="col-span-2 text-caption normal-case text-content-muted">{t.ch}</span>
                    <span className="col-span-1">
                      <Badge tone={t.prio === "High" ? "danger" : t.prio === "Medium" ? "warning" : "neutral"}>{t.prio}</Badge>
                    </span>
                    <span className="col-span-1">
                      <span className="size-2.5 rounded-pill inline-block" title={t.sla} style={{ backgroundColor: t.sla === "ok" ? "oklch(0.62 0.17 150)" : t.sla === "risk" ? "oklch(0.70 0.16 75)" : "oklch(0.58 0.22 25)" }} />
                    </span>
                    <span className="col-span-1 text-right">
                      <Badge tone={t.s === "open" ? "warning" : t.s === "pending" ? "info" : "success"}>{t.s === "resolved" ? "done" : t.s}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>
        </>
      );

    case "broadcasts":
      return <BroadcastsPage />;

    case "audit":
      return (
        <Section title="Audit logs · hash-chained">
          <Card className="p-0">
            <TableHead cols={[["Actor", 3], ["Action", 3], ["Target", 4], ["Time", 2]]} />
            <div className="divide-y divide-border">
              {AUDIT.map((a, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                  <span className="col-span-3 font-mono text-caption text-content-muted">{a.actor}</span>
                  <span className="col-span-3 font-mono text-body">{a.action}</span>
                  <span className="col-span-4 text-body">{a.target}</span>
                  <span className="col-span-2 text-caption normal-case text-content-muted">{a.time}</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      );

    case "adminroles":
      return (
        <Section title="Team & roles">
          <p className="text-body text-content-muted">
            Internal team roles. Tenant data access always requires owner consent,
            regardless of role. ● full · ○ read-only · · none.
          </p>
          <Card className="p-0">
            <div
              className="grid gap-3 border-b border-border px-4 py-2.5 text-caption font-semibold uppercase text-content-muted"
              style={{ gridTemplateColumns: "2.4fr repeat(5, 1fr)" }}
            >
              <span>Capability</span>
              {ROLE_COLS.map((c) => <span key={c} className="text-center">{c}</span>)}
            </div>
            <div className="divide-y divide-border">
              {ROLES.map((r) => (
                <div
                  key={r.cap}
                  className="grid items-center gap-3 px-4 py-3"
                  style={{ gridTemplateColumns: "2.4fr repeat(5, 1fr)" }}
                >
                  <span className="text-body">{r.cap}</span>
                  {r.r.map((m, i) => (
                    <span key={i} className="text-center text-body">{matrixMark(m)}</span>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </Section>
      );
  }
}

// ---------------------------------------------------------------------------
// Broadcasts & push — interactive composer
// ---------------------------------------------------------------------------

type BcastTone = "warning" | "success" | "info" | "neutral";
const BCAST_TYPES: { id: string; label: string; emoji: string; tone: BcastTone; title: string; msg: string }[] = [
  {
    id: "maintenance", label: "Maintenance", emoji: "🛠", tone: "warning",
    title: "Scheduled maintenance",
    msg: "Vyora will be under maintenance on Sun 20 Jul, 2–3 AM IST. Billing keeps working offline; sync resumes automatically.",
  },
  {
    id: "promotion", label: "Promotion", emoji: "🎉", tone: "success",
    title: "Festive offer — 20% off",
    msg: "🎉 Festive offer! Get 20% off all annual plans this week. Upgrade from Subscription in the app — offer ends Sunday.",
  },
  {
    id: "feature", label: "New feature", emoji: "✨", tone: "info",
    title: "New: self-serve GST filing",
    msg: "New in Vyora: file GSTR-1 & 3B yourself — no CA needed. Open Reports → GST to try it.",
  },
  {
    id: "billing", label: "Billing notice", emoji: "💳", tone: "neutral",
    title: "Plan renewal reminder",
    msg: "Reminder: your annual plan renews on 12 Apr. Please make sure your payment method is up to date to avoid interruption.",
  },
];
const AUDIENCES = ["All customers · 1,284", "Trials · 182", "Monthly plans · 402", "By business type"];

function BroadcastsPage() {
  const [typeId, setTypeId] = useState(BCAST_TYPES[0]!.id);
  const active = BCAST_TYPES.find((t) => t.id === typeId)!;
  const [title, setTitle] = useState(active.title);
  const [message, setMessage] = useState(active.msg);
  const [channels, setChannels] = useState({ push: true, banner: true, whatsapp: true, email: false });
  const [audience, setAudience] = useState(AUDIENCES[0]!);
  const [sent, setSent] = useState<{ title: string; ch: string; aud: string; s: "sent" | "scheduled" }[]>(
    BROADCASTS.map((b) => ({ title: b.title, ch: b.ch, aud: b.aud, s: b.s })),
  );
  const [flash, setFlash] = useState<string | null>(null);

  function pickType(id: string) {
    setTypeId(id);
    const t = BCAST_TYPES.find((x) => x.id === id);
    if (t) { setTitle(t.title); setMessage(t.msg); }
  }

  const chLabel =
    [channels.push && "Push", channels.banner && "In-app", channels.whatsapp && "WhatsApp", channels.email && "Email"]
      .filter(Boolean).join(" · ") || "No channel";

  function fire(status: "sent" | "scheduled") {
    setSent((s) => [{ title: title.trim() || active.title, ch: chLabel, aud: audience, s: status }, ...s]);
    setFlash(status === "sent" ? "Broadcast sent to " + audience : "Broadcast scheduled for " + audience);
    window.setTimeout(() => setFlash(null), 2600);
  }

  const toggle = (k: keyof typeof channels) => setChannels((c) => ({ ...c, [k]: !c[k] }));

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Composer */}
        <Card className="flex flex-col gap-4 p-5 lg:col-span-2">
          <h2 className="text-h3">New broadcast</h2>

          <div className="flex flex-wrap gap-2">
            {BCAST_TYPES.map((t) => {
              const on = t.id === typeId;
              return (
                <button
                  key={t.id}
                  onClick={() => pickType(t.id)}
                  className="rounded-pill border px-3 py-1.5 text-caption transition-colors"
                  style={{
                    borderColor: on ? "transparent" : "var(--border, oklch(0.9 0.01 285))",
                    backgroundColor: on ? "oklch(0.93 0.05 285)" : "transparent",
                    color: on ? "oklch(0.42 0.16 285)" : "inherit",
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  {t.emoji} {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-caption font-medium uppercase text-content-muted" htmlFor="b-title">Title</label>
            <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-caption font-medium uppercase text-content-muted" htmlFor="b-msg">Message</label>
            <textarea
              id="b-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="rounded-input border border-border bg-surface px-3 py-2 text-body text-content outline-none focus-visible:border-primary focus-visible:shadow-focus"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium uppercase text-content-muted">Channels</span>
            <div className="flex flex-wrap gap-2">
              {([["push", "Push"], ["banner", "In-app banner"], ["whatsapp", "WhatsApp"], ["email", "Email"]] as [keyof typeof channels, string][]).map(([k, label]) => {
                const on = channels[k];
                return (
                  <button
                    key={k}
                    onClick={() => toggle(k)}
                    className="rounded-pill border px-3 py-1 text-caption transition-colors"
                    style={{
                      borderColor: on ? "transparent" : "oklch(0.9 0.01 285)",
                      backgroundColor: on ? "oklch(0.55 0.2 285)" : "transparent",
                      color: on ? "white" : "inherit",
                    }}
                  >
                    {on ? "✓ " : ""}{label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-caption font-medium uppercase text-content-muted">Audience</span>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => {
                const on = a === audience;
                return (
                  <button
                    key={a}
                    onClick={() => setAudience(a)}
                    className="rounded-pill border px-3 py-1 text-caption transition-colors"
                    style={{
                      borderColor: on ? "transparent" : "oklch(0.9 0.01 285)",
                      backgroundColor: on ? "oklch(0.93 0.05 285)" : "transparent",
                      color: on ? "oklch(0.42 0.16 285)" : "inherit",
                      fontWeight: on ? 600 : 400,
                    }}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={() => fire("sent")}>Send now</Button>
            <Button variant="outline" onClick={() => fire("scheduled")}>Schedule</Button>
            {flash ? <span className="text-caption normal-case text-success">{flash}</span> : null}
          </div>
        </Card>

        {/* Push preview */}
        <div className="flex flex-col gap-3">
          <span className="text-caption font-medium uppercase text-content-muted">Push preview</span>
          <div className="rounded-card border border-border bg-canvas p-4 shadow-card">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-control font-mono text-body font-semibold text-white" style={{ backgroundColor: "oklch(0.55 0.2 285)" }}>V</span>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-body font-semibold">Vyora</span>
                  <span className="text-caption text-content-muted">now</span>
                </div>
                <span className="text-body font-medium">{active.emoji} {title || active.title}</span>
                <span className="text-caption normal-case text-content-muted">{message}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={active.tone}>{active.label}</Badge>
            <Badge tone="neutral">{chLabel}</Badge>
          </div>
          <p className="text-caption normal-case text-content-muted">
            Push is delivered via the PWA + WhatsApp Cloud API. Offline devices
            receive it on next sync.
          </p>
        </div>
      </div>

      <Section title="Recent broadcasts">
        <Card className="flex flex-col divide-y divide-border p-0">
          {sent.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="flex flex-col">
                <span className="text-body font-medium">{b.title}</span>
                <span className="text-caption normal-case text-content-muted">{b.ch} · {b.aud}</span>
              </div>
              <Badge tone={b.s === "sent" ? "success" : "info"}>{b.s}</Badge>
            </div>
          ))}
        </Card>
      </Section>
    </>
  );
}

function HealthCard({ title, rows }: { title: string; rows: { l: string; v: string; s: Sev }[] }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-h3">{title}</h2>
      <div className="flex flex-col divide-y divide-border">
        {rows.map((h) => (
          <div key={h.l} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-pill" style={{ backgroundColor: sevColor(h.s) }} />
              <span className="text-body text-content-muted">{h.l}</span>
            </div>
            <span className="font-mono text-body">{h.v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TableHead({ cols }: { cols: [string, number][] }) {
  return (
    <div className="grid grid-cols-12 gap-3 border-b border-border px-4 py-2.5 text-caption font-semibold uppercase text-content-muted">
      {cols.map(([label, span]) => (
        <span key={label} style={{ gridColumn: `span ${span} / span ${span}` }}>
          {label}
        </span>
      ))}
    </div>
  );
}

function FormField({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-canvas px-3 py-2">
      <span className="text-caption normal-case text-content-muted">{label}</span>
      <span className="text-body">{hint}</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-canvas p-4">
      <span className="text-caption normal-case text-content-muted">{label}</span>
      <span className={"font-mono text-body-lg " + color}>{value}</span>
    </div>
  );
}

function Escala({ n, title, detail }: { n: string; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-border bg-canvas px-3 py-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-pill font-mono text-caption font-semibold text-white" style={{ backgroundColor: "oklch(0.55 0.2 285)" }}>{n}</span>
      <span className="text-body font-medium">{title}</span>
      <span className="text-caption normal-case text-content-muted">{detail}</span>
    </div>
  );
}
