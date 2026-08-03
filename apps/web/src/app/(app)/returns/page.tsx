import { redirect } from "next/navigation";

import { ReturnsModule } from "~/components/returns/returns-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Returns Desk" };

export default async function ReturnsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <ReturnsModule orgId={ctx.orgId} userId={ctx.userId} />;
}
