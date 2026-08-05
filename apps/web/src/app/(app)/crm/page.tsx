import { redirect } from "next/navigation";

import { CrmModule } from "~/components/crm/crm-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Customers" };

export default async function CrmPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "crm");
  if (!allowed) return <UpgradeGate feature="crm" />;

  return <CrmModule orgId={ctx.orgId} />;
}
