import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file (PERF_COACH_*, PLAYWRIGHT_BASE_URL, etc.).
 * Same idea as Next: `.env.local` first so local overrides win over `.env`.
 */
import dotenv from 'dotenv'
import path from 'path'

// .env.e2e.local forces local Supabase — loaded first with override so prod
// values in .env.local never leak into E2E runs.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e.local'), override: true })
dotenv.config({ path: path.resolve(__dirname, '.env.local') })
dotenv.config({ path: path.resolve(__dirname, '.env') })

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
    /* Auth setup para la suite de separación: logea las 9 personas y persiste
     * storageState en playwright/.auth/. Solo corre como dependencia del
     * project 'separation'. [\\/] = separador portable Windows/POSIX. */
    {
      name: 'setup',
      testMatch: /separation[\\/]auth\.setup\.ts$/,
    },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // tests/separation y tests/nutrition-v2 corren en sus propios projects.
      testIgnore: /tests[\\/](separation|nutrition-v2)[\\/]/,
    },

    /* Suite de separación de flujos (standalone / enterprise / team).
     * Depende de 'setup' (storageStates). Correr con --workers=1. */
    {
      name: 'separation',
      testMatch: /tests[\\/]separation[\\/].+\.spec\.ts$/,
      dependencies: ['setup'],
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
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
  webServer: process.env.PLAYWRIGHT_BASE_URL
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
