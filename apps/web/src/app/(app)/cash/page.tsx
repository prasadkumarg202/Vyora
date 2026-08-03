import { redirect } from "next/navigation";

import { CashModule } from "~/components/cash/cash-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Cash & Bank" };

export default async function CashPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <CashModule orgId={ctx.orgId} userId={ctx.userId} />;
}
