import { redirect } from "next/navigation";

import { VoiceBillModule } from "~/components/voice-bill/voice-bill-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Voice Billing" };

export default async function VoiceBillPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "voice_billing");
  if (!allowed) return <UpgradeGate feature="voice_billing" />;

  return (
    <VoiceBillModule
      orgId={ctx.orgId}
      userId={ctx.userId}
      config={ctx.config}
      supplierStateCode={ctx.supplierStateCode}
    />
  );
}
