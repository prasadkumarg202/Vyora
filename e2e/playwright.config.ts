import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE = path.join(here, ".auth/tenant.json");

// Deliberately not 3000: these run against a production build, and colliding
// with a dev server on 3000 would silently test the wrong thing — a dev server
// has no service worker, so every PWA assertion would be meaningless.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * Whether a real Supabase project is reachable.
 *
 * Everything behind sign-in needs one: the setup project mints an OTP through
 * the admin API and saves a session the shell suite reuses. With no project —
 * a fork, a clean CI runner, a contributor without credentials — that setup
 * skips, and every dependent project then dies on a storage-state file that
 * was never written. Ninety red tests, none of them about the product.
 *
 * So those projects are not registered at all when there is nothing to sign in
 * to. The public suite still runs, and the report says "3 tests" rather than
 * lying with a wall of failures.
 */
const CAN_SIGN_IN = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * Critical-flow e2e per the Testing Strategy spec. The offline and sync suites
 * arrive with Phase 6, once there is an outbox to interrupt.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // A stray test.only that passes locally must not pass silently in CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  expect: {
    /**
     * Font hinting and sub-pixel antialiasing differ between a developer's
     * machine and CI, so a byte-exact screenshot comparison fails for reasons
     * that have nothing to do with the product. A small ratio catches a broken
     * layout while tolerating a differently-rendered glyph.
     */
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      scale: "css",
    },
  },
  projects: [
    ...(CAN_SIGN_IN
      ? ([
    // Signs in once; the shell suite reuses the state.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
      testIgnore: /(auth\.(setup|spec)|pricing-public\.spec)\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
      /**
       * The billing specs are excluded here, not because they are desktop-only,
       * but because they time-travel one shared workspace row. Running the same
       * spec in two projects at once would have each one moving the calendar
       * under the other, and the failures would look like product bugs.
       */
      testIgnore:
        /(auth\.(setup|spec)|pricing-public\.spec|billing-[a-z]+\.spec)\.ts/,
    },
    // Auth drives sign-in itself, so it must start signed out.
    {
      name: "auth",
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
      testMatch: /auth\.spec\.ts/,
    },
        ] as const)
      : []),
    // The public pricing page, signed out — half its assertions are that an
    // anonymous visitor gets in at all.
    {
      name: "public",
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
      testMatch: /pricing-public\.spec\.ts/,
    },
  ],
  webServer: {
    // Serwist is disabled in dev, so the service worker only exists in a
    // production build. Anything asserting offline behaviour needs this.
    command:
      "pnpm --filter @vyora/web build && pnpm --filter @vyora/web exec next start --port 3100",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    cwd: "..",
    timeout: 180_000,
  },
});
