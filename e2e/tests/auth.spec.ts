import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * End-to-end auth, against a real Supabase project.
 *
 * The OTP is fetched via the admin generate_link endpoint rather than read out
 * of an inbox: Supabase's built-in SMTP is rate-limited to a couple of mails an
 * hour, which would make this suite flaky and slow for no extra coverage. The
 * code path under test — verifyOtp -> session -> claims -> RLS — is identical.
 */

// This package is ESM, so no __dirname.
const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "../../apps/web/.env.local");

function readEnv(): Record<string, string> {
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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(URL_ && SECRET);

const admin = (p: string, init: RequestInit = {}) =>
  fetch(URL_ + p, {
    ...init,
    headers: {
      apikey: SECRET!,
      Authorization: "Bearer " + SECRET!,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    },
  });

/** Fresh address per run so reruns never collide on the one-workspace cap. */
const uniqueEmail = () =>
  `e2e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}@vyora-e2e.test`;

/**
 * Put the form on the verify step without sending mail.
 *
 * Supabase's built-in SMTP allows ~2 messages an hour *per project*, so a suite
 * that clicks "Send code" rate-limits itself into failure by the second run —
 * and would be testing Supabase's mail delivery rather than our code. This
 * seeds the same pending state the form restores after a reload, so everything
 * from the code entry onward is exercised for real.
 *
 * generate_link mints an OTP without sending anything.
 */
async function startAtVerifyStep(page: import("@playwright/test").Page, email: string) {
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key!, value!),
    [
      "vyora.login.pending",
      // Sign-in is SMS-first; these fixtures verify an email address, so the
      // channel has to be stated or the form reads the address as a number.
      JSON.stringify({ step: "verify", email, channel: "email" }),
    ],
  );
}

async function otpFor(email: string): Promise<string> {
  const res = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const body = (await res.json()) as {
    properties?: { email_otp?: string };
    email_otp?: string;
  };
  const otp = body.properties?.email_otp ?? body.email_otp;
  if (!otp) throw new Error(`no OTP in generate_link response: ${JSON.stringify(body).slice(0, 200)}`);
  return otp;
}

async function cleanup(email: string) {
  const res = await admin(`/auth/v1/admin/users?filter=${encodeURIComponent(email)}`);
  if (!res.ok) return;
  const body = (await res.json()) as { users?: { id: string }[] };
  for (const u of body.users ?? []) {
    // Find and drop the org first; org_members cascades from both sides.
    const m = await admin(`/rest/v1/org_members?user_id=eq.${u.id}&select=org_id`);
    if (m.ok) {
      for (const row of (await m.json()) as { org_id: string }[]) {
        await admin(`/rest/v1/organizations?id=eq.${row.org_id}`, { method: "DELETE" });
      }
    }
    await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  }
}

test.describe("authentication", () => {
  test.skip(!configured, "needs apps/web/.env.local with a Supabase project");

  test("unauthenticated visitor is redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await expect(page.getByRole("heading", { name: "Sign in to Vyora" })).toBeVisible();
  });

  test("rejects a malformed address without calling the server", async ({ page }) => {
    await page.goto("/login");
    // The screen opens on mobile; the email field is one tap away.
    await page.getByRole("button", { name: /use your email/i }).click();
    await page.getByLabel("Email address").fill("not-an-email");
    // Native validation blocks submit; the field must report invalid.
    const valid = await page
      .getByLabel("Email address")
      .evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(valid).toBe(false);
  });

  test("the mobile field takes ten digits and nothing else", async ({ page }) => {
    await page.goto("/login");
    const field = page.getByLabel("Mobile number");
    await field.fill("");
    await field.type("098765 43210abc");
    // Non-digits are dropped and the value is capped, so what Supabase gets is
    // always a number it can normalise.
    await expect(field).toHaveValue("0987654321");
  });

  test("full flow: OTP -> workspace -> app -> sign out", async ({ page }) => {
    test.slow();
    const email = uniqueEmail();

    try {
      // --- step 1: identify ---
      // The send itself is Supabase's job and is rate-limited to ~2/hour on the
      // project, so we mint the OTP directly and resume at the verify step —
      // exactly as the form does after a reload.
      const code = await otpFor(email);
      await startAtVerifyStep(page, email);
      await page.goto("/login");

      await expect(page.getByText("Enter the code")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(email)).toBeVisible();

      // --- step 2: verify ---
      // Length is a project setting (email defaults to 8, SMS to 6), so assert
      // the shape, not a count.
      expect(code).toMatch(/^\d{4,10}$/);
      await page.getByLabel("Verification code").fill(code);
      await page.getByRole("button", { name: "Verify & sign in" }).click();

      // No workspace yet -> the app is unreachable, so we land on /welcome.
      await expect(page).toHaveURL(/\/welcome$/, { timeout: 25_000 });
      await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();

      // --- bootstrap the workspace ---
      await page.getByLabel("Business name").fill("E2E Medicals");
      await page.getByLabel("Business type").selectOption("pharmacy");
      await page.getByRole("button", { name: "Create workspace" }).click();

      // --- into the app ---
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 25_000 });
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
      // org_role claim made it into the shell -> the JWT hook ran.
      await expect(page.getByText("owner")).toBeVisible();

      // --- the session is a real tenant session ---
      const res = await admin(`/auth/v1/admin/users?filter=${encodeURIComponent(email)}`);
      const { users } = (await res.json()) as { users: { id: string }[] };
      const userId = users[0]!.id;

      const memberRes = await admin(`/rest/v1/org_members?user_id=eq.${userId}&select=role,status,org_id`);
      const members = (await memberRes.json()) as { role: string; status: string; org_id: string }[];
      expect(members).toHaveLength(1);
      expect(members[0]!.role).toBe("owner");
      expect(members[0]!.status).toBe("active");

      // A device row bound to this session must exist.
      const devRes = await admin(`/rest/v1/devices?user_id=eq.${userId}&select=session_id,status,platform,name`);
      const devices = (await devRes.json()) as { session_id: string | null; status: string }[];
      expect(devices.length).toBeGreaterThanOrEqual(1);
      expect(devices[0]!.status).toBe("active");
      expect(devices[0]!.session_id).not.toBeNull();

      // The profile row that the forbidden auth.users trigger would have made.
      const profRes = await admin(`/rest/v1/users?id=eq.${userId}&select=id,email`);
      expect((await profRes.json()) as unknown[]).toHaveLength(1);

      // --- navigation stays authenticated ---
      await page.getByRole("link", { name: "Products", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

      // --- sign out ---
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });

      // And the app is closed again.
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await cleanup(email);
    }
  });

  test("a second workspace is refused for the same user", async ({ page, request }) => {
    test.slow();
    const email = uniqueEmail();

    try {
      const code = await otpFor(email);
      await startAtVerifyStep(page, email);
      await page.goto("/login");
      await expect(page.getByText("Enter the code")).toBeVisible({ timeout: 20_000 });

      await page.getByLabel("Verification code").fill(code);
      await page.getByRole("button", { name: "Verify & sign in" }).click();
      await expect(page).toHaveURL(/\/welcome$/, { timeout: 25_000 });

      await page.getByLabel("Business name").fill("First Workspace");
      await page.getByRole("button", { name: "Create workspace" }).click();
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 25_000 });

      // Going back to /welcome must bounce: the cap is one workspace per user,
      // enforced in create_workspace(), not just hidden in the UI.
      await page.goto("/welcome");
      await expect(page).toHaveURL(/\/dashboard$/);
      void request;
    } finally {
      await cleanup(email);
    }
  });
});
