import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Playwright specs live under tests/*.spec.ts — exclude them from Vitest.
    include: ['apps/web/src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // El switch de lanzamiento de add-ons (SELF_SERVICE_ADDONS_ENABLED) ahora se lee de env var
    // (fail-closed por default). La suite ejercita los flujos de add-on, así que lo prendemos en test
    // para mantener cobertura; el default seguro (false) se valida en los tests de gating del flag.
    env: { NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED: 'true' },
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
      '@eva/brand-kit': path.resolve(__dirname, './packages/brand-kit/index.ts'),
      // Subpath ANTES del paquete raiz (resolucion por prefijo).
      '@eva/schemas/screening': path.resolve(__dirname, './packages/schemas/screening.ts'),
      '@eva/schemas/bodycomp': path.resolve(__dirname, './packages/schemas/bodycomp.ts'),
      '@eva/schemas': path.resolve(__dirname, './packages/schemas/index.ts'),
      '@eva/calc': path.resolve(__dirname, './packages/calc/index.ts'),
      '@eva/tiers': path.resolve(__dirname, './packages/tiers/index.ts'),
      '@eva/nutrition-engine': path.resolve(__dirname, './packages/nutrition-engine/index.ts'),
      '@eva/module-catalog': path.resolve(__dirname, './packages/module-catalog/catalog.ts'),
      '@eva/feature-prefs': path.resolve(__dirname, './packages/feature-prefs/index.ts'),
      '@eva/workout-engine': path.resolve(__dirname, './packages/workout-engine/index.ts'),
      '@eva/plan-builder': path.resolve(__dirname, './packages/plan-builder/index.ts'),
      '@eva/cardio': path.resolve(__dirname, './packages/cardio/index.ts'),
      // Subpath ANTES del paquete raiz (resolucion por prefijo).
      '@eva/bodycomp/fixtures': path.resolve(__dirname, './packages/bodycomp/fixtures.ts'),
      '@eva/bodycomp': path.resolve(__dirname, './packages/bodycomp/index.ts'),
      '@eva/profile-analytics': path.resolve(__dirname, './packages/profile-analytics/index.ts'),
      // `server-only` throws outside an RSC; neutralize it for unit tests that transitively
      // import server modules. Build-time boundary is still enforced by Next.js.
      'server-only': path.resolve(__dirname, './vitest.server-only-stub.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
