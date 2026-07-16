import { defineConfig, devices } from "@playwright/test";

// Deliberately not 3000: these run against a production build, and colliding
// with a dev server on 3000 would silently test the wrong thing — a dev server
// has no service worker, so every PWA assertion would be meaningless.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

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
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
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
