import { describe, expect, it } from "vitest";

import { parseBusinessTypeConfig } from "../registry.js";
import { BUSINESS_TYPES } from "./business-types.js";

/**
 * The seed is TypeScript, but at runtime a config arrives as `business_types.config`
 * — jsonb, parsed from text, typed `unknown`. `parseBusinessTypeConfig` is the
 * trust boundary in between.
 *
 * These two must agree. A seed the parser rejects is a vertical that works in
 * the client bundle and dies the moment it is loaded from Postgres, which is
 * exactly the path a custom (no-code) vertical always takes.
 */
describe("every seeded vertical survives the jsonb round trip", () => {
  it.each([...BUSINESS_TYPES])("$businessType", (config) => {
    const throughJsonb: unknown = JSON.parse(JSON.stringify(config));

    expect(() => parseBusinessTypeConfig(throughJsonb)).not.toThrow();
    expect(parseBusinessTypeConfig(throughJsonb)).toEqual(config);
  });

  it("loses nothing to JSON — no undefined, functions, or Dates in the seed", () => {
    for (const config of BUSINESS_TYPES) {
      expect(JSON.parse(JSON.stringify(config))).toEqual(config);
    }
  });
});
