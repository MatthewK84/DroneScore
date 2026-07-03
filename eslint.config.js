import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat ESLint config. Enforces the strict standards: no var, const by
 * default, no eval, no unused bindings, and the React hook rules. The
 * code is written to pass with zero warnings and zero suppressions.
 */

const NODE_GLOBALS = {
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  fetch: "readonly",
  AbortController: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
};

const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  fetch: "readonly",
  AbortController: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  console: "readonly",
};

const SHARED_RULES = {
  "no-var": "error",
  "prefer-const": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  eqeqeq: ["error", "smart"],
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
};

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["server/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: NODE_GLOBALS,
    },
    rules: SHARED_RULES,
  },
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: BROWSER_GLOBALS,
    },
    settings: { react: { version: "18" } },
    rules: {
      ...SHARED_RULES,
      ...react.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["*.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: NODE_GLOBALS },
    rules: SHARED_RULES,
  },
];
