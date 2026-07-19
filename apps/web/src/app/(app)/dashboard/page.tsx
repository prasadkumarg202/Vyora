import { redirect } from "next/navigation";

import { DashboardModule } from "~/components/dashboard/dashboard-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <DashboardModule orgId={ctx.orgId} config={ctx.config} />;
}
