import { redirect } from "next/navigation";

import { CreditRadarModule } from "~/components/credit-radar/credit-radar-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Credit Radar" };

export default async function CreditRadarPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "credit_radar");
  if (!allowed) return <UpgradeGate feature="credit_radar" />;

  return <CreditRadarModule orgId={ctx.orgId} config={ctx.config} />;
}
