import { redirect } from "next/navigation";

import { StaffModule } from "~/components/staff/staff-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // No entitlement gate. A shop with four people cannot be asked to upgrade
  // before it can write down who came in this morning — that is the notebook
  // this replaces, and a paywall on it would send them back to the notebook.
  return <StaffModule orgId={ctx.orgId} userId={ctx.userId} />;
}
