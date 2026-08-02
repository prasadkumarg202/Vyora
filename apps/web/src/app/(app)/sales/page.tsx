import { redirect } from "next/navigation";

import { SalesModule } from "~/components/sales/sales-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Sales" };

export default async function SalesPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return (
    <SalesModule
      orgId={ctx.orgId}
      userId={ctx.userId}
      config={ctx.config}
      supplierStateCode={ctx.supplierStateCode}
    />
  );
}
