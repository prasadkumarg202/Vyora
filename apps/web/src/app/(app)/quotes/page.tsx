import { redirect } from "next/navigation";

import { QuotesModule } from "~/components/quotes/quotes-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Quotes & Challans" };

export default async function QuotesPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <QuotesModule orgId={ctx.orgId} userId={ctx.userId} />;
}
