import { redirect } from "next/navigation";

import { ProductsModule } from "~/components/products/products-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <ProductsModule orgId={ctx.orgId} config={ctx.config} />;
}
