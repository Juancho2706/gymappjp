import { defineConfig, defaultExclude } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Alias compartidos por los cuatro projects. Con `test.projects` la raiz ya NO resuelve
// modulos: cada project necesita su propia copia (por eso viven en esta constante).
const alias = {
  '@': path.resolve(__dirname, './apps/web/src'),
  '@eva/brand-kit': path.resolve(__dirname, './packages/brand-kit/index.ts'),
  '@eva/nutrition-v2': path.resolve(__dirname, './packages/nutrition-v2/index.ts'),
  '@eva/nutrition-v2/design': path.resolve(__dirname, './packages/nutrition-v2/design.ts'),
  '@eva/nutrition-v2/contracts': path.resolve(__dirname, './packages/nutrition-v2/contracts.ts'),
  // Subpath ANTES del paquete raiz (resolucion por prefijo).
  '@eva/schemas/screening': path.resolve(__dirname, './packages/schemas/screening.ts'),
  '@eva/schemas/bodycomp': path.resolve(__dirname, './packages/schemas/bodycomp.ts'),
  '@eva/schemas/persona': path.resolve(__dirname, './packages/schemas/persona.ts'),
  // Alcanzado desde `api/mobile/nutrition-v2/_shared` -> feature-prefs.service ->
  // nutrition-exchanges.service. Sin este subpath el alias raiz resolvia a
  // `packages/schemas/index.ts/nutrition-exchanges` y la suite del endpoint no cargaba.
  '@eva/schemas/nutrition-exchanges': path.resolve(__dirname, './packages/schemas/nutrition-exchanges.ts'),
  '@eva/schemas': path.resolve(__dirname, './packages/schemas/index.ts'),
  '@eva/calc': path.resolve(__dirname, './packages/calc/index.ts'),
  '@eva/tiers': path.resolve(__dirname, './packages/tiers/index.ts'),
  '@eva/nutrition-engine': path.resolve(__dirname, './packages/nutrition-engine/index.ts'),
  '@eva/module-catalog': path.resolve(__dirname, './packages/module-catalog/catalog.ts'),
  '@eva/feature-prefs': path.resolve(__dirname, './packages/feature-prefs/index.ts'),
  '@eva/workout-engine': path.resolve(__dirname, './packages/workout-engine/index.ts'),
  '@eva/plan-builder': path.resolve(__dirname, './packages/plan-builder/index.ts'),
  '@eva/cardio': path.resolve(__dirname, './packages/cardio/index.ts'),
  '@eva/coach-nav': path.resolve(__dirname, './packages/coach-nav/index.ts'),
  '@eva/onboarding': path.resolve(__dirname, './packages/onboarding/index.ts'),
  // Subpath ANTES del paquete raiz (resolucion por prefijo).
  '@eva/bodycomp/fixtures': path.resolve(__dirname, './packages/bodycomp/fixtures.ts'),
  '@eva/bodycomp': path.resolve(__dirname, './packages/bodycomp/index.ts'),
  '@eva/profile-analytics': path.resolve(__dirname, './packages/profile-analytics/index.ts'),
  // `server-only` throws outside an RSC; neutralize it for unit tests that transitively
  // import server modules. Build-time boundary is still enforced by Next.js.
  'server-only': path.resolve(__dirname, './vitest.server-only-stub.ts'),
}

// Base comun a todos los projects.
// El switch de lanzamiento de add-ons (SELF_SERVICE_ADDONS_ENABLED) se lee de env var
// (fail-closed por default). La suite ejercita los flujos de add-on, asi que lo prendemos en test
// para mantener cobertura; el default seguro (false) se valida en los tests de gating del flag.
const shared = {
  globals: true,
  setupFiles: ['./vitest.setup.ts'],
  env: { NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED: 'true' },
  alias,
} as const

// Playwright specs viven en `tests/*.spec.ts`; el patron `*.test.*` ya los deja fuera.
// `scripts/**` cubre los helpers puros de los drivers offline (p.ej.
// scripts/nutrition-v2-conversion/report.ts).
const WEB_TS = ['apps/web/src/**/*.test.ts', 'tests/**/*.test.ts', 'packages/**/*.test.ts', 'scripts/**/*.test.ts']
const WEB_TSX = ['apps/web/src/**/*.test.tsx', 'tests/**/*.test.tsx', 'packages/**/*.test.tsx', 'scripts/**/*.test.tsx']

// `tests/mobile/**` sale de los projects `web-*` porque necesita su propio testTimeout.
const excludeMobile = [...defaultExclude, 'tests/mobile/**']

// tests/mobile/** monta modulos de apps/mobile con `vi.doMock` + import() dinamico dentro del
// propio test: la primera transformacion del grafo de RN cae DENTRO del timeout del caso, y con
// la maquina cargada los 5 s por defecto no alcanzan. Sube SOLO aca, no el global.
const MOBILE_TEST_TIMEOUT = 15_000

// Por que projects y no `environment: 'jsdom'` global (2026-09-02): levantar jsdom cuesta ~2-3 s
// de CPU por archivo y el 92 % de la suite (619 de 676 archivos) es logica pura que no toca el
// DOM. Medicion antes/despues en docs/testing/TEST_STATUS.md.
// Regla: `*.test.tsx` => jsdom; `*.test.ts` => node. Un `.test.ts` que si necesite DOM lo pide
// por archivo con `// @vitest-environment jsdom` en la primera linea.
// (`environmentMatchGlobs` no existe en Vitest 4; `test.projects` es el mecanismo vigente.)
export default defineConfig({
  test: {
    // Local: como maximo la mitad de los cores, para no dejar el PC inusable mientras corre.
    // En CI el runner es dedicado y conviene usarlo entero.
    maxWorkers: process.env.CI ? '100%' : '50%',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    projects: [
      {
        plugins: [react()],
        test: {
          ...shared,
          name: 'web-node',
          environment: 'node',
          include: WEB_TS,
          exclude: excludeMobile,
        },
      },
      {
        plugins: [react()],
        test: {
          ...shared,
          name: 'web-dom',
          environment: 'jsdom',
          include: WEB_TSX,
          exclude: excludeMobile,
        },
      },
      {
        plugins: [react()],
        test: {
          ...shared,
          name: 'mobile-node',
          environment: 'node',
          include: ['tests/mobile/**/*.test.ts'],
          testTimeout: MOBILE_TEST_TIMEOUT,
        },
      },
      {
        plugins: [react()],
        test: {
          ...shared,
          name: 'mobile-dom',
          environment: 'jsdom',
          include: ['tests/mobile/**/*.test.tsx'],
          testTimeout: MOBILE_TEST_TIMEOUT,
        },
      },
    ],
  },
})
