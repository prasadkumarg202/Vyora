import { redirect } from "next/navigation";

import { VoiceBillModule } from "~/components/voice-bill/voice-bill-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Voice Billing" };

export default async function VoiceBillPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return (
    <VoiceBillModule
      orgId={ctx.orgId}
      userId={ctx.userId}
      config={ctx.config}
      supplierStateCode={ctx.supplierStateCode}
    />
  );
}
