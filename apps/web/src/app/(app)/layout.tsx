import { redirect } from "next/navigation";

import { BottomNav } from "~/components/bottom-nav";
import { EntitlementProvider } from "~/components/billing/entitlement-provider";
import { TrialBanner } from "~/components/billing/trial-banner";
import { WorkspaceLocked } from "~/components/billing/workspace-locked";
import { Sidebar } from "~/components/sidebar";
import { SyncPill } from "~/components/sync-pill";
import { ThemeToggle } from "~/components/theme-toggle";
import { UserMenu } from "~/components/auth/user-menu";
import { getTenantSession } from "~/lib/auth/session";
import { loadEntitlement } from "~/lib/billing/state";

/**
 * The app shell: a fixed frame around a scrolling content area, so the nav and
 * sync pill survive navigation and the shell can be precached for offline use.
 *
 * Also the auth gate. Middleware already redirects anonymous requests, but this
 * re-checks rather than trusting it: middleware is routing, not authorisation,
 * and a matcher change should not silently expose the whole app.
 *
 * The entitlement is resolved here, once per navigation, and handed down. Doing
 * it per screen would mean a dozen round trips and a dozen chances to forget.
 * What reaches the browser only decides what looks locked; each gated page
 * re-checks on the server before it renders anything premium.
 *
 * It is also where the workspace lock lands. A locked workspace never renders
 * `children` at all — no sidebar, no module, no route to guess at. Putting it
 * here rather than in each page is the whole reason it can be trusted: there
 * is no screen inside the app that can forget to check, because there is no
 * screen inside the app.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getTenantSession();

  if (!session) {
    redirect("/login");
  }

  // Signed in but no workspace yet — nothing here can render, because every
  // tenant query would return empty via RLS.
  if (!session.orgId) {
    redirect("/welcome");
  }

  const entitlement = await loadEntitlement(session.orgId);

  return (
    <EntitlementProvider entitlement={entitlement}>
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
          <div className="flex items-center gap-3">
            <SyncPill />
            <ThemeToggle />
            <UserMenu email={session.email} role={session.orgRole} />
          </div>
        </header>

        <TrialBanner entitlement={entitlement} />

        {entitlement.isLocked ? (
          <div className="flex-1 overflow-y-auto">
            <WorkspaceLocked
              entitlement={entitlement}
              orgId={session.orgId}
              isOwner={session.orgRole === "owner"}
            />
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1">
              <Sidebar />
              <main className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
                {children}
              </main>
            </div>

            <BottomNav />
          </>
        )}
      </div>
    </EntitlementProvider>
  );
}
