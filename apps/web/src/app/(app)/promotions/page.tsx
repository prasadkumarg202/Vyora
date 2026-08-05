import { redirect } from "next/navigation";

import { PromotionsModule } from "~/components/promotions/promotions-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "WhatsApp Promotions" };

export default async function PromotionsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "promotions");
  if (!allowed) return <UpgradeGate feature="promotions" />;

  return <PromotionsModule orgId={ctx.orgId} config={ctx.config} />;
}
