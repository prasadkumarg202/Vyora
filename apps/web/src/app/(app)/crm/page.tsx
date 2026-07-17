import { redirect } from "next/navigation";

import { CrmModule } from "~/components/crm/crm-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Customers" };

export default async function CrmPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <CrmModule orgId={ctx.orgId} />;
}
