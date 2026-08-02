import { redirect } from "next/navigation";

import { ScanSellModule } from "~/components/scan-sell/scan-sell-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Scan & Sell" };

export default async function ScanSellPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return (
    <ScanSellModule
      orgId={ctx.orgId}
      userId={ctx.userId}
      config={ctx.config}
      supplierStateCode={ctx.supplierStateCode}
    />
  );
}
