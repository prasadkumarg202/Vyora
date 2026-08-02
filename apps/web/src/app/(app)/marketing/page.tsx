import { redirect } from "next/navigation";

import { MarketingModule } from "~/components/marketing/marketing-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Marketing" };

export default async function MarketingPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <MarketingModule orgId={ctx.orgId} userId={ctx.userId} />;
}
