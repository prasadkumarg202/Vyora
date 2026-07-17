import { redirect } from "next/navigation";

import { ReportsModule } from "~/components/reports/reports-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <ReportsModule orgId={ctx.orgId} />;
}
