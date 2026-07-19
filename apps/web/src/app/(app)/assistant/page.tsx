import { redirect } from "next/navigation";

import { AssistantModule } from "~/components/assistant/assistant-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "AI Assistant" };

export default async function AssistantPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <AssistantModule orgId={ctx.orgId} config={ctx.config} />;
}
