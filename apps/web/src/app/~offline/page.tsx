import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

/**
 * Navigation fallback when a page isn't cached and the network is gone.
 *
 * Reaching this is the exception, not the rule: the shell and visited routes
 * are precached, and offline never blocks work that is already loaded.
 */
export default function OfflinePage() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-h2">You&apos;re offline</h1>
      <p className="max-w-sm text-body text-content-muted">
        This screen hasn&apos;t been opened on this device yet, so there&apos;s
        nothing cached to show. Anything you already have open keeps working,
        and your changes sync once you&apos;re back online.
      </p>
    </main>
  );
}
