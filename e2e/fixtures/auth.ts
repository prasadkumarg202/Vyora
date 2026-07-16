import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Shared Supabase admin helpers for tests that need a real tenant. */

export function readEnv(): Record<string, string> {
  const envPath = path.join(here, "../../apps/web/.env.local");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [
          l.slice(0, i).trim(),
          l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

const env = readEnv();
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const isConfigured = Boolean(SUPABASE_URL && SERVICE_KEY);

/** Where the signed-in browser state is cached between projects. */
export const STORAGE_STATE = path.join(here, "../.auth/tenant.json");

/**
 * The shell suite's fixture tenant.
 *
 * Stable rather than per-run: create_workspace() caps a user at one workspace,
 * so a throwaway user per run would leave orphaned orgs behind in a shared dev
 * project. This one is reused and cheap to recreate — delete the user in the
 * dashboard and the next run rebuilds it.
 */
export const FIXTURE_EMAIL = "e2e-shell-fixture@vyora-e2e.test";

export const admin = (p: string, init: RequestInit = {}) =>
  fetch(SUPABASE_URL + p, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    },
  });

/** Mint a one-time code without sending mail (the built-in SMTP is capped). */
export async function otpFor(email: string): Promise<string> {
  const res = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const body = (await res.json()) as {
    properties?: { email_otp?: string };
    email_otp?: string;
  };
  const otp = body.properties?.email_otp ?? body.email_otp;
  if (!otp) {
    throw new Error(
      `no OTP in generate_link response: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }
  return otp;
}

export async function findUser(email: string): Promise<{ id: string } | null> {
  const res = await admin(
    `/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { users?: { id: string }[] };
  return body.users?.[0] ?? null;
}
