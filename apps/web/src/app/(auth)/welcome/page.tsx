import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WelcomeForm } from "~/components/auth/welcome-form";
import { getTenantSession } from "~/lib/auth/session";
import { createClient } from "~/lib/supabase/server";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function WelcomePage() {
  const session = await getTenantSession();

  if (!session) redirect("/login");
  // Already has a workspace — nothing to do here.
  if (session.orgId) redirect("/dashboard");

  // Readable by any authenticated user: these are product metadata, not tenant
  // data (read_system_business_types).
  const supabase = await createClient();
  const { data: businessTypes } = await supabase
    .from("business_types")
    .select("key,label")
    .order("label");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2">Create your workspace</h1>
          <p className="text-body text-content-muted">
            Signed in as {session.email}. One more step before you can bill.
          </p>
        </div>

        <WelcomeForm businessTypes={businessTypes ?? []} />
      </div>
    </main>
  );
}
