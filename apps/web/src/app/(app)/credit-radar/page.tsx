import { redirect } from "next/navigation";

import { CreditRadarModule } from "~/components/credit-radar/credit-radar-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Credit Radar" };

export default async function CreditRadarPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <CreditRadarModule orgId={ctx.orgId} config={ctx.config} />;
}
