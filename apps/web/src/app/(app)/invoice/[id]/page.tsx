import { redirect } from "next/navigation";

import { InvoicePrintView } from "~/components/sales/invoice-print-view";
import { createClient } from "~/lib/supabase/server";
import { loadTenantContext } from "~/lib/tenant-config";

export const metadata = { title: "Invoice" };

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await loadTenantContext();
  if (!ctx) redirect("/welcome");

  let businessName = ctx.config?.label ?? "Your Business";
  try {
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", ctx.orgId)
      .single();
    if (org?.name) businessName = org.name as string;
  } catch {
    // org name is a nicety; fall back to the business-type label.
  }

  return (
    <InvoicePrintView
      orgId={ctx.orgId}
      invoiceId={id}
      config={ctx.config}
      businessName={businessName}
      stateCode={ctx.supplierStateCode}
    />
  );
}
