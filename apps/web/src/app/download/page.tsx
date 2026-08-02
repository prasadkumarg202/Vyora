import type { Metadata } from "next";
import Link from "next/link";

import { InstallApp } from "~/components/install-app";
import { WINDOWS_INSTALLER_URL } from "~/lib/downloads";

export const metadata: Metadata = {
  title: "Download & Install",
  description:
    "Download Vyora for Windows (.exe) or install on macOS, Android and iPhone — works offline.",
};

const BENEFITS = [
  { icon: "📴", title: "Works offline", text: "Bill and manage stock with no internet. Syncs when you reconnect." },
  { icon: "🪟", title: "Own app window", text: "Opens like a native app — Start menu, Dock or home-screen icon." },
  { icon: "🔒", title: "Your data stays yours", text: "Records live on your device; export anytime, no lock-in." },
  { icon: "⚡", title: "Always up to date", text: "The app loads the latest Vyora automatically — nothing to reinstall." },
];

export default function DownloadPage() {
  return (
    <main className="min-h-dvh bg-canvas">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-control bg-primary text-body font-bold text-white">V</span>
          <span className="text-body-lg font-semibold">Vyora</span>
        </Link>
        <Link href="/login" className="text-body font-medium text-primary hover:underline">
          Open web app →
        </Link>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-8 sm:px-10">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-h1">Get the Vyora app</h1>
          <p className="max-w-xl text-body-lg text-content-muted">
            The offline-first Business OS for Indian shops — a classic Windows
            installer, or a one-tap install on any other device.
          </p>
        </div>

        {/* Windows installer — the headline download */}
        <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-8 text-center shadow-card">
          <span className="text-4xl">🪟</span>
          <h2 className="text-h2">Download for Windows</h2>
          <p className="max-w-md text-body text-content-muted">
            Classic desktop installer — double-click <strong>Vyora-Setup.exe</strong>,
            and Vyora lands in your Start menu with full offline billing.
          </p>
          <a
            href={WINDOWS_INSTALLER_URL}
            className="rounded-control bg-primary px-8 py-3 text-body-lg font-semibold text-white shadow-card transition-opacity hover:opacity-90"
          >
            Download Vyora-Setup.exe
          </a>
          <p className="text-caption normal-case text-content-muted">
            Free · Windows 10/11 (64-bit) · Latest version, always
          </p>
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-h3">On Mac, Android or iPhone?</h2>
          <p className="text-body text-content-muted">
            Install Vyora straight from the browser — same app, no download store.
          </p>
        </div>

        <InstallApp />

        {/* Benefits */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <div key={b.title} className="flex flex-col gap-1 rounded-card border border-border bg-surface p-5 shadow-card">
              <span className="text-2xl">{b.icon}</span>
              <h3 className="text-body font-semibold">{b.title}</h3>
              <p className="text-caption normal-case text-content-muted">{b.text}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
