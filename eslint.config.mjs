import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "react-hooks/set-state-in-effect": "off",
      "prefer-const": "warn",
      // Surfaces stray console.log/info/debug (data-leak risk in prod logs); structured
      // console.error/warn ops signals stay allowed. Triage server-path logs, then ratchet
      // to "error". See docs/audits/deferred-attack-plan-2026-06-24.md (Fase 1.2).
      "no-console": ["warn", { "allow": ["warn", "error"] }]
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".claude/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
