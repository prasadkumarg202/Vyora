import { redirect } from "next/navigation";

import { StockRadarModule } from "~/components/stock-radar/stock-radar-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Stock Radar" };

export default async function StockRadarPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "stock_radar");
  if (!allowed) return <UpgradeGate feature="stock_radar" />;

  return <StockRadarModule orgId={ctx.orgId} config={ctx.config} />;
}
