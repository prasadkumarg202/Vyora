import { redirect } from "next/navigation";

import { SubscriptionsModule } from "~/components/subscriptions/subscriptions-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Subscription" };

export default async function SubscriptionsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <SubscriptionsModule orgId={ctx.orgId} config={ctx.config} />;
}
