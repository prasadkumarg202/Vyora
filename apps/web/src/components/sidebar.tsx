"use client";

import { can, isPlanned } from "@vyora/core";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useEntitlement } from "~/components/billing/entitlement-provider";
import { NAV_ZONES } from "~/config/navigation";

/**
 * Desktop zone navigation. Shows every module in the catalogue; Phase 5 filters
 * it through the workspace's metadata and the role-visibility matrix.
 *
 * Locked modules stay visible rather than disappearing. A shopkeeper who cannot
 * find Voice Billing after their trial ends will conclude the app is broken; one
 * who sees it with a lock understands in a second — and can still open it to
 * read what it does and what it would cost.
 */
export function Sidebar() {
  const pathname = usePathname();
  const entitlement = useEntitlement();

  return (
    <nav
      aria-label="Main"
      className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-surface md:block"
    >
      <div className="flex flex-col gap-6 p-4">
        {NAV_ZONES.map((zone) => (
          <div key={zone.id} className="flex flex-col gap-1">
            <div className="px-2 pb-1">
              <span className="font-mono text-caption uppercase tracking-wide text-content-muted">
                {zone.ordinal} · {zone.label}
              </span>
            </div>
            {zone.modules.map((entry) => {
              const active = pathname === entry.href;
              // A feature that is merely planned is nobody's paywall — it does
              // not get a lock, because there is nothing to buy.
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
    </nav>
  );
}
