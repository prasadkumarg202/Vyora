import { redirect } from "next/navigation";

import { CustomersModule } from "~/components/customers/customers-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <CustomersModule orgId={ctx.orgId} config={ctx.config} />;
}
