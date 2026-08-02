import { redirect } from "next/navigation";

import { ReconcileModule } from "~/components/reconcile/reconcile-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "UPI Auto-Match" };

export default async function ReconcilePage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <ReconcileModule orgId={ctx.orgId} config={ctx.config} />;
}
