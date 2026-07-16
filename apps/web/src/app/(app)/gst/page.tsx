import { ModulePlaceholder } from "~/components/module-placeholder";
import { moduleMetadata } from "~/lib/module-metadata";

export const metadata = moduleMetadata("/gst");

export default function Page() {
  return <ModulePlaceholder href="/gst" />;
}
