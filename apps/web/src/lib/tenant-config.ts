import "server-only";

import { parseBusinessTypeConfig, type BusinessTypeConfig } from "@vyora/core";

import { getTenantSession } from "~/lib/auth/session";
import { createClient } from "~/lib/supabase/server";

/**
 * The signed-in tenant plus its business-type config.
 *
 * Every module screen needs the same three things — the session, the org's
 * state (for GST place of supply), and the parsed business-type config that
 * makes the screen metadata-driven — so they load it here instead of repeating
 * the two queries and the parse per page.
 *
 * The config is parsed through the engine's own trust boundary, never trusting
 * the jsonb shape from the database.
 */
export interface TenantContext {
  orgId: string;
  userId: string;
  orgRole: string | null;
  config: BusinessTypeConfig | null;
  supplierStateCode: string;
}

/** Returns null when there is no session or no workspace — caller redirects. */
export async function loadTenantContext(): Promise<TenantContext | null> {
  const session = await getTenantSession();
  if (!session?.orgId) return null;

  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("business_type_id, state")
    .eq("id", session.orgId)
    .single();

  let config: BusinessTypeConfig | null = null;
  if (org?.business_type_id) {
    const { data: bt } = await supabase
      .from("business_types")
      .select("config")
      .eq("id", org.business_type_id)
      .single();
    if (bt?.config) config = parseBusinessTypeConfig(bt.config);
  }

  return {
    orgId: session.orgId,
    userId: session.userId,
    orgRole: session.orgRole,
    config,
    supplierStateCode: stateNameToCode(org?.state),
  };
}

/**
 * GST state name -> two-digit code. Falls back to Telangana with the intra-state
 * path, correct for a single-state shop; customer place-of-supply capture (which
 * drives IGST) is a later invoice field.
 */
export function stateNameToCode(state: string | null | undefined): string {
  const map: Record<string, string> = {
    "Andhra Pradesh": "37",
    Telangana: "36",
    "Tamil Nadu": "33",
    Karnataka: "29",
    Kerala: "32",
    Maharashtra: "27",
    Delhi: "07",
    "Uttar Pradesh": "09",
  };
  return (state && map[state]) || "36";
}
