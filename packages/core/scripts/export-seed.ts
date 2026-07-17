/**
 * Emits the compiled BUSINESS_TYPES as JSON for seeding business_types.config.
 *
 * The database is seeded from the engine's own compiled configs rather than
 * from a hand-written SQL literal, so the rows and the code cannot drift: if
 * the seed changes, re-running this is the only way rows change.
 */
import { writeFileSync } from "node:fs";

import { BUSINESS_TYPES } from "../src/seed/business-types";

const out = process.argv[2];
if (!out) throw new Error("usage: export-seed <outfile>");

// business_types.key mirrors config.businessType — the engine's own name for
// the vertical. Keeping them equal is what lets a row loaded from jsonb be
// handed straight to requireBusinessType().
const rows = BUSINESS_TYPES.map((config) => ({
  key: config.businessType,
  label: config.label,
  is_system: true,
  config,
}));

writeFileSync(out, JSON.stringify(rows, null, 2), "utf8");
console.log(`wrote ${rows.length} business types -> ${out}`);
console.log(rows.map((r) => r.key).join(", "));
