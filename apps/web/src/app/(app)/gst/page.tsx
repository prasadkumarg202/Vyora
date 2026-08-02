import { redirect } from "next/navigation";

import { GstModule } from "~/components/gst/gst-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "GST" };

export default async function GstPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <GstModule orgId={ctx.orgId} config={ctx.config} />;
}
