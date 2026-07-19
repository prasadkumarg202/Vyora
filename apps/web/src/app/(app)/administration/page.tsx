import { redirect } from "next/navigation";

import { AdministrationModule } from "~/components/administration/administration-module";
import { OfflineCheck } from "~/components/offline-check";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Administration" };

export default async function AdministrationPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return (
    <div className="flex flex-col gap-6">
      <AdministrationModule orgId={ctx.orgId} config={ctx.config} />
      <OfflineCheck />
    </div>
  );
}
