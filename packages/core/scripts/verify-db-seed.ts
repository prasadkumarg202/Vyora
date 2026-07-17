/**
 * Round-trips every business_types.config row from the database back through
 * parseBusinessTypeConfig — the same trust boundary the app uses at runtime.
 *
 * Seeding is only half the job: a row that cannot be parsed back is a row that
 * will fail on a real user's first invoice. This proves the jsonb we wrote is
 * the jsonb the engine accepts.
 */
import { readFileSync } from "node:fs";

import { parseBusinessTypeConfig } from "../src/registry";

const env = Object.fromEntries(
  readFileSync("../../apps/web/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL!;
const key = env.SUPABASE_SERVICE_ROLE_KEY!;

const res = await fetch(`${url}/rest/v1/business_types?select=key,config&order=key`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const rows = (await res.json()) as { key: string; config: unknown }[];

let ok = 0;
const failures: string[] = [];

for (const row of rows) {
  try {
    const config = parseBusinessTypeConfig(row.config);
    if (config.businessType !== row.key) {
      failures.push(`${row.key}: config.businessType is "${config.businessType}"`);
      continue;
    }
    ok++;
  } catch (err) {
    failures.push(`${row.key}: ${(err as Error).message.slice(0, 120)}`);
  }
}

console.log(`parsed ${ok}/${rows.length} configs straight from the database`);
for (const f of failures) console.log("  FAIL", f);
process.exit(failures.length === 0 ? 0 : 1);
