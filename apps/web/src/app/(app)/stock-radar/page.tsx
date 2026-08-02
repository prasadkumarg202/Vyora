import { redirect } from "next/navigation";

import { StockRadarModule } from "~/components/stock-radar/stock-radar-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Stock Radar" };

export default async function StockRadarPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <StockRadarModule orgId={ctx.orgId} config={ctx.config} />;
}
