import { redirect } from "next/navigation";

import { ImportModule } from "~/components/import/import-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Import & Export" };

export default async function ImportPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <ImportModule orgId={ctx.orgId} />;
}
