import { redirect } from "next/navigation";

import { SuppliersModule } from "~/components/suppliers/suppliers-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <SuppliersModule orgId={ctx.orgId} config={ctx.config} />;
}
