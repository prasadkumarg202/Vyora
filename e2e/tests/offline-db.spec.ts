import { expect, test } from "@playwright/test";

/**
 * The on-device database, in a real browser.
 *
 * This is the one thing that cannot be proven in Node: OPFS and
 * SharedArrayBuffer do not exist there. Everything in @vyora/db's unit tests
 * runs against node:sqlite, which verifies the schema but says nothing about
 * whether sqlite-wasm actually opens a durable file on this device.
 *
 * The failure this guards against is the nastiest one in the system: without
 * cross-origin isolation, sqlite-wasm silently falls back to a transient
 * in-memory database. Everything looks fine until a reload, and the day's
 * invoices are gone.
 */

test.describe("on-device database", () => {
  test("is cross-origin isolated, so SharedArrayBuffer exists", async ({ page }) => {
    await page.goto("/administration");
    const env = await page.evaluate(() => ({
      crossOriginIsolated: globalThis.crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      opfs: typeof navigator.storage?.getDirectory === "function",
    }));
    // Without COOP/COEP all three collapse and the local DB degrades to memory.
    expect(env).toEqual({
      crossOriginIsolated: true,
      sharedArrayBuffer: true,
      opfs: true,
    });
  });

  test("serves sqlite-wasm unbundled and ungated", async ({ request }) => {
    // Two ways these break, both silent: the auth middleware 307s them to
    // /login, or the bundler rewrites the OPFS proxy's worker URL and drops
    // its ?vfs=opfs argument.
    for (const asset of [
      "/sqlite/index.mjs",
      "/sqlite/sqlite3.wasm",
      "/sqlite/sqlite3-opfs-async-proxy.js",
    ]) {
      const res = await request.get(asset);
      expect(res.status(), `${asset} must be served, not redirected`).toBe(200);
      expect((await res.body()).byteLength).toBeGreaterThan(1000);
    }
  });

  test("opens SQLite on OPFS and migrates the schema", async ({ page }) => {
    test.slow();
    await page.goto("/administration");

    const status = page.getByTestId("offline-status");
    await expect(status).toHaveText("Ready", { timeout: 30_000 });
    await expect(page.getByTestId("offline-error")).toHaveCount(0);
    // Schema v1 means the migration actually ran against a real database.
    // Schema is at v2 since the marketing_campaigns migration.
    await expect(page.getByTestId("schema-version")).toHaveText("2");
  });

  test("writes survive a full reload — the 'never loses data' promise", async ({ page }) => {
    test.slow();
    await page.goto("/administration");
    await expect(page.getByTestId("offline-status")).toHaveText("Ready", { timeout: 30_000 });

    const before = Number(await page.getByTestId("row-count").textContent());

    await page.getByTestId("write-probe").click();
    await expect(page.getByTestId("row-count")).toHaveText(String(before + 1), {
      timeout: 15_000,
    });

    // The moment of truth: an in-memory fallback loses everything here.
    await page.reload();
    await expect(page.getByTestId("offline-status")).toHaveText("Ready", { timeout: 30_000 });
    await expect(page.getByTestId("row-count")).toHaveText(String(before + 1), {
      timeout: 15_000,
    });
  });
});
