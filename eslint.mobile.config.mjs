/**
 * Config eslint DEDICADA a `apps/mobile` (se invoca con `--config` desde
 * `pnpm lint`, no hereda de `eslint.config.mjs`).
 *
 * Por que separada: la config raiz arrastra el preset de Next
 * (`core-web-vitals` + `typescript`), que sobre un arbol React Native emite ~190
 * problemas irrelevantes (`jsx-a11y/alt-text` sobre el `<Image>` de expo,
 * `@next/next/*`, dependencias de hooks) y tarda ~70 s. Este archivo carga SOLO
 * el parser de TypeScript (reutilizado de `eslint-config-next/typescript`, ya
 * declarado como devDependency: cero dependencias nuevas) y las reglas locales
 * que reemplazaron a los guards textuales de vitest:
 *
 *   - local/no-prices-in-mobile      ← tests/mobile-no-prices.test.ts
 *   - local/store-plan-caption       ← tests/mobile/store-copy.test.ts
 *   - local/no-nativewind-vars-copy  ← tests/mobile/brand-vars-identity.test.ts (1er describe)
 *
 * Si algun dia se quiere lintear mobile "de verdad", el lugar es este archivo
 * (agregando presets pensados para RN), no la config de Next.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import local from "./tools/eslint-rules/index.mjs";

// El primer bloque de `eslint-config-next/typescript` es el que instala el
// parser de typescript-eslint (sin type-checking: no necesita `project`).
const tsLanguageOptions = nextTs.find((config) => config?.languageOptions?.parser)?.languageOptions;

if (!tsLanguageOptions) {
  throw new Error(
    "eslint-config-next/typescript ya no expone un parser: revisar eslint.mobile.config.mjs antes de que las reglas locales queden mudas.",
  );
}

/**
 * Plugins REGISTRADOS pero con CERO reglas encendidas. No es decorativo: el
 * codigo de `apps/mobile` trae `// eslint-disable-next-line react-hooks/…` y
 * `@typescript-eslint/…` escritos para el linter de Expo, y eslint marca como
 * error cualquier directiva que apunte a una regla que no conoce. Registrarlos
 * (reusando los que ya cargan los presets de Next, sin agregar dependencias)
 * deja esas directivas resolver en silencio.
 */
const knownPlugins = Object.assign(
  {},
  ...[...nextVitals, ...nextTs].map((config) => config?.plugins ?? {}),
);

export default defineConfig([
  globalIgnores([
    "apps/mobile/node_modules/**",
    "apps/mobile/android/**",
    "apps/mobile/ios/**",
    "apps/mobile/dist/**",
    "apps/mobile/.expo/**",
    "apps/mobile/.expo-shared/**",
    // El guard textual que estas reglas reemplazan barria solo `.ts`/`.tsx`
    // (`CODE_EXT = /\.tsx?$/`); los `*.config.js` de Expo quedan igual que antes.
    "apps/mobile/**/*.{js,jsx,mjs,cjs}",
  ]),
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    languageOptions: tsLanguageOptions,
    // Esas directivas apuntan a reglas que aca estan apagadas a proposito: no
    // son "sin usar", son de otro linter (el de Expo).
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: { ...knownPlugins, local },
    rules: {
      "local/no-prices-in-mobile": "error",
      "local/store-plan-caption": "error",
      "local/no-nativewind-vars-copy": "error",
    },
  },
]);
