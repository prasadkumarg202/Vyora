import { redirect } from "next/navigation";

import { SettingsModule } from "~/components/settings/settings-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return (
    <SettingsModule
      orgId={ctx.orgId}
      config={ctx.config}
      supplierStateCode={ctx.supplierStateCode}
    />
  );
}
