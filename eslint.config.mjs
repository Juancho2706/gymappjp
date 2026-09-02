import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import local from "./tools/eslint-rules/index.mjs";

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
      "no-console": ["warn", { "allow": ["warn", "error"] }],
      // EVA-NEXTJS-18: el useReducedMotion de framer lee el media query en el PRIMER render de
      // cliente (useState sincrono) => con "Reducir movimiento" activado, todo componente que
      // bifurca con el hidrata contra HTML distinto y React regenera el arbol en cada carga.
      // Usar el wrapper hydration-safe (mismo nombre/contrato, useSyncExternalStore).
      "no-restricted-imports": ["error", {
        "paths": [{
          "name": "framer-motion",
          "importNames": ["useReducedMotion"],
          "message": "Hydration mismatch con reduce-motion (EVA-NEXTJS-18): importar useReducedMotion desde '@/lib/use-reduced-motion'."
        }]
      }]
    }
  },
  // ── Reglas locales de contrato de archivo ────────────────────────────────────
  // Cada bloque acota una regla al archivo que su test viejo cubria (ver
  // tools/eslint-rules/index.mjs). Las reglas de `apps/mobile/**` NO viven aca:
  // esta config arrastra el preset de Next (que sobre RN emite ~190 falsos
  // positivos), asi que el arbol movil se lintea con `eslint.mobile.config.mjs`.
  {
    // `[coach_slug]` es una clase de caracteres en glob: se escribe con `*`.
    files: ["apps/web/src/app/c/*/login/loading.tsx"],
    plugins: { local },
    rules: { "local/student-login-loading-unbranded": "error" },
  },
  {
    files: ["apps/web/src/app/coach/subscription/_components/SubscriptionContent.tsx"],
    plugins: { local },
    rules: {
      "local/subscription-modules-included": "error",
      "local/subscription-price-suffix": "error",
      "local/subscription-open-in-app-gate": "error",
    },
  },
  {
    // Los parentesis de `(auth)` son sintaxis extglob: se evita el segmento.
    files: ["apps/web/src/app/**/register/page.tsx"],
    plugins: { local },
    rules: { "local/register-free-tier-contract": "error" },
  },
  {
    files: ["apps/web/src/app/hecho-con-eva/page.tsx"],
    plugins: { local },
    rules: { "local/hecho-con-eva-metadata": "error" },
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
