import { parseBusinessTypeConfig, type BusinessTypeConfig } from "@vyora/core";
import { redirect } from "next/navigation";

import { SalesModule } from "~/components/sales/sales-module";
import { getTenantSession } from "~/lib/auth/session";
import { createClient } from "~/lib/supabase/server";

export const metadata = { title: "Sales" };

/**
 * Loads the tenant's business-type config server-side and hands it to the
 * client module.
 *
 * The config is what makes the invoice metadata-driven — a pharmacy and a
 * jeweller get different fields, validations and GST rules from the same code.
 * Loading it here (readable via RLS: system business types) keeps the heavy
 * engine data off the client bundle and out of every render.
 */
export default async function SalesPage() {
  const session = await getTenantSession();
  if (!session) redirect("/login");
  if (!session.orgId) redirect("/welcome");

  const supabase = await createClient();

  // The org, to learn which business type it is and its state (GST place of
  // supply). Readable under the own-organisation RLS policy.
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
    // Through the engine's own trust boundary, never trusting the jsonb shape.
    if (bt?.config) config = parseBusinessTypeConfig(bt.config);
  }

  return (
    <SalesModule
      orgId={session.orgId}
      userId={session.userId}
      config={config}
      supplierStateCode={stateNameToCode(org?.state)}
    />
  );
}

/**
 * GST state name -> two-digit code.
 *
 * Only the states needed to not-crash are mapped; the rest fall back to "36"
 * (Telangana) with the intra-state path, which is correct for a single-state
 * shop. Capturing the customer's place of supply (which drives IGST) is a
 * later field on the invoice, so today every sale is intra-state.
 */
function stateNameToCode(state: string | null | undefined): string {
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
