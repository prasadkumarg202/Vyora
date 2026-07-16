import { ModulePlaceholder } from "~/components/module-placeholder";
import { moduleMetadata } from "~/lib/module-metadata";

export const metadata = moduleMetadata("/subscriptions");

export default function Page() {
  return <ModulePlaceholder href="/subscriptions" />;
}
