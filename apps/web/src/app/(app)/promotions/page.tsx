import { redirect } from "next/navigation";

import { PromotionsModule } from "~/components/promotions/promotions-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "WhatsApp Promotions" };

export default async function PromotionsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <PromotionsModule orgId={ctx.orgId} config={ctx.config} />;
}
