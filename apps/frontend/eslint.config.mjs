// ESLint 9 flat config.
//
// Replaces .eslintrc.js: ESLint 9 only reads eslintrc when
// ESLINT_USE_FLAT_CONFIG=false, and `next lint` (which used to paper over this)
// was removed in Next 16, so `pnpm lint` failed on both counts. eslint-config-next@16
// already ships flat arrays, so no FlatCompat shim is needed.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**",
    ],
  },
  ...nextCoreWebVitals,
];
