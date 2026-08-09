"use client";

import { can, isPlanned } from "@vyora/core";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useEntitlement } from "~/components/billing/entitlement-provider";
import { MOBILE_NAV, NAV_ZONES } from "~/config/navigation";

/**
 * Mobile bottom nav: four destinations around a centre FAB, per the design
 * spec. The FAB's action is metadata-driven (the workspace's primary create
 * action) and is wired up with the Sales module in Phase 7.
 *
 * The last slot is deliberately not a destination but a door. A bar can hold
 * five things; the catalogue holds thirty-odd. Without this, Customers,
 * Suppliers, Reports, GST — everything outside the four favourites — was
 * reachable on a phone only by typing the URL, which is to say not reachable at
 * all for the shopkeeper this is built for. The sidebar covers it on a desktop
 * and is hidden below `md`, so the phone was the one place with no way through.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [first, second, third] = MOBILE_NAV;

  // Arriving somewhere is the sheet's job finished. Closing on the path change
  // rather than in the click handler also covers the back button.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {open ? <ModuleSheet pathname={pathname} onClose={() => setOpen(false)} /> : null}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {[first, second].map((entry) =>
          entry ? <BottomNavItem key={entry.href} entry={entry} active={pathname === entry.href} /> : null,
        )}

        <button
          type="button"
          aria-label="Create"
          className="-mt-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-pill bg-primary text-2xl text-white shadow-card transition-colors hover:bg-primary-hover"
        >
          +
        </button>

        {third ? <BottomNavItem entry={third} active={pathname === third.href} /> : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="nav-more"
          className={
            "flex min-h-touch min-w-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-caption " +
            (open ? "text-primary" : "text-content-muted")
          }
        >
          More
        </button>
      </nav>
    </>
  );
}

/**
 * Every module, grouped the way the sidebar groups them, so the two navigations
 * teach the same map of the product rather than two competing ones.
 */
function ModuleSheet({
  pathname,
  onClose,
}: {
  pathname: string;
  onClose: () => void;
}) {
  const entitlement = useEntitlement();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All modules"
      className="fixed inset-0 z-40 md:hidden"
    >
      {/* A scrim that is also the dismiss target — tapping beside a sheet to
          close it is the gesture people already have. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col rounded-t-card border-t border-border bg-surface shadow-card">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-h3">All modules</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-touch px-2 text-body font-medium text-primary"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
          {NAV_ZONES.map((zone) => (
            <div key={zone.id} className="flex flex-col gap-1">
              <div className="px-2 pb-1">
                <span className="font-mono text-caption uppercase tracking-wide text-content-muted">
                  {zone.ordinal} · {zone.label}
                </span>
              </div>
              {zone.modules.map((entry) => {
                const active = pathname === entry.href;
                // Same rule as the sidebar: a merely planned feature is nobody's
                // paywall, so it gets no lock.
                const locked = entry.feature
                  ? !can(entitlement, entry.feature) && !isPlanned(entry.feature)
                  : false;
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "flex min-h-touch items-center justify-between gap-2 rounded-control px-2 text-body transition-colors " +
                      (active
                        ? "bg-primary-tonal font-medium text-primary"
                        : "text-content hover:bg-canvas")
                    }
                  >
                    <span className={locked ? "text-content-muted" : undefined}>
                      {entry.label}
                    </span>
                    {locked ? (
                      <span
                        title="Needs a paid plan"
                        className="text-caption text-content-muted"
                      >
                        <span aria-hidden>🔒</span>
                        <span className="sr-only">Needs a paid plan</span>
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BottomNavItem({
  entry,
  active,
}: {
  entry: (typeof MOBILE_NAV)[number];
  active: boolean;
}) {
  return (
    <Link
      href={entry.href}
      aria-current={active ? "page" : undefined}
      className={
        "flex min-h-touch min-w-touch flex-1 flex-col items-center justify-center gap-1 py-2 text-caption " +
        (active ? "text-primary" : "text-content-muted")
      }
    >
      {entry.label}
    </Link>
  );
}
