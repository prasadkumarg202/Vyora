import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * Base config for every package in the monorepo.
 * @type {import("eslint").Linter.Config[]}
 */
export const baseConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Secrets in env only: never let a literal key land in the repo.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^(sk-|eyJ[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{20,})/]",
          message:
            "This looks like a hardcoded secret. Secrets live in env only.",
        },
      ],
    },
  },
  {
    ignores: ["dist/**", ".next/**", ".turbo/**", "node_modules/**"],
  },
];

export default baseConfig;
