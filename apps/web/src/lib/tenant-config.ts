import "server-only";

import {
  parseBusinessTypeConfig,
  stateCodeFor,
  type BusinessTypeConfig,
} from "@vyora/core";

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
    .select("business_type_id, state, state_code")
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
    supplierStateCode: resolveStateCode(org?.state_code, org?.state),
  };
}

/**
 * The supplier's GST state code.
 *
 * Prefers the code stored at onboarding: it is what the shop actually chose,
 * and re-deriving one from a display name means a renamed state silently
 * changes the tax. The name lookup is the fallback for workspaces created
 * before the code column existed.
 *
 * Telangana is the last resort. It is a guess, and a guess about the supplier
 * state is a guess about CGST/SGST versus IGST — so it is the branch to remove
 * once every org has been backfilled, not one to lean on.
 */
export function resolveStateCode(
  storedCode: string | null | undefined,
  stateName: string | null | undefined,
): string {
  if (storedCode && /^\d{2}$/.test(storedCode.trim())) return storedCode.trim();
  return stateCodeFor(stateName) ?? "36";
}
