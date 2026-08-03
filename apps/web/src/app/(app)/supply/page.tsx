import { redirect } from "next/navigation";

import { SupplyModule } from "~/components/supply/supply-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Supply Desk" };

export default async function SupplyPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <SupplyModule orgId={ctx.orgId} userId={ctx.userId} />;
}
