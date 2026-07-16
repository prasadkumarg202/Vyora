import { BottomNav } from "~/components/bottom-nav";
import { Sidebar } from "~/components/sidebar";
import { SyncPill } from "~/components/sync-pill";

/**
 * The app shell: a fixed frame around a scrolling content area, so the nav and
 * sync pill survive navigation and the shell can be precached for offline use.
 *
 * Phase 3 adds the auth gate here. Phase 4 replaces this structural styling
 * with the real design-system components.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 bg-band px-4 text-white">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary text-body font-bold"
          >
            V
          </span>
          <span className="text-body font-semibold">Vyora</span>
        </div>
        <SyncPill />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
