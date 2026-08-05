import { redirect } from "next/navigation";

import { AssistantModule } from "~/components/assistant/assistant-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "AI Assistant" };

export default async function AssistantPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "ai_assistant");
  if (!allowed) return <UpgradeGate feature="ai_assistant" />;

  return <AssistantModule orgId={ctx.orgId} config={ctx.config} />;
}
