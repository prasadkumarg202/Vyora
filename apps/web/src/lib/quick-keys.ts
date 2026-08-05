"use client";

import {
  getSetting,
  productsByIds,
  setSetting,
  suggestedQuickKeyProducts,
  type ProductPick,
} from "~/lib/db/repository";

/**
 * Till shortcuts — the handful of items this shop sells all day.
 *
 * A grocery bills sugar, rice, salt and wheat a hundred times between the
 * things that actually need typing. Making the cashier search for them each
 * time is the difference between a queue that moves and one that does not.
 *
 * Two rules, both deliberate:
 *
 *  - The list comes from the shop's *own* catalogue, never from a hardcoded
 *    per-trade list. A hardcoded "grocery = sugar, rice, salt, wheat" is wrong
 *    the moment the shop is a South Indian kirana that sells more idli rava
 *    than wheat, and it can never be right for all 18 verticals at once.
 *  - Once chosen, the order is FIXED until the shop changes it. Re-ranking by
 *    what is selling sounds smarter and is worse: a key that moves under a
 *    cashier's fingers mid-queue bills the wrong item, and nobody notices
 *    until the customer does.
 *
 * Until the shop pins anything, the order is derived (most-billed, then most
 * recently added) so day one is not an empty row.
 */

const KEY = "pref.quickKeys";

/** Nine, because the shortcut is the digit above the letter it sits on. */
export const QUICK_KEY_LIMIT = 9;

export interface QuickKeySet {
  readonly products: readonly ProductPick[];
  /** False while the list is derived, true once the shop has pinned its own. */
  readonly pinned: boolean;
}

export async function loadQuickKeys(orgId: string): Promise<QuickKeySet> {
  const stored = parseIds(await getSetting(KEY));

  if (stored === null) {
    return {
      products: await suggestedQuickKeyProducts(orgId, QUICK_KEY_LIMIT),
      pinned: false,
    };
  }

  // An explicitly empty list means "I want no shortcuts", which is different
  // from "I have not chosen yet" — so it is honoured rather than re-derived.
  if (stored.length === 0) return { products: [], pinned: true };

  const products = await productsByIds(orgId, stored);

  // Every pinned product has since been deleted. Falling back to the derived
  // list is friendlier than showing an empty row the shop cannot explain.
  if (products.length === 0) {
    return {
      products: await suggestedQuickKeyProducts(orgId, QUICK_KEY_LIMIT),
      pinned: false,
    };
  }

  return { products, pinned: true };
}

export async function saveQuickKeys(ids: readonly string[]): Promise<void> {
  await setSetting(KEY, JSON.stringify(ids.slice(0, QUICK_KEY_LIMIT)));
}

/** Back to the derived list. */
export async function resetQuickKeys(): Promise<void> {
  await setSetting(KEY, "");
}

/**
 * Whether a digit press should reach the till.
 *
 * Bare digits are the right shortcut at a counter — no modifier to learn, and
 * no collision with the browser's own Ctrl/Alt+number tab switching, which
 * would be a bug we could not fix. The cost is that they must not fire while
 * someone is typing a quantity, so anything text-editable takes precedence.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** null = never chosen; [] = chosen to have none. */
function parseIds(raw: string | null): string[] | null {
  if (raw === null) return null;
  if (raw.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // A corrupt preference must not take the till down with it.
    return null;
  }
}
