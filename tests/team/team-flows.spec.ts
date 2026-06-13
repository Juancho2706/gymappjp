import { test, expect, type Page } from '@playwright/test'

/**
 * E2E del modelo TEAM (pool) — reproduce el smoke test manual del 2026-06-09 que encontró
 * 5 bugs (subscription gating, consent loop, next/image, workspace switcher, cruce de datos).
 * Corre contra un dev server apuntando a la Supabase con los datos de prueba (team movida-test).
 *
 * Credenciales por env (NO commitear passwords):
 *   E2E_POOL_COACH_EMAIL / E2E_POOL_COACH_PASSWORD   -> coach miembro del pool (Jose Fit)
 *   E2E_POOL_ALUMNO_EMAIL / E2E_POOL_ALUMNO_PASSWORD -> alumna del pool con consent (Carolina)
 * Sin credenciales -> specs se saltan (no rompen CI local sin secretos).
 *
 * Ejecutar: npx playwright test tests/team/team-flows.spec.ts --workers=1
 */

const TEAM_SLUG = 'movida-test'
const TEAM_NAME = 'Movida (test)'
const POOL_STUDENTS = ['Carolina', 'Diana']

const COACH_EMAIL = process.env.E2E_POOL_COACH_EMAIL ?? ''
const COACH_PASSWORD = process.env.E2E_POOL_COACH_PASSWORD ?? ''
const ALUMNO_EMAIL = process.env.E2E_POOL_ALUMNO_EMAIL ?? ''
const ALUMNO_PASSWORD = process.env.E2E_POOL_ALUMNO_PASSWORD ?? ''

const hasCoachCreds = !!(COACH_EMAIL && COACH_PASSWORD)
const hasAlumnoCreds = !!(ALUMNO_EMAIL && ALUMNO_PASSWORD)

/**
 * Detecta el OVERLAY DE ERROR de Next dev (no el portal: <nextjs-portal> siempre existe en dev 16
 * como host del botón DevTools). El diálogo de error vive en el shadow DOM ([data-nextjs-dialog]);
 * los locators CSS de Playwright atraviesan shadow roots.
 */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

test.describe.configure({ mode: 'serial' })

test.describe('Alumno de pool — /t/[team_slug]', () => {
    test.skip(!hasAlumnoCreds, 'E2E_POOL_ALUMNO_* no seteados')

    test('login del team muestra la marca del TEAM (no la del coach)', async ({ page }) => {
        await page.goto(`/t/${TEAM_SLUG}/login`)
        await expect(page.getByRole('heading', { name: TEAM_NAME })).toBeVisible()
        await expectNoRuntimeError(page)
    })

    async function loginAlumna(page: Page) {
        await page.goto(`/t/${TEAM_SLUG}/login`)
        await page.getByLabel('Email').fill(ALUMNO_EMAIL)
        await page.getByLabel('Contraseña').fill(ALUMNO_PASSWORD)
        await page.getByRole('button', { name: 'Ingresar' }).click()
        // OJO: el patrón debe EXCLUIR /login (un glob /t/slug/** matchea la propia página de login
        // y el wait pasa vacío). El login del team redirige a /t/[slug]/dashboard.
        await page.waitForURL(`**/t/${TEAM_SLUG}/dashboard**`, { timeout: 25_000 })
    }

    test('alumna con consent entra y la URL se queda en /t (rewrite, no redirect a /c)', async ({ page }) => {
        await loginAlumna(page)
        expect(page.url()).toContain(`/t/${TEAM_SLUG}/dashboard`)
        expect(page.url()).not.toContain('/consent')
        expect(page.url()).not.toContain('/c/')
        await expectNoRuntimeError(page)
    })

    test('visitar /consent ya consentida redirige al dashboard (gate idempotente, sin loop)', async ({ page }) => {
        await loginAlumna(page)
        await page.goto(`/t/${TEAM_SLUG}/consent`)
        await page.waitForURL(`**/t/${TEAM_SLUG}/dashboard**`, { timeout: 15_000 })
        await expectNoRuntimeError(page)
    })
})

test.describe('Coach del pool — contextos separados', () => {
    test.skip(!hasCoachCreds, 'E2E_POOL_COACH_* no seteados')

    async function loginCoach(page: Page) {
        await page.goto('/login')
        await page.getByRole('textbox', { name: /email/i }).fill(COACH_EMAIL)
        await page.getByRole('textbox', { name: /contraseña/i }).fill(COACH_PASSWORD)
        await page.getByRole('button', { name: /ingresar|iniciar/i }).click()
        // Multi-workspace -> puede caer en /workspace/select o en el último workspace usado.
        await page.waitForURL(/\/(workspace\/select|coach\/dashboard|org\/|c\/)/, { timeout: 25_000 })
    }

    async function switchWorkspace(page: Page, optionText: string | RegExp) {
        await page.goto('/workspace/select')
        await page.getByText(optionText).first().click()
        await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
    }

    test('el selector de workspace LISTA el team (bug del smoke: faltaba)', async ({ page }) => {
        await loginCoach(page)
        await page.goto('/workspace/select')
        await expect(page.getByText(TEAM_NAME).first()).toBeVisible({ timeout: 15_000 })
        await expectNoRuntimeError(page)
    })

    test('contexto TEAM: directorio muestra los alumnos del pool y el perfil abre sin crash', async ({ page }) => {
        await loginCoach(page)
        await switchWorkspace(page, TEAM_NAME)

        await page.goto('/coach/clients')
        for (const name of POOL_STUDENTS) {
            await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 })
        }
        await expectNoRuntimeError(page)

        // Abrir el perfil de la primera alumna (repro del crash next/image con signed URLs).
        await page.getByText(POOL_STUDENTS[0]).first().click()
        await page.waitForURL('**/coach/clients/**', { timeout: 25_000 })
        await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0, { timeout: 15_000 })
    })

    test('contexto STANDALONE: el pool NO se cruza (bug del smoke: se mezclaban)', async ({ page }) => {
        await loginCoach(page)
        await switchWorkspace(page, /Jose Fit|Mi negocio/)

        await page.goto('/coach/clients')
        // NUNCA networkidle con RSC streaming (no asienta). Anclar a contenido renderizado:
        await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
        for (const name of POOL_STUDENTS) {
            await expect(page.getByText(name)).toHaveCount(0)
        }
        await expectNoRuntimeError(page)
    })
})
