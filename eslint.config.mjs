import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const sourceFiles = ["**/*.{js,jsx,ts,tsx}"];

export default defineConfig([
  ...tseslint.configs.recommended,
  {
    ...react.configs.flat.recommended,
    files: sourceFiles,
    settings: { react: { version: "detect" } },
  },
  {
    ...react.configs.flat["jsx-runtime"],
    files: sourceFiles,
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: sourceFiles,
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: sourceFiles,
  },
  {
    files: sourceFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-unused-vars": "off",
      "prefer-const": "off",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "jsx-a11y/no-autofocus": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",
    "coverage/**",
    "node_modules/**",
    "services/lens-api/**",
    "drizzle/**",
  ]),
]);
