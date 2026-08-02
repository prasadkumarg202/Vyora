import { redirect } from "next/navigation";

import { AccountingModule } from "~/components/accounting/accounting-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Accounting" };

export default async function AccountingPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <AccountingModule orgId={ctx.orgId} config={ctx.config} />;
}
