import { redirect } from "next/navigation";

import {
  SubscriptionsModule,
  type BillingReceipt,
} from "~/components/subscriptions/subscriptions-module";
import { loadEntitlement } from "~/lib/billing/state";
import { createClient } from "~/lib/supabase/server";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Subscription" };

/**
 * Never cached. A plan that changed thirty seconds ago on another device has
 * to be what this page shows — a stale entitlement here is a shop staring at a
 * feature they have already paid for.
 */
export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  const [entitlement, receipts] = await Promise.all([
    loadEntitlement(ctx.orgId),
    loadReceipts(ctx.orgId),
  ]);

  return (
    <SubscriptionsModule
      orgId={ctx.orgId}
      config={ctx.config}
      entitlement={entitlement}
      receipts={receipts}
      isOwner={ctx.orgRole === "owner"}
    />
  );
}

/** Read through the caller's own session, so RLS scopes it to their workspace
 *  rather than trusting the org id we happen to be holding. */
async function loadReceipts(orgId: string): Promise<BillingReceipt[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("billing_invoices")
    .select(
      "id, number, total_paise, base_paise, tax_paise, paid_at, period_end, plan_id, cycle",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(24);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    totalPaise: Number(row.total_paise),
    basePaise: Number(row.base_paise),
    taxPaise: Number(row.tax_paise),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    periodEnd: String(row.period_end),
    planId: String(row.plan_id),
    cycle: String(row.cycle),
  }));
}
