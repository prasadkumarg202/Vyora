import { redirect } from "next/navigation";

import { GrowthModule } from "~/components/growth/growth-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Growth Studio" };

export default async function GrowthPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <GrowthModule orgId={ctx.orgId} />;
}
