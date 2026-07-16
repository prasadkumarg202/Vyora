"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ZONES } from "~/config/navigation";

/**
 * Desktop zone navigation. Shows every module in the catalogue; Phase 5 filters
 * it through the workspace's metadata and the role-visibility matrix.
 */
export function Sidebar() {
  const pathname = usePathname();

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
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex min-h-touch items-center rounded-control px-2 text-body transition-colors " +
                    (active
                      ? "bg-primary-tonal font-medium text-primary"
                      : "text-content hover:bg-canvas")
                  }
                >
                  {entry.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
