import { redirect } from "next/navigation";

import { MarketingModule } from "~/components/marketing/marketing-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Marketing" };

export default async function MarketingPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "marketing");
  if (!allowed) return <UpgradeGate feature="marketing" />;

  return <MarketingModule orgId={ctx.orgId} userId={ctx.userId} />;
}
