import { test, expect, type Page } from '@playwright/test'
import * as personasModule from './personas'

/**
 * SUITE E — Negative auth entre flujos (coach_standalone / enterprise_coach / coach_team).
 * Nadie cruza de shell: alumnos no entran a zonas de coach, coaches no entran al panel /org
 * (staff-only), y un alumno de pool no entra al /t de OTRO team.
 *
 * Sesiones: storageState por persona generado por tests/separation/auth.setup.ts
 * (project 'setup', dependencia del project 'separation'). El caso deslogueado usa
 * el contexto limpio por defecto (el project 'separation' NO define storageState global).
 *
 * Comportamiento esperado de la app (verificado en código):
 *   - /coach/* sin sesión          -> proxy redirige a /login.
 *   - /coach/* con sesión NO coach -> proxy manda a /coach/onboarding/complete y el layout coach
 *     re-redirige a /login: en ningún caso se renderiza el shell del coach (sidebar con links).
 *   - /org/[slug] es staff-only (org_owner/org_admin): cualquier otro usuario es redirigido
 *     fuera (coaches caen en /coach/dashboard).
 *   - /t/[slug]/* con sesión que NO es miembro del team -> redirect a /t/[slug]/login
 *     (o /not-found si el slug no existe).
 *   - /t/[slug]/consent con consent YA otorgado -> redirect idempotente a /t/[slug]/dashboard.
 *
 * Disciplina: jamás networkidle; waitForURL siempre con destino que excluye la página pedida;
 * guard del overlay de error de Next dev al cierre de cada test.
 *
 * Ejecutar: npx playwright test --project=separation --workers=1
 *       (o: npx playwright test tests/separation/negative-auth.spec.ts --project=separation --workers=1)
 */

const { PERSONAS, SLUGS, BRANDS, hasPersonasPassword } = personasModule

/** Team REAL ajeno al seed E2E (smoke test Movida) — sirve para el cruce de teams. */
const OTHER_TEAM_SLUG = 'movida-test'

const ORG_NAME = BRANDS.enterprise.name

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Overlay de ERROR de Next dev (shadow DOM; los locators CSS lo atraviesan). */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

/**
 * El shell del coach renderiza la sidebar con <Link title={label}>. Si esos links no existen,
 * el usuario NO está dentro del panel del coach aunque la URL haya pasado por /coach/*.
 */
async function expectNotInCoachShell(page: Page) {
    await expect(page.locator('a[title="Dashboard"]')).toHaveCount(0)
    await expect(page.locator('a[title="Alumnos"]')).toHaveCount(0)
}

// ----------------------------------------------------------------------------
// Suite E — agrupada por persona (cada describe reutiliza SU storageState)
// ----------------------------------------------------------------------------

test.describe('Suite E — negative auth entre flujos', () => {
    test.describe('solo alumno (standalone, /c)', () => {
        test.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
        test.use({ storageState: PERSONAS.soloAlumno.storageState })

        test('-> /coach/dashboard: redirigido fuera (jamás el shell del coach)', async ({ page }) => {
            await page.goto('/coach/dashboard')
            await page.waitForURL((url) => !url.pathname.startsWith('/coach/dashboard'), { timeout: 20_000 })
            expect(new URL(page.url()).pathname).not.toBe('/coach/dashboard')
            await expectNotInCoachShell(page)
            await expectNoRuntimeError(page)
        })

        test('-> /t/e2e-pool-vortex: denegado (no es miembro del team)', async ({ page }) => {
            await page.goto(`/t/${SLUGS.team}/dashboard`)
            await page.waitForURL(`**/t/${SLUGS.team}/login**`, { timeout: 20_000 })
            expect(page.url()).not.toContain(`/t/${SLUGS.team}/dashboard`)
            await expectNoRuntimeError(page)
        })
    })

    test.describe('pool alumno (team, /t)', () => {
        test.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
        test.use({ storageState: PERSONAS.poolAlumno.storageState })

        test('-> /coach/team: redirigido fuera (zona exclusiva de coaches)', async ({ page }) => {
            await page.goto('/coach/team')
            await page.waitForURL((url) => !url.pathname.startsWith('/coach/team'), { timeout: 20_000 })
            expect(new URL(page.url()).pathname).not.toBe('/coach/team')
            await expectNotInCoachShell(page)
            await expectNoRuntimeError(page)
        })

        test('-> /t de OTRO team: rebotado al login de ese team (o 404)', async ({ page }) => {
            await page.goto(`/t/${OTHER_TEAM_SLUG}/dashboard`)
            // is_member=false -> login del team ajeno; si el slug no existe en este entorno -> /not-found.
            await page.waitForURL(
                new RegExp(`(/t/${OTHER_TEAM_SLUG}/login|/not-found)`),
                { timeout: 20_000 },
            )
            expect(page.url()).not.toContain(`/t/${OTHER_TEAM_SLUG}/dashboard`)
            await expectNoRuntimeError(page)
        })

        test('-> /consent ya consentido: redirect idempotente al dashboard (sin loop)', async ({ page }) => {
            await page.goto(`/t/${SLUGS.team}/consent`)
            await page.waitForURL(`**/t/${SLUGS.team}/dashboard**`, { timeout: 15_000 })
            expect(page.url()).not.toContain('/consent')
            await expectNoRuntimeError(page)
        })
    })

    test.describe('org alumno (enterprise, /e)', () => {
        test.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
        test.use({ storageState: PERSONAS.orgAlumno.storageState })

        test('-> /org: denegado (ni siquiera siendo alumno de la org)', async ({ page }) => {
            await page.goto(`/org/${SLUGS.org}`)
            await page.waitForURL((url) => !url.pathname.startsWith('/org'), { timeout: 20_000 })
            expect(new URL(page.url()).pathname.startsWith('/org')).toBe(false)
            // El guard lo expulsa a SU shell de alumno, que muestra la marca de la org
            // legítimamente (white-label). Lo prohibido es el PANEL org: nada de navegación
            // interna /org/* renderizada.
            await expect(page.locator('a[href^="/org/"]')).toHaveCount(0)
            await expectNoRuntimeError(page)
        })
    })

    test.describe('org coach (role coach, NO staff)', () => {
        test.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
        test.use({ storageState: PERSONAS.orgCoach.storageState })

        test('-> /org: denegado (staff-only), cae en su dashboard de coach', async ({ page }) => {
            await page.goto(`/org/${SLUGS.org}`)
            await page.waitForURL((url) => !url.pathname.startsWith('/org'), { timeout: 20_000 })
            expect(page.url()).toContain('/coach/dashboard')
            await expectNoRuntimeError(page)
        })
    })

    test.describe('team coach (otro flujo, sin relación con la org)', () => {
        test.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
        test.use({ storageState: PERSONAS.teamCoach.storageState })

        test('-> /org: denegado', async ({ page }) => {
            await page.goto(`/org/${SLUGS.org}`)
            await page.waitForURL((url) => !url.pathname.startsWith('/org'), { timeout: 20_000 })
            expect(page.url()).toContain('/coach/dashboard')
            await expect(page.getByText(ORG_NAME)).toHaveCount(0)
            await expectNoRuntimeError(page)
        })
    })

    test.describe('sin sesión (contexto limpio, sin storageState)', () => {
        test('-> /coach/clients: el proxy manda a /login', async ({ page }) => {
            await page.goto('/coach/clients')
            await page.waitForURL(/\/login/, { timeout: 20_000 })
            expect(new URL(page.url()).pathname).toContain('/login')
            await expectNotInCoachShell(page)
            await expectNoRuntimeError(page)
        })
    })
})
