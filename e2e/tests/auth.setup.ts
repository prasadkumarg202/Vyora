import fs from "node:fs";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

import {
  FIXTURE_EMAIL,
  STORAGE_STATE,
  isConfigured,
  otpFor,
} from "../fixtures/auth";

/**
 * Signs the fixture tenant in once and saves the browser state.
 *
 * The shell suite is about the shell, not about logging in — auth has its own
 * spec. Signing in per test would triple the runtime and make every shell
 * failure ambiguous between "the shell broke" and "login broke".
 */
setup("authenticate the fixture tenant", async ({ page }) => {
  setup.skip(!isConfigured, "needs apps/web/.env.local with a Supabase project");
  setup.slow();

  const code = await otpFor(FIXTURE_EMAIL);

  // Resume at the verify step: the send itself is Supabase's, and its built-in
  // SMTP allows ~2 mails an hour per project.
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key!, value!),
    ["vyora.login.pending", JSON.stringify({ step: "verify", email: FIXTURE_EMAIL })],
  );
  await page.goto("/login");

  await expect(page.getByText("Enter the code")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify & sign in" }).click();

  // Wait on content, not the URL. The form always pushes to /dashboard, and the
  // shell then bounces a user with no workspace to /welcome — so the URL reads
  // "/dashboard" for a moment on a route that is about to redirect. Checking it
  // there silently skips the setup below and leaves the fixture half-built.
  const welcome = page.getByRole("heading", { name: "Create your workspace" });
  const dashboard = page.getByRole("heading", { name: "Dashboard" });

  await expect(welcome.or(dashboard)).toBeVisible({ timeout: 30_000 });

  // A brand-new fixture lands on /welcome; an existing one is already inside.
  if (await welcome.isVisible()) {
    await page.getByLabel("Business name").fill("E2E Fixture Pharmacy");
    await page.getByLabel("Business type").selectOption("pharmacy");
    await page.getByRole("button", { name: "Create workspace" }).click();
  }

  await expect(dashboard).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard$/);

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
