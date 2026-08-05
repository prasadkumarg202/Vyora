import "server-only";

import {
  BASIC_PLAN,
  can,
  parseBillingCycle,
  parsePlanId,
  parseSubscriptionStatus,
  resolveEntitlement,
  type Entitlement,
  type FeatureKey,
  type OrgBillingState,
} from "@vyora/core";

import { createClient } from "~/lib/supabase/server";

/**
 * The server's view of what a workspace may do.
 *
 * This is the authority. The browser gets a copy so it can grey out the right
 * buttons, but every gate that matters is re-evaluated here, because a copy
 * that lives in the client is a copy the client can edit.
 *
 * Read through the caller's own session, so RLS applies: a request cannot ask
 * about someone else's plan even by guessing an org id.
 */

const FALLBACK: OrgBillingState = {
  planId: BASIC_PLAN,
  status: "expired",
  cycle: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  seatsUsed: 1,
  devicesUsed: 1,
};

export async function loadOrgBilling(orgId: string): Promise<OrgBillingState> {
  const supabase = await createClient();

  const [orgResult, seats, devices] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "plan_id, plan_status, plan_cycle, trial_ends_at, current_period_end",
      )
      .eq("id", orgId)
      .single(),
    supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active"),
    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active"),
  ]);

  const org = orgResult.data;
  if (!org) return FALLBACK;

  return {
    // Every value from the database goes through a parser. A row written by an
    // older migration, or a plan we have since retired, degrades to the basic
    // level rather than throwing on render — but it never degrades *upward*.
    planId: parsePlanId(org.plan_id) ?? BASIC_PLAN,
    status: parseSubscriptionStatus(org.plan_status) ?? "expired",
    cycle: parseBillingCycle(org.plan_cycle),
    trialEndsAt: asIso(org.trial_ends_at),
    currentPeriodEnd: asIso(org.current_period_end),
    seatsUsed: Math.max(1, seats.count ?? 1),
    devicesUsed: Math.max(1, devices.count ?? 1),
  };
}

export async function loadEntitlement(orgId: string): Promise<Entitlement> {
  return resolveEntitlement(await loadOrgBilling(orgId));
}

/**
 * The server-side gate. Returns the entitlement when the feature is licensed,
 * or null when it is not — the caller renders the upgrade prompt instead of
 * the module.
 *
 * Pages call this; they do not compare plan names themselves. That is what
 * keeps the gating in one place when the ladder changes.
 */
export async function checkFeature(
  orgId: string,
  feature: FeatureKey,
): Promise<{ entitlement: Entitlement; allowed: boolean }> {
  const entitlement = await loadEntitlement(orgId);
  return { entitlement, allowed: can(entitlement, feature) };
}

function asIso(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
