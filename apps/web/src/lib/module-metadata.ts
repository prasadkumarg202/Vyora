import type { Metadata } from "next";

import { NAV_MODULES } from "~/config/navigation";

/**
 * Page metadata derived from the nav catalogue, so a module's title and its
 * sidebar label cannot drift apart. Evaluated at build time.
 */
export function moduleMetadata(href: string): Metadata {
  const entry = NAV_MODULES.find((m) => m.href === href);

  if (!entry) {
    throw new Error(`No nav entry for route "${href}"`);
  }

  return {
    title: entry.label,
    description: entry.summary,
  };
}
