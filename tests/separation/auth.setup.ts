import { test as setup, expect, type Page } from '@playwright/test'
import {
    PERSONAS,
    POOL_COACH,
    SLUGS,
    STUDENT_LOGIN,
    hasPersonasPassword,
    hasPoolCoachCreds,
} from './personas'

/**
 * Setup project: logea cada persona UNA vez y persiste su storageState en
 * playwright/.auth/<persona>.json para que las suites de tests/separation/
 * arranquen ya autenticadas (test.use({ storageState: PERSONAS.x.storageState })).
 *
 * Disciplina E2E (de tests/team/team-flows.spec.ts):
 *  - NUNCA networkidle (RSC streaming no asienta).
 *  - waitForURL con patrones que EXCLUYEN la página de login (un glob laxo
 *    matchea la propia /login y el wait pasa vacío).
 *  - Guard del overlay de error de Next dev tras cada login.
 *  - Sin credenciales en env -> setup.skip (no rompe CI sin secretos).
 *
 * Ejecutar (lo dispara solo el project 'separation' via dependencies):
 *   npx playwright test --project=separation --workers=1
 */

/**
 * Overlay de ERROR de Next dev (no el portal: <nextjs-portal> siempre existe en
 * dev 16 como host del botón DevTools). El diálogo vive en shadow DOM y los
 * locators CSS de Playwright atraviesan shadow roots.
 */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

/** Login de coach via /login (personas 1, 4, 6, 7 + pool coach multi-contexto). */
async function loginCoach(page: Page, email: string, password: string) {
    await page.goto('/login')
    await page.getByRole('textbox', { name: /email/i }).fill(email)
    await page.getByRole('textbox', { name: /contraseña/i }).fill(password)
    await page.getByRole('button', { name: /ingresar|iniciar/i }).click()
    // Single-context cae directo en su workspace; multi-context puede caer en
    // /workspace/select o en el último workspace usado. Ningún patrón matchea /login.
    await page.waitForURL(/\/(workspace\/select|coach\/dashboard|org\/|c\/)/, { timeout: 25_000 })
}

/** Login de alumno via su shell (/c, /e o /t comparten el mismo form). */
async function loginStudent(page: Page, loginPath: string, email: string, password: string, landing: string) {
    await page.goto(loginPath)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Contraseña').fill(password)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.waitForURL(landing, { timeout: 25_000 })
}

async function saveState(page: Page, storageState: string) {
    await expectNoRuntimeError(page)
    await page.context().storageState({ path: storageState })
}

// ── Coaches (login /login) ───────────────────────────────────────────────────

setup('persona 1: solo coach (standalone)', async ({ page }) => {
    setup.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
    await loginCoach(page, PERSONAS.soloCoach.email, PERSONAS.soloCoach.password)
    await saveState(page, PERSONAS.soloCoach.storageState)
})

setup('persona 4: org coach (enterprise)', async ({ page }) => {
    setup.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
    await loginCoach(page, PERSONAS.orgCoach.email, PERSONAS.orgCoach.password)
    await saveState(page, PERSONAS.orgCoach.storageState)
})

setup('persona 6: team owner (pool)', async ({ page }) => {
    setup.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
    await loginCoach(page, PERSONAS.teamOwner.email, PERSONAS.teamOwner.password)
    await saveState(page, PERSONAS.teamOwner.storageState)
})

setup('persona 7: team coach (pool member)', async ({ page }) => {
    setup.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
    await loginCoach(page, PERSONAS.teamCoach.email, PERSONAS.teamCoach.password)
    await saveState(page, PERSONAS.teamCoach.storageState)
})

setup('pool coach multi-contexto (Jose Fit, E2E_POOL_COACH_*)', async ({ page }) => {
    setup.skip(!hasPoolCoachCreds, 'E2E_POOL_COACH_* no seteados')
    await loginCoach(page, POOL_COACH.email, POOL_COACH.password)
    await saveState(page, POOL_COACH.storageState)
})

// ── Org owner (login /org/login — panel Enterprise, SIN fila coaches) ────────

setup('persona 3: org owner (enterprise panel)', async ({ page }) => {
    setup.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
    await page.goto('/org/login')
    await page.getByLabel('Email corporativo').fill(PERSONAS.orgOwner.email)
    await page.getByLabel('Contraseña', { exact: true }).fill(PERSONAS.orgOwner.password)
    await page.getByRole('button', { name: /Ingresar al panel Enterprise/i }).click()
    // El action redirige a /org/[slug] — el patrón con slug excluye /org/login.
    await page.waitForURL(`**/org/${SLUGS.org}**`, { timeout: 25_000 })
    await saveState(page, PERSONAS.orgOwner.storageState)
})

// ── Alumnos (cada uno via SU shell) ──────────────────────────────────────────

setup('persona 2: solo alumno (/c)', async ({ page }) => {
    setup.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
    await loginStudent(
        page,
        STUDENT_LOGIN.standalone,
        PERSONAS.soloAlumno.email,
        PERSONAS.soloAlumno.password,
        `**/c/${SLUGS.coach}/dashboard**`
    )
    await saveState(page, PERSONAS.soloAlumno.storageState)
})

setup('persona 5: org alumno (/e)', async ({ page }) => {
    setup.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
    // El proxy /e mantiene la URL en /e/[org_slug]/* (rewrite, no redirect a /c).
    await loginStudent(
        page,
        STUDENT_LOGIN.enterprise,
        PERSONAS.orgAlumno.email,
        PERSONAS.orgAlumno.password,
        `**/e/${SLUGS.org}/dashboard**`
    )
    await saveState(page, PERSONAS.orgAlumno.storageState)
})

setup('persona 8: pool alumno (/t, consent ya otorgado)', async ({ page }) => {
    setup.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')
    // Consent otorgado por el seed -> sin gate: aterriza directo en /t/[slug]/dashboard.
    await loginStudent(
        page,
        STUDENT_LOGIN.team,
        PERSONAS.poolAlumno.email,
        PERSONAS.poolAlumno.password,
        `**/t/${SLUGS.team}/dashboard**`
    )
    expect(page.url()).not.toContain('/consent')
    await saveState(page, PERSONAS.poolAlumno.storageState)
})
