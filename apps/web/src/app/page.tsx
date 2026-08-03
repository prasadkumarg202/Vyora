import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getTenantSession } from "~/lib/auth/session";
import { WINDOWS_INSTALLER_URL } from "~/lib/downloads";

export const metadata: Metadata = {
  title: "Vyora — GST Billing & Business OS for Indian Small Businesses",
  description:
    "Easy GST billing, inventory, payments and accounting that work fully offline. Voice billing, Scan & Sell, UPI and WhatsApp built in — tailored to your trade. Download Vyora for Windows free.",
};

const TRUST_BADGES = [
  "GST-ready billing",
  "Works fully offline",
  "UPI & WhatsApp built in",
  "Tailored to 18 trades",
];

const JOURNEY = [
  {
    step: "01",
    time: "08:00 AM · OPENING UP",
    title: "Start anywhere",
    text: "Open Vyora on your phone on the way to the shop. At the counter, the same data is on your desktop — everything stays in sync.",
    tag: "Multi-device",
  },
  {
    step: "02",
    time: "11:00 AM · RUSH HOUR",
    title: "Bill at counter speed",
    text: "Scan a barcode and sell, or just speak the bill — Vyora's AI turns your words into a proper GST invoice in seconds.",
    tag: "Scan & Sell + Voice Billing",
  },
  {
    step: "03",
    time: "04:00 PM · NET DOWN",
    title: "Keep billing without internet",
    text: "The queue keeps moving even with zero network. Bills save to the database on your own device and sync when you are back online.",
    tag: "Offline-first",
  },
  {
    step: "04",
    time: "09:00 PM · CLOSING TIME",
    title: "Day book done, data safe",
    text: "See the day's sales, outstanding payments and stock at a glance. Your records live on your device and back up to the cloud.",
    tag: "Auto cloud sync",
  },
];

const STATS = [
  { value: "18", label: "trade verticals, each with its own forms" },
  { value: "0", label: "internet needed to bill" },
  { value: "100%", label: "your data, on your device" },
  { value: "1 tap", label: "UPI QR & WhatsApp on every invoice" },
];

const FEATURES = [
  { icon: "🧾", title: "GST invoicing", text: "HSN codes, CGST/SGST, amount-in-words and printable tax invoices — filing-ready GSTR-1 CSV export included." },
  { icon: "🎙️", title: "Voice billing", text: "Speak the bill in your language; Vyora's AI drafts the invoice for you." },
  { icon: "📷", title: "Scan & Sell POS", text: "Point the camera at a barcode and sell — fast counter billing without extra hardware." },
  { icon: "🧾", title: "Snap Bill (OCR)", text: "Photograph a paper purchase bill and Vyora captures the items and amounts automatically." },
  { icon: "🇮🇳", title: "UPI on every invoice", text: "UPI QR and payment deep links printed on the bill — collect payments instantly, even offline." },
  { icon: "💬", title: "WhatsApp sharing", text: "Send invoices, payment reminders and festival offers to customers straight on WhatsApp." },
  { icon: "📦", title: "Inventory & Stock Radar", text: "Live stock levels, low-stock alerts and trade-aware item fields like batch and expiry for chemists." },
  { icon: "📈", title: "Reports suite", text: "Sales, purchases, P&L, GST reports, Day Book and party outstanding aging — a full picture of the business." },
  { icon: "🤝", title: "Credit Radar", text: "Track udhaar with a Bharosa score for every party, so you know who to extend credit to." },
  { icon: "🧮", title: "Expenses & suppliers", text: "Record expenses and supplier purchases alongside sales, so accounting stays in one place." },
  { icon: "📣", title: "Promotions studio", text: "Festival and offer templates with AI-written copy, ready for WhatsApp and SMS campaigns." },
  { icon: "🏪", title: "Made for your trade", text: "Choose Medical Store, Kirana, Electronics and more — every field, invoice and report reshapes to fit." },
];

const INDUSTRIES = [
  { icon: "🛒", name: "Kirana & grocery" },
  { icon: "💊", name: "Medical & pharmacy" },
  { icon: "📱", name: "Mobile & electronics" },
  { icon: "👗", name: "Cloth & garments" },
  { icon: "💍", name: "Jewellery" },
  { icon: "🍽️", name: "Restaurants & cafes" },
  { icon: "🏬", name: "Supermarkets" },
  { icon: "🔩", name: "Hardware & electricals" },
  { icon: "📚", name: "Stationery & books" },
  { icon: "🚗", name: "Auto parts & garages" },
  { icon: "💇", name: "Salons & services" },
  { icon: "🏭", name: "Small manufacturers" },
];

const SETUP_STEPS = [
  { step: "1", title: "Download & install", text: "Get the Windows app below, or install Vyora on any phone straight from the browser." },
  { step: "2", title: "Pick your trade", text: "Choose your business type — Vyora shapes every form, invoice and report to fit it." },
  { step: "3", title: "Add your items", text: "Enter products or services with prices and GST rates, or scan them in." },
  { step: "4", title: "Start billing", text: "Create your first GST invoice, share it on WhatsApp, and watch the reports build themselves." },
];

const FAQS = [
  {
    q: "What is Vyora?",
    a: "Vyora is a billing and business management app for Indian small businesses. It handles GST invoices, inventory, payments, credit, expenses and reports in one place, on desktop and mobile.",
  },
  {
    q: "Does Vyora really work without internet?",
    a: "Yes. Vyora is offline-first: your records are stored in a database on your own device, so billing and stock work with zero network. Everything syncs to the cloud automatically when you reconnect.",
  },
  {
    q: "Is my business data safe?",
    a: "Your data lives on your device first, and syncs to your account in the cloud. You can export your records anytime — there is no lock-in.",
  },
  {
    q: "Can I create GST invoices and reports?",
    a: "Yes. Vyora creates GST-compliant tax invoices with HSN codes and CGST/SGST, and produces GST reports including B2B/B2C summaries and a GSTR-1 CSV your CA can use for filing.",
  },
  {
    q: "Which businesses can use Vyora?",
    a: "Kirana stores, medical stores, electronics and mobile shops, cloth shops, jewellers, restaurants, hardware stores and more — 18 trade verticals, each with forms and invoices shaped to that trade.",
  },
  {
    q: "Does it work on mobile as well as Windows?",
    a: "Yes. The Windows app installs from this website. On Android, iPhone and Mac, Vyora installs straight from the browser in one tap — same app, same data, no app store needed.",
  },
  {
    q: "Can I share invoices and collect payments?",
    a: "Every invoice carries a UPI QR code and payment link, and can be sent to the customer on WhatsApp in one tap — so you get paid faster.",
  },
  {
    q: "What does Vyora cost?",
    a: "Vyora is free to download and use while in early access. Paid plans will be announced later, and early users will be the first to know.",
  },
];

export default async function IndexPage() {
  // Signed-in users go straight to the app; visitors see the site.
  let signedIn = false;
  try {
    signedIn = (await getTenantSession()) !== null;
  } catch {
    // Supabase not configured (fresh checkout) — just show the landing page.
  }
  if (signedIn) redirect("/dashboard");

  return (
    <main className="min-h-dvh bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 sm:px-10">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-control bg-primary text-body font-bold text-white">V</span>
            <span className="text-body-lg font-semibold">Vyora</span>
          </Link>
          <nav className="flex items-center gap-5">
            <a href="#features" className="hidden text-body text-content-muted hover:text-primary md:block">Features</a>
            <a href="#industries" className="hidden text-body text-content-muted hover:text-primary md:block">Industries</a>
            <a href="#faq" className="hidden text-body text-content-muted hover:text-primary md:block">FAQ</a>
            <Link href="/download" className="hidden text-body text-content-muted hover:text-primary sm:block">Download</Link>
            <Link href="/login" className="rounded-control bg-primary px-4 py-1.5 text-body font-medium text-white hover:opacity-90">Login</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-14 text-center sm:px-10 sm:py-20">
        <span className="rounded-control border border-border bg-surface px-4 py-1.5 text-caption font-medium text-primary shadow-card">
          Offline-first · AI-first · Made for Indian MSMEs
        </span>
        <h1 className="max-w-3xl text-h1">
          Best GST Billing Software for Small Businesses
        </h1>
        <p className="max-w-2xl text-body-lg text-content-muted">
          Easy GST billing, inventory, payments and accounting — even with no
          internet. Voice billing, Scan &amp; Sell, UPI and WhatsApp built in,
          tailored to your trade.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <a
            href={WINDOWS_INSTALLER_URL}
            className="rounded-control bg-primary px-8 py-3 text-body-lg font-semibold text-white shadow-card transition-opacity hover:opacity-90"
          >
            🪟 Download Vyora Now
          </a>
          <Link
            href="/download"
            className="rounded-control border border-border bg-surface px-8 py-3 text-body-lg font-semibold text-primary shadow-card hover:underline"
          >
            📱 Try the mobile app
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {TRUST_BADGES.map((b) => (
            <span key={b} className="rounded-control border border-border bg-surface px-3 py-1 text-caption normal-case text-content-muted">
              ✓ {b}
            </span>
          ))}
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 text-center sm:px-10 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <span className="text-h2 text-primary">{s.value}</span>
              <span className="text-caption normal-case text-content-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Business journey */}
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 sm:px-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-h2">Your business day, simpler &amp; safer</h2>
          <p className="max-w-xl text-body text-content-muted">
            Vyora supports you from the moment you open your shop until you
            close for the day.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map((j) => (
            <div key={j.step} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-6 shadow-card">
              <span className="text-h2 font-bold text-primary">{j.step}</span>
              <span className="text-caption font-medium text-content-muted">{j.time}</span>
              <h3 className="text-body-lg font-semibold">{j.title}</h3>
              <p className="text-body text-content-muted">{j.text}</p>
              <span className="mt-auto pt-2 text-caption font-medium normal-case text-primary">{j.tag} ›</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 sm:px-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-h2">Billing features built for Indian SME owners</h2>
            <p className="max-w-xl text-body text-content-muted">
              Everything you expect from the best billing software — in one app,
              working online and offline.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col gap-2 rounded-card border border-border bg-canvas p-6">
                <span className="text-3xl">{f.icon}</span>
                <h3 className="text-body-lg font-semibold">{f.title}</h3>
                <p className="text-body text-content-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 sm:px-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-h2">One billing software across industries</h2>
          <p className="max-w-xl text-body text-content-muted">
            Choosing your trade actually reshapes every field, invoice and
            report — batch and expiry for chemists, variants for cloth shops,
            and more.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {INDUSTRIES.map((i) => (
            <div key={i.name} className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
              <span className="text-2xl">{i.icon}</span>
              <span className="text-body font-medium">{i.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Setup steps */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 sm:px-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-h2">Start billing in minutes</h2>
            <p className="max-w-xl text-body text-content-muted">
              No accountant needed. Four steps and your first GST invoice is out.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SETUP_STEPS.map((s) => (
              <div key={s.step} className="flex flex-col gap-2 rounded-card border border-border bg-canvas p-6">
                <span className="flex size-9 items-center justify-center rounded-control bg-primary text-body-lg font-bold text-white">{s.step}</span>
                <h3 className="text-body-lg font-semibold">{s.title}</h3>
                <p className="text-body text-content-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mobile / all devices */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-14 text-center sm:px-10">
        <h2 className="text-h2">Run your business from any device</h2>
        <p className="max-w-2xl text-body-lg text-content-muted">
          A classic installer for Windows, and a one-tap install on Android,
          iPhone and Mac straight from the browser — no app store, always the
          latest version, same data everywhere.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <a
            href={WINDOWS_INSTALLER_URL}
            className="rounded-control bg-primary px-8 py-3 text-body-lg font-semibold text-white shadow-card transition-opacity hover:opacity-90"
          >
            Download for Windows
          </a>
          <Link href="/download" className="rounded-control border border-border bg-surface px-8 py-3 text-body-lg font-semibold text-primary shadow-card hover:underline">
            Install on phone or Mac →
          </Link>
        </div>
        <p className="text-caption normal-case text-content-muted">
          Free while in early access · Works offline · Your data stays yours
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-14 sm:px-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-h2">Frequently asked questions</h2>
            <p className="max-w-xl text-body text-content-muted">
              Quick answers about billing, GST compliance and how Vyora works.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-card border border-border bg-canvas p-5">
                <summary className="cursor-pointer list-none text-body-lg font-semibold marker:hidden">
                  {f.q}
                </summary>
                <p className="pt-2 text-body text-content-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-14 text-center sm:px-10">
        <div className="flex w-full flex-col items-center gap-4 rounded-card border border-border bg-surface p-10 shadow-card">
          <h2 className="text-h2">Ready to simplify your billing?</h2>
          <p className="max-w-xl text-body text-content-muted">
            Download Vyora and create your first GST invoice today — free, and
            it works even when the internet does not.
          </p>
          <a
            href={WINDOWS_INSTALLER_URL}
            className="rounded-control bg-primary px-8 py-3 text-body-lg font-semibold text-white shadow-card transition-opacity hover:opacity-90"
          >
            Download Vyora Now
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-2 sm:px-10 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-control bg-primary text-caption font-bold text-white">V</span>
              <span className="text-body-lg font-semibold">Vyora</span>
            </div>
            <p className="text-caption normal-case text-content-muted">
              The offline-first, AI-first Business OS for Indian small
              businesses.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-body font-semibold">Product</h3>
            <a href="#features" className="text-caption normal-case text-content-muted hover:text-primary">Features</a>
            <a href="#industries" className="text-caption normal-case text-content-muted hover:text-primary">Industries</a>
            <Link href="/download" className="text-caption normal-case text-content-muted hover:text-primary">Download</Link>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-body font-semibold">App</h3>
            <Link href="/login" className="text-caption normal-case text-content-muted hover:text-primary">Login</Link>
            <Link href="/support" className="text-caption normal-case text-content-muted hover:text-primary">Support</Link>
            <a href="#faq" className="text-caption normal-case text-content-muted hover:text-primary">FAQ</a>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-body font-semibold">Get Vyora</h3>
            <a href={WINDOWS_INSTALLER_URL} className="text-caption normal-case text-content-muted hover:text-primary">Windows (.exe)</a>
            <Link href="/download" className="text-caption normal-case text-content-muted hover:text-primary">Android / iPhone / Mac</Link>
          </div>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-6 py-4 text-center text-caption normal-case text-content-muted sm:px-10">
            © 2026 Vyora · Made in India for Indian businesses
          </p>
        </div>
      </footer>
    </main>
  );
}
