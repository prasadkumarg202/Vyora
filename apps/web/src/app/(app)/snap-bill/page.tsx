import { redirect } from "next/navigation";

import { OcrCaptureModule } from "~/components/snap-bill/ocr-capture-module";
import { UpgradeGate } from "~/components/billing/upgrade-gate";
import { checkFeature } from "~/lib/billing/state";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Snap Bill" };

export default async function SnapBillPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  // Re-checked on the server on every request. The sidebar's lock is a
  // courtesy; this is the gate.
  const { allowed } = await checkFeature(ctx.orgId, "snap_bill");
  if (!allowed) return <UpgradeGate feature="snap_bill" />;

  return <OcrCaptureModule orgId={ctx.orgId} config={ctx.config} />;
}
