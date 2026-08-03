import { redirect } from "next/navigation";

import { ReportsHub } from "~/components/reports/reports-hub";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Reports" };

export default async function ReportsHubPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <ReportsHub orgId={ctx.orgId} />;
}
