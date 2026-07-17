import { ModulePlaceholder } from "~/components/module-placeholder";
import { OfflineCheck } from "~/components/offline-check";
import { moduleMetadata } from "~/lib/module-metadata";

export const metadata = moduleMetadata("/administration");

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <ModulePlaceholder href="/administration" />
      {/*
        Administration owns devices and encryption keys per the IA, so this
        device's offline readiness belongs here — it is the first thing to check
        when a shop reports "it lost my invoices".
      */}
      <OfflineCheck />
    </div>
  );
}
