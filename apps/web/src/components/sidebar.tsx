"use client";

import { can, isPlanned } from "@vyora/core";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useEntitlement } from "~/components/billing/entitlement-provider";
import {
  SIDEBAR_ZONES,
  zoneOpensByDefault,
  type NavZone,
} from "~/config/navigation";

/**
 * Desktop zone navigation — collapsed by default.
 *
 * It used to render all 32 modules under all 8 headings at once, which needed
 * its own scrollbar and, being a wall of text, was read by nobody: a shopkeeper
 * scanned it once and thereafter clicked the two links they had memorised. So
 * zones now collapse, and only Overview and Sell start open.
 *
 * The zone containing the current page always opens, whatever the shopkeeper
 * last collapsed. A sidebar that hides where you are standing is worse than one
 * that shows too much.
 *
 * Locked modules stay visible rather than disappearing. Someone who cannot find
 * Voice Billing after their trial ends concludes the app is broken; someone who
 * sees it with a lock understands in a second — and can still open it to read
 * what it does and what it costs.
 */

/** The zone a route belongs to, or null for a page outside the catalogue. */
function zoneIdForPath(pathname: string, zones: readonly NavZone[]): string | null {
  for (const zone of zones) {
    for (const m of zone.modules) {
      if (pathname === m.href) return zone.id;
    }
  }
  return null;
}

export function Sidebar() {
  const pathname = usePathname();
  const entitlement = useEntitlement();

  const activeZoneId = useMemo(
    () => zoneIdForPath(pathname, SIDEBAR_ZONES),
    [pathname],
  );

  const [openZones, setOpenZones] = useState<ReadonlySet<string>>(
    () => new Set(SIDEBAR_ZONES.filter((z) => zoneOpensByDefault(z.id)).map((z) => z.id)),
  );

  // Opening the zone you have navigated into is an addition, never a reset —
  // collapsing Finance and then clicking a Finance page should not also throw
  // away the fact that you had opened Catalog.
  useEffect(() => {
    if (!activeZoneId) return;
    setOpenZones((prev) => {
      if (prev.has(activeZoneId)) return prev;
      const next = new Set(prev);
      next.add(activeZoneId);
      return next;
    });
  }, [activeZoneId]);

  function toggle(zoneId: string) {
    setOpenZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  }

  return (
    <nav
      aria-label="Main"
      className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-surface md:block"
    >
      <div className="flex flex-col gap-1 p-3">
        {SIDEBAR_ZONES.map((zone) => {
          const open = openZones.has(zone.id);
          const holdsActive = zone.id === activeZoneId;
          const panelId = `zone-${zone.id}`;

          return (
            <div key={zone.id} className="flex flex-col">
              {/*
                The ordinal ("01 · ") is deliberately not printed. It is the IA
                document's reference number, and once the zones are ordered by
                daily use it would read 01, 02, 08, 05 — noise that invites the
                question "where are the missing ones".
              */}
              <button
                type="button"
                onClick={() => toggle(zone.id)}
                aria-expanded={open}
                aria-controls={panelId}
                className={
                  "flex min-h-touch items-center justify-between gap-2 rounded-control px-2 text-body transition-colors " +
                  (holdsActive && !open
                    ? "font-medium text-primary hover:bg-canvas"
                    : "text-content hover:bg-canvas")
                }
              >
                <span className="uppercase tracking-wide text-caption text-content-muted">
                  {zone.label}
                </span>
                <ChevronRight
                  aria-hidden
                  className={
                    "size-4 shrink-0 text-content-muted transition-transform " +
                    (open ? "rotate-90" : "")
                  }
                />
              </button>

              {open ? (
                <div id={panelId} className="flex flex-col gap-0.5 pb-2 pl-2">
                  {zone.modules.map((entry) => {
                    const active = pathname === entry.href;
                    // A feature that is merely planned is nobody's paywall — it
                    // does not get a lock, because there is nothing to buy.
                    const locked = entry.feature
                      ? !can(entitlement, entry.feature) &&
                        !isPlanned(entry.feature)
                      : false;
                    return (
                      <Link
                        key={entry.href}
                        href={entry.href}
                        aria-current={active ? "page" : undefined}
                        title={entry.summary}
                        className={
                          "flex min-h-touch items-center justify-between gap-2 rounded-control px-2 text-body transition-colors " +
                          (active
                            ? "bg-primary-tonal font-medium text-primary"
                            : "text-content hover:bg-canvas")
                        }
                      >
                        <span
                          className={locked ? "text-content-muted" : undefined}
                        >
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
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
