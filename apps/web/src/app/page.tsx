import { redirect } from "next/navigation";

export default function IndexPage() {
  // Phase 3 gates this on a session: signed out goes to OTP login instead.
  redirect("/dashboard");
}
