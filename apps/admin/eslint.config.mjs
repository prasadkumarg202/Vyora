import { nextConfig } from "@vyora/config/eslint/next";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextConfig,
  {
    ignores: [".next/**"],
  },
];
