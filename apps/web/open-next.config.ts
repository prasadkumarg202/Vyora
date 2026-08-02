import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext → Cloudflare adapter config.
 *
 * Defaults are fine to start: no KV/R2 incremental cache yet (the app is
 * offline-first client-side; server pages are mostly dynamic). If ISR/static
 * regeneration is added later, wire incrementalCache to KV or R2 here.
 */
export default defineCloudflareConfig();
