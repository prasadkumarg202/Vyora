import { redirect } from "next/navigation";

import { PurchaseModule } from "~/components/purchase/purchase-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Purchase" };

export default async function PurchasePage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return (
    <PurchaseModule
      orgId={ctx.orgId}
      config={ctx.config}
      supplierStateCode={ctx.supplierStateCode}
    />
  );
}
