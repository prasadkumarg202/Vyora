import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getTenantSession } from "~/lib/auth/session";
import { WINDOWS_INSTALLER_URL } from "~/lib/downloads";

export const metadata: Metadata = {
  title: "Vyora — GST Billing & Business OS for Indian Small Businesses",
  description:
    "Easy GST billing, inventory, payments and accounting that work fully offline. Voice billing, Scan & Sell, UPI and WhatsApp built in. Download Vyora for Windows free.",
};

const FEATURES = [
  { icon: "📴", title: "Works fully offline", text: "Bill, stock and report with zero internet — everything syncs to the cloud when you're back online." },
  { icon: "🧾", title: "GST-ready invoicing", text: "HSN, CGST/SGST, amount-in-words, GSTR-1 CSV export and trade-aware GST reports out of the box." },
  { icon: "🎙️", title: "Voice billing", text: "Speak the bill in your language — Vyora's AI turns it into a proper invoice in seconds." },
  { icon: "📷", title: "Scan & Sell POS", text: "Point the camera at a barcode and sell. Snap a paper bill and Vyora captures it with OCR." },
  { icon: "🇮🇳", title: "UPI & WhatsApp built in", text: "UPI QR on every invoice, payment deep links, and invoices or offers sent straight on WhatsApp." },
  { icon: "🏪", title: "Made for your trade", text: "Pick Medical Store, Kirana, Electronics… and every field, invoice and report reshapes to fit — 18 verticals." },
];

const STATS = [
  { value: "18", label: "trade verticals" },
  { value: "0", label: "internet needed to bill" },
  { value: "100%", label: "your data, on your device" },
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
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-control bg-primary text-body font-bold text-white">V</span>
          <span className="text-body-lg font-semibold">Vyora</span>
        </Link>
        <nav className="flex items-center gap-5">
          <a href="#features" className="hidden text-body text-content-muted hover:text-primary sm:block">
            Features
          </a>
          <Link href="/download" className="hidden text-body text-content-muted hover:text-primary sm:block">
            Download
          </Link>
          <Link href="/login" className="text-body font-medium text-primary hover:underline">
            Login
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-14 text-center sm:px-10 sm:py-20">
        <span className="rounded-control border border-border bg-surface px-4 py-1.5 text-caption font-medium text-primary shadow-card">
          Offline-first · AI-first · Made for Indian MSMEs
        </span>
        <h1 className="max-w-3xl text-h1">
          GST Billing &amp; Business OS for Small Businesses
        </h1>
        <p className="max-w-2xl text-body-lg text-content-muted">
          Easy GST billing, inventory, payments and accounting — even with no
          internet. Voice billing, Scan &amp; Sell and UPI built in, tailored to
          your trade.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <a
            href={WINDOWS_INSTALLER_URL}
            className="rounded-control bg-primary px-8 py-3 text-body-lg font-semibold text-white shadow-card transition-opacity hover:opacity-90"
          >
            🪟 Download Vyora for Windows
          </a>
          <Link
            href="/login"
            className="rounded-control border border-border bg-surface px-8 py-3 text-body-lg font-semibold text-primary shadow-card hover:underline"
          >
            Open web app →
          </Link>
        </div>
        <p className="text-caption normal-case text-content-muted">
          Free download · Works offline · Also on{" "}
          <Link href="/download" className="text-primary hover:underline">
            Mac, Android &amp; iPhone
          </Link>
        </p>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-4 px-6 py-8 text-center sm:px-10">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col gap-1">
              <span className="text-h2 text-primary">{s.value}</span>
              <span className="text-caption normal-case text-content-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14 sm:px-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-h2">Everything your shop runs on</h2>
          <p className="max-w-xl text-body text-content-muted">
            One app for billing, stock, GST, credit and growth — no accountant
            required to get started.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-6 shadow-card">
              <span className="text-3xl">{f.icon}</span>
              <h3 className="text-body-lg font-semibold">{f.title}</h3>
              <p className="text-body text-content-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 pb-16 text-center sm:px-10">
        <div className="flex w-full flex-col items-center gap-4 rounded-card border border-border bg-surface p-10 shadow-card">
          <h2 className="text-h2">Start billing in minutes</h2>
          <p className="max-w-xl text-body text-content-muted">
            Download the Windows app, or install Vyora on any device straight
            from the browser — your records stay on your device either way.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <a
              href={WINDOWS_INSTALLER_URL}
              className="rounded-control bg-primary px-8 py-3 text-body-lg font-semibold text-white shadow-card transition-opacity hover:opacity-90"
            >
              Download Vyora Now
            </a>
            <Link href="/download" className="text-body font-medium text-primary hover:underline">
              All platforms →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-center sm:flex-row sm:px-10 sm:text-left">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-control bg-primary text-caption font-bold text-white">V</span>
            <span className="text-body font-semibold">Vyora</span>
          </div>
          <p className="text-caption normal-case text-content-muted">
            The offline-first Business OS for Indian shops.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/download" className="text-caption text-content-muted hover:text-primary">Download</Link>
            <Link href="/login" className="text-caption text-content-muted hover:text-primary">Login</Link>
            <Link href="/support" className="text-caption text-content-muted hover:text-primary">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
