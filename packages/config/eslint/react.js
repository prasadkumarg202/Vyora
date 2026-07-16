import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

import { baseConfig } from "./base.js";

/**
 * Config for packages that ship React components (packages/ui, apps/*).
 * @type {import("eslint").Linter.Config[]}
 */
export const reactConfig = [
  ...baseConfig,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: { react: { version: "detect" } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TypeScript already checks prop types; the eslint rule only produces
      // false positives on typed forwardRef/function components.
      "react/prop-types": "off",
      // The new JSX transform needs no React import.
      "react/react-in-jsx-scope": "off",
    },
  },
];

export default reactConfig;
