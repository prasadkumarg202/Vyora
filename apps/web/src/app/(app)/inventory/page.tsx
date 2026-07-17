import { redirect } from "next/navigation";

import { InventoryModule } from "~/components/inventory/inventory-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <InventoryModule orgId={ctx.orgId} config={ctx.config} />;
}
