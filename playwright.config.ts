import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file (PERF_COACH_*, PLAYWRIGHT_BASE_URL, etc.).
 * Same idea as Next: `.env.local` first so local overrides win over `.env`.
 */
import dotenv from 'dotenv'
import path from 'path'
import { QA_COACH_STORAGE_STATE } from './tests/_fixtures/storage-state'

// .env.e2e.local forces local Supabase — loaded first with override so prod
// values in .env.local never leak into E2E runs.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e.local'), override: true })
dotenv.config({ path: path.resolve(__dirname, '.env.local') })
dotenv.config({ path: path.resolve(__dirname, '.env') })

/**
 * MODO SUAVE (`setup` + `prod-suave`) — QA contra PRODUCCIÓN sin volver a tumbar la base.
 *
 * El 2026-08-22 una tanda con 6 navegadores en paralelo contra https://www.eva-app.cl dejó la
 * base de datos abajo. La respuesta no fue dejar de usar Playwright, sino darle freno de mano:
 * un solo navegador, sin paralelismo, sin reintentos, un login por tanda y un guardián que corta
 * la tanda entera si `/api/health` reporta que la DB está sufriendo.
 *
 * Reglas operativas completas (horario, techo de requests, purga de cuentas QA):
 * docs/operations/QA_PLAYWRIGHT.md.
 */
const PROD_SUAVE_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://www.eva-app.cl'

/**
 * `webServer` arranca `npm run dev` cuando no hay `PLAYWRIGHT_BASE_URL`. Para el modo suave —que
 * apunta a producción por defecto, sin esa env— levantar un dev server sería, además de inútil,
 * un segundo cliente contra Supabase. Se detecta el proyecto en el comando y se apaga.
 */
const RUNNING_PROD_SUAVE = process.argv.some((arg) => arg.includes('prod-suave'))

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // tests/nutrition-v2 y tests/smoke corren en sus propios projects.
      // tests/smoke queda FUERA de acá a propósito: apunta a producción y solo debe correr
      // con el freno de mano del proyecto `prod-suave`, jamás en un fan-out paralelo.
      testIgnore: [/tests[\\/]nutrition-v2[\\/]/, /tests[\\/]smoke[\\/]/],
    },

    /* Nutrición V2 (canary). Los specs 1-4 corren contra el Preview de Vercel
     * (PLAYWRIGHT_BASE_URL) con las cuentas canary reales y se auto-omiten sin esa env;
     * fail-closed corre en dev local (sin EDGE_CONFIG). Serial: mutan estado compartido
     * de un único alumno QA en prod. Cada spec se loguea solo (sin dependencia de 'setup').
     * Correr con --workers=1. */
    {
      name: 'nutrition-v2',
      testMatch: /tests[\\/]nutrition-v2[\\/].+\.spec\.ts$/,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },

    /* MODO SUAVE — paso 1: el ÚNICO login de la tanda.
     * Guarda el storageState del coach QA en .auth/qa-coach.json (ignorado por git) para que
     * ningún spec vuelva a pasar por /login. Sin E2E_QA_COACH_* el setup se salta solo y la
     * tanda entera queda skipped, que es el fallo correcto: nunca hay credencial en el repo. */
    {
      name: 'setup',
      testMatch: /tests[\\/]smoke[\\/]auth\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: PROD_SUAVE_BASE_URL },
    },

    /* MODO SUAVE — paso 2: los smokes.
     * Cada opción de acá es una lección del incidente del 22-08, no una preferencia:
     *   workers: 1        un solo navegador contra la base;
     *   fullyParallel     apagado: los specs se turnan, no compiten;
     *   retries: 0        un test rojo por base caída NO se reintenta (sería más carga);
     *   timeout 45 s      producción real es más lenta que un dev server, pero un test colgado
     *                     mantiene una sesión abierta: 45 s es el techo, no la expectativa.
     * El ritmo, la dieta de red y el guardián de salud viven en tests/_fixtures/suave.ts. */
    {
      name: 'prod-suave',
      testMatch: /tests[\\/]smoke[\\/].+\.spec\.ts$/,
      dependencies: ['setup'],
      workers: 1,
      fullyParallel: false,
      retries: 0,
      timeout: 45_000,
      expect: { timeout: 10_000 },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: PROD_SUAVE_BASE_URL,
        storageState: QA_COACH_STORAGE_STATE,
        // Marca la tanda en los logs de Vercel: cuando algo raro aparezca en producción, este
        // header dice "fui yo haciendo QA" y no un usuario real.
        extraHTTPHeaders: { 'x-eva-qa': 'playwright' },
        trace: 'retain-on-failure',
      },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  // Con PLAYWRIGHT_BASE_URL seteado apuntamos a un servidor remoto (Preview de Vercel /
  // canary): no levantamos el dev server local. Sin esa env, arranca el dev local contra
  // Supabase local (comportamiento por defecto de la suite).
  // `prod-suave` apunta a producción sin PLAYWRIGHT_BASE_URL, así que además de la env hay que
  // mirar el proyecto: levantar un dev server para una tanda contra prod sería un cliente extra
  // contra Supabase, justo lo que el modo suave existe para evitar.
  webServer:
    process.env.PLAYWRIGHT_BASE_URL || RUNNING_PROD_SUAVE
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Pass local Supabase vars explicitly so the dev server never uses prod DB
        // regardless of what .env.local contains.
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000',
        },
      },
});
