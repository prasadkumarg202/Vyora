"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MOBILE_NAV } from "~/config/navigation";

/**
 * Mobile bottom nav: ≤5 items with a centre FAB, per the design spec. The FAB's
 * action is metadata-driven (the workspace's primary create action) and is
 * wired up with the Sales module in Phase 7.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [first, second, ...rest] = MOBILE_NAV;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
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

      {rest.map((entry) => (
        <BottomNavItem key={entry.href} entry={entry} active={pathname === entry.href} />
      ))}
    </nav>
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
