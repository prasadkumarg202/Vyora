import { redirect } from "next/navigation";

import { OcrCaptureModule } from "~/components/snap-bill/ocr-capture-module";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Snap Bill" };

export default async function SnapBillPage() {
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  return <OcrCaptureModule orgId={ctx.orgId} config={ctx.config} />;
}
