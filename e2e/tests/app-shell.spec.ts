import { expect, test } from "@playwright/test";

test("root redirects into the app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("sync pill is present and reports connectivity", async ({ page }) => {
  await page.goto("/dashboard");
  const pill = page.locator("[data-sync-state]");
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute("data-sync-state", "synced");
});

test("sync pill flips to offline and recovers", async ({ page, context }) => {
  await page.goto("/dashboard");
  const pill = page.locator("[data-sync-state]");

  await context.setOffline(true);
  await expect(pill).toHaveAttribute("data-sync-state", "offline");
  await expect(pill).toHaveText("Offline");

  // Losing the network must not tear down the screen the user is on. The
  // stronger promise — that *writes* keep working offline — needs the local DB
  // and outbox from Phase 6.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await context.setOffline(false);
  await expect(pill).toHaveAttribute("data-sync-state", "synced");
});

test("manifest is served and installable", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();

  const manifest = (await res.json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { sizes: string; purpose?: string }[];
  };
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((i) => i.sizes)).toContain("512x512");
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBeTruthy();
});

test("PWA icons are served as real images", async ({ request }) => {
  for (const icon of ["/icons/icon-192.png", "/icons/icon-512.png"]) {
    const res = await request.get(icon);
    expect(res.ok(), `${icon} should be served`).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("image/png");
  }
});

test("service worker registers and controls the page", async ({ page }) => {
  await page.goto("/dashboard");

  // Serwist registers on load; give it a moment to activate.
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 20_000 },
  );

  const scriptURL = await page.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL,
  );
  expect(scriptURL).toContain("/sw.js");
});

test("every module route in the nav renders its heading", async ({ page }) => {
  // 18 navigations in one test.
  test.slow();

  await page.goto("/dashboard");
  const links = page.locator("nav[aria-label='Main'] a");
  await expect(links).toHaveCount(18);

  const routes = await links.evaluateAll((els) =>
    els.map((el) => ({
      label: (el.textContent ?? "").trim(),
      href: el.getAttribute("href")!,
    })),
  );

  for (const route of routes) {
    await page.goto(route.href);
    // Each route renders its own top-level heading. Not matched to the nav
    // label: a real module titles itself for clarity (the CRM link opens the
    // "Customers" directory), so the invariant is "the route loads and shows an
    // h1", not "the h1 equals the link text".
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 30_000,
    });
  }
});
