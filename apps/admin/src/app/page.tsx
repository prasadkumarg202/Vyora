import { AdminConsole } from "~/components/admin-console";

export const metadata = {
  title: "Vyora Admin Portal",
  description: "Internal console for the Vyora SaaS team.",
  robots: { index: false, follow: false },
};

export default function AdminIndexPage() {
  return <AdminConsole />;
}
