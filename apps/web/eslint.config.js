import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * App-local ESLint for `@sanctuary-os/web`.
 *
 * The root `pnpm lint` only globs `.ts` (so it never sees this app's `.tsx`).
 * This config lints both `.ts` and `.tsx` under the same strict, type-checked
 * ruleset the rest of the monorepo uses, plus React Hooks / Fast Refresh rules.
 * Run via the app-local `lint` script; it does not affect the root lint.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
);
