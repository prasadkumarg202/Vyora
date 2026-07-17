import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // WebCrypto and OPFS are browser APIs; node >= 20 provides the WebCrypto
    // half, which is all the key hierarchy needs.
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/types.ts"],
      // Crypto is the spec's 100%-coverage tier alongside money.
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
