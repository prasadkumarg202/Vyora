"use client";

import { Badge, Button, Card } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * Install Vyora (used by /download).
 *
 * Vyora is a PWA, so "installing" it drops a real app on Windows, macOS and
 * Android — its own window, a Start-menu / Applications / home-screen icon, and
 * full offline use — with no app store and no separate download. Chromium
 * browsers fire `beforeinstallprompt`, which we capture to offer a one-click
 * Install button; Safari/iOS don't, so we show the exact Add-to-Home steps.
 * A signed native .exe/.dmg (via Tauri) can wrap this same app later; the note
 * at the bottom says so honestly rather than faking a download link.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type OS = "windows" | "mac" | "android" | "ios" | "other";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return "other";
}

const PLATFORMS: { os: OS; name: string; emoji: string; steps: string }[] = [
  { os: "windows", name: "Windows", emoji: "🪟", steps: "Open in Chrome or Edge → click Install below, or the install icon (⊕) in the address bar. Vyora lands in your Start menu." },
  { os: "mac", name: "macOS", emoji: "🍎", steps: "Chrome or Edge → click Install below. In Safari, use File → Add to Dock. Vyora opens in its own window." },
  { os: "android", name: "Android", emoji: "🤖", steps: "Open in Chrome → tap Install below, or menu (⋮) → Install app / Add to Home screen." },
  { os: "ios", name: "iPhone / iPad", emoji: "📱", steps: "Open in Safari → tap Share → Add to Home Screen. It installs like a native app." },
];

export function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [os, setOs] = useState<OS>("other");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    setOs(detectOS());
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) {
      setHint(
        os === "ios"
          ? "On iPhone/iPad: tap the Share button, then “Add to Home Screen”."
          : "Your browser doesn't offer one-click install here — use the browser menu → “Install app”, or open Vyora in Chrome or Edge.",
      );
      return;
    }
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } finally {
      setBusy(false);
    }
  }, [deferred, os]);

  if (installed) {
    return (
      <Card className="flex flex-col items-center gap-2 p-8 text-center">
        <span className="text-3xl">✅</span>
        <h2 className="text-h3">Vyora is installed</h2>
        <p className="text-body text-content-muted">
          Launch it from your Start menu, Applications or home screen — it works offline.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Primary CTA */}
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-card bg-primary text-h2 font-bold text-white">V</span>
        <h2 className="text-h2">Install Vyora on your device</h2>
        <p className="max-w-md text-body text-content-muted">
          One tap installs the full app — own window, offline billing, no app store.
          {deferred ? "" : " If the button below doesn't prompt, follow your platform's steps."}
        </p>
        <Button size="lg" onClick={install} disabled={busy}>
          {busy ? "Installing…" : deferred ? "Install Vyora" : "Install app"}
        </Button>
        {deferred ? <Badge tone="success" dot>Ready to install</Badge> : null}
        {hint ? (
          <p className="max-w-md rounded-control border border-border bg-canvas px-3 py-2 text-caption normal-case text-content-muted">
            {hint}
          </p>
        ) : null}
      </Card>

      {/* Per-platform */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLATFORMS.map((p) => {
          const here = p.os === os;
          return (
            <Card
              key={p.os}
              className="flex flex-col gap-2 p-5"
              style={here ? { borderColor: "oklch(0.52 0.2 285)" } : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{p.emoji}</span>
                {here ? <Badge tone="primary">Your device</Badge> : null}
              </div>
              <h3 className="text-body font-semibold">{p.name}</h3>
              <p className="text-caption normal-case text-content-muted">{p.steps}</p>
            </Card>
          );
        })}
      </div>

      <p className="text-caption normal-case text-content-muted">
        Prefer a classic signed installer (.exe / .dmg)? Vyora can be wrapped as a
        native desktop app with Tauri — same code, distributed as a downloadable
        file. Ask us to enable it for your rollout.
      </p>
    </div>
  );
}
