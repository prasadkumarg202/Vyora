import "server-only";

import { can, type FeatureKey } from "@vyora/core";
import { NextResponse } from "next/server";

import { getTenantSession } from "~/lib/auth/session";
import { loadEntitlement } from "~/lib/billing/state";

/**
 * The gate for API routes that cost us money.
 *
 * Gating a *screen* stops an honest shopkeeper from using a feature they have
 * not paid for. It does nothing about a POST straight at the endpoint — and the
 * AI routes are exactly the ones worth attacking, because every call spends
 * real provider credit. So they are checked here too, on the server, with the
 * caller's own session.
 *
 * Returns a Response to send back, or null when the caller may proceed.
 */
export async function requireFeature(
  feature: FeatureKey,
): Promise<Response | null> {
  const session = await getTenantSession();

  if (!session?.orgId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const entitlement = await loadEntitlement(session.orgId);
  if (!can(entitlement, feature)) {
    return NextResponse.json(
      {
        error: "upgrade_required",
        feature,
        // The client turns this into an upgrade prompt rather than a raw
        // failure, so a locked feature reads as a choice, not a bug.
        message: "This feature is not part of your current plan.",
      },
      { status: 402 },
    );
  }

  return null;
}
