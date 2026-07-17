import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // node:sqlite gives the tests a real SQLite. The OPFS driver is
    // browser-only and is covered by the e2e suite instead.
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/driver.ts",
        // Browser-only: needs OPFS + SharedArrayBuffer, which Node has neither of.
        "src/drivers/opfs.ts",
      ],
      // Branches sits at 80 rather than the 90 used for money/crypto/sync. The
      // two uncovered branches in migrate.ts are defensive guards for states
      // that cannot occur — PRAGMA user_version always returns a row, and
      // MIGRATIONS is a static array with no holes. Reaching them would mean
      // testing a mock instead of the code, so the guards stay and the number
      // tells the truth.
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
