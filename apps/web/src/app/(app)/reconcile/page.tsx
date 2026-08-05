import { redirect } from "next/navigation";

import { ReconcileModule } from "~/components/reconcile/reconcile-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "UPI Auto-Match" };

export default async function ReconcilePage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "upi_auto_match");
  if (!allowed) return <UpgradeGate feature="upi_auto_match" />;

  return <ReconcileModule orgId={ctx.orgId} config={ctx.config} />;
}
