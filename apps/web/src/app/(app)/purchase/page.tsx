import { ModulePlaceholder } from "~/components/module-placeholder";
import { moduleMetadata } from "~/lib/module-metadata";

export const metadata = moduleMetadata("/purchase");

export default function Page() {
  return <ModulePlaceholder href="/purchase" />;
}
