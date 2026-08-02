import { redirect } from "next/navigation";

import { ExpensesModule } from "~/components/expenses/expenses-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <ExpensesModule orgId={ctx.orgId} config={ctx.config} />;
}
