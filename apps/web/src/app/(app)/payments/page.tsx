import { redirect } from "next/navigation";

import { PaymentsModule } from "~/components/payments/payments-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <PaymentsModule orgId={ctx.orgId} userId={ctx.userId} />;
}
