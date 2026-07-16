import { Badge } from "@vyora/ui";

import { NAV_MODULES } from "~/config/navigation";

/**
 * Stand-in body for a scaffolded module route.
 *
 * Phase 2 delivers the route map and shell; each module gets its real screens
 * in the phase named on the card. Reading from the nav catalogue keeps the
 * route and its metadata from drifting apart.
 */
export function ModulePlaceholder({ href }: { href: string }) {
  const entry = NAV_MODULES.find((m) => m.href === href);

  if (!entry) {
    throw new Error(`No nav entry for route "${href}"`);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{entry.label}</h1>
        <p className="text-body-lg text-content-muted">{entry.summary}</p>
      </div>

      <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
        <Badge tone="primary">{entry.phase}</Badge>
        <p className="text-body text-content-muted">
          Route scaffolded — screens arrive in this phase.
        </p>
      </div>
    </section>
  );
}
