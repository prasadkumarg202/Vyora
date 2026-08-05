import { redirect } from "next/navigation";

import { GrowthModule } from "~/components/growth/growth-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Growth Studio" };

export default async function GrowthPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "growth_studio");
  if (!allowed) return <UpgradeGate feature="growth_studio" />;

  return <GrowthModule orgId={ctx.orgId} />;
}
