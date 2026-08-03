import { redirect } from "next/navigation";

import { RemindersModule } from "~/components/reminders/reminders-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Payment Reminders" };

export default async function RemindersPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <RemindersModule orgId={ctx.orgId} />;
}
