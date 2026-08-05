import { redirect } from "next/navigation";

import { ScanSellModule } from "~/components/scan-sell/scan-sell-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Scan & Sell" };

export default async function ScanSellPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "scan_sell");
  if (!allowed) return <UpgradeGate feature="scan_sell" />;

  return (
    <ScanSellModule
      orgId={ctx.orgId}
      userId={ctx.userId}
      config={ctx.config}
      supplierStateCode={ctx.supplierStateCode}
    />
  );
}
