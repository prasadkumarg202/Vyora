import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/types.ts"],
      // Sync decides which version of a shop's data survives; a bug here is
      // silent data loss, so it sits in the same tier as money and crypto.
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
