// Root ESLint 9 flat config.
//
// Covers the shared TypeScript workspaces (packages/*), which shipped a
// `lint` script but no config at all — ESLint 9 then failed with "couldn't
// find eslint.config.js" and took `pnpm lint` down with it. ESLint resolves
// the nearest config walking up from cwd, so turbo running `eslint src` inside
// packages/<name> finds this file, while apps/frontend keeps its own
// Next-specific config.
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      // Linted by apps/frontend/eslint.config.mjs instead.
      "apps/frontend/**",
      // Python.
      "apps/backend/**",
    ],
  },
  ...tseslint.configs.recommended,
];
