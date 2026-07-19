import { redirect } from "next/navigation";

import { SupportModule } from "~/components/support/support-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Help & Support" };

export default async function SupportPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <SupportModule orgId={ctx.orgId} config={ctx.config} />;
}
