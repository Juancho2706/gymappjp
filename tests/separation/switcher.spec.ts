import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { PERSONAS } from './personas'

/**
 * SUITE D — Workspace switcher: oculto para cuentas single-contexto, flip completo
 * para el coach multi-contexto real (Jose Fit, standalone + pool movida-test).
 *
 * Personas single-contexto (storageState pre-generado por ./personas):
 *   PERSONAS.soloCoach -> e2e-solo-coach@evatest.cl (standalone puro)
 *   PERSONAS.teamCoach -> e2e-team-coach@evatest.cl (solo miembro del pool)
 *
 * Jose Fit NO usa storageState: el cambio de contexto se hace via /workspace/select
 * (click en el texto de la entrada), igual que el smoke manual. Credenciales por env:
 *   E2E_POOL_COACH_EMAIL / E2E_POOL_COACH_PASSWORD
 *
 * Disciplina E2E (de tests/team/team-flows.spec.ts): NUNCA networkidle; waitForURL
 * con patrones que EXCLUYEN /login; guard del overlay de error de Next dev; modo
 * serial (el flip muta el last-used workspace en el servidor); skip sin secretos.
 *
 * Ejecutar: npx playwright test tests/separation/switcher.spec.ts --workers=1
 */

const TEAM_NAME = 'Movida (test)'
const STANDALONE_LABEL = /Jose Fit|Mi negocio/
const POOL_STUDENT = 'Carolina'

const JOSE_EMAIL = process.env.E2E_POOL_COACH_EMAIL ?? ''
const JOSE_PASSWORD = process.env.E2E_POOL_COACH_PASSWORD ?? ''
const hasJoseCreds = !!(JOSE_EMAIL && JOSE_PASSWORD)
const hasPersonasPassword = !!process.env.E2E_PERSONAS_PASSWORD

function personaReady(persona: { storageState: string } | undefined): boolean {
    return !!persona && hasPersonasPassword && fs.existsSync(persona.storageState)
}

const SKIP_PERSONA_MSG = 'Persona E2E no disponible (falta E2E_PERSONAS_PASSWORD o el storageState del setup de personas)'

/** Fallback que evita romper la colección si la key no existe en PERSONAS (el skip guard actúa). */
const EMPTY_STATE = { cookies: [], origins: [] }

/** Overlay de ERROR de Next dev (los locators CSS atraviesan shadow roots). */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

/**
 * El WorkspaceSwitcher (components/workspace/WorkspaceSwitcher.tsx) devuelve null con
 * <=1 workspaces; su trigger es el unico boton con aria-label "Cambiar workspace".
 * Afirmar ausencia SOLO despues de que el sidebar haya renderizado (evita falso verde).
 */
async function expectSwitcherAbsent(page: Page) {
    await expect(page.locator('aside nav a[title="Dashboard"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Cambiar workspace' })).toHaveCount(0)
}

// El flip de Jose Fit muta el last-used workspace server-side → nada de paralelo.
test.describe.configure({ mode: 'serial' })

// ---------------------------------------------------------------------------
// D1. Solo coach: single contexto ⇒ sin switcher
// ---------------------------------------------------------------------------
test.describe('D1: solo coach single-contexto', () => {
    test.skip(!personaReady(PERSONAS.soloCoach), SKIP_PERSONA_MSG)
    test.use({ storageState: PERSONAS.soloCoach?.storageState ?? EMPTY_STATE })

    test('el WorkspaceSwitcher NO se renderiza (<=1 workspaces)', async ({ page }) => {
        await page.goto('/coach/dashboard')
        await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
        await expectSwitcherAbsent(page)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// D2. Team member coach: single contexto (solo pool) ⇒ sin switcher
// ---------------------------------------------------------------------------
test.describe('D2: team member coach single-contexto', () => {
    test.skip(!personaReady(PERSONAS.teamCoach), SKIP_PERSONA_MSG)
    test.use({ storageState: PERSONAS.teamCoach?.storageState ?? EMPTY_STATE })

    test('el WorkspaceSwitcher NO se renderiza (<=1 workspaces)', async ({ page }) => {
        await page.goto('/coach/dashboard')
        await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
        await expectSwitcherAbsent(page)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// D3-D4. Jose Fit multi-contexto: login fresco, flip via /workspace/select
// ---------------------------------------------------------------------------
test.describe('D3-D4: Jose Fit multi-contexto (flip standalone <-> team)', () => {
    test.skip(!hasJoseCreds, 'E2E_POOL_COACH_* no seteados')
    // Sesión limpia: este flujo loguea desde cero, sin storageState heredado.
    test.use({ storageState: { cookies: [], origins: [] } })

    async function loginJose(page: Page) {
        await page.goto('/login')
        await page.getByRole('textbox', { name: /email/i }).fill(JOSE_EMAIL)
        await page.getByRole('textbox', { name: /contraseña/i }).fill(JOSE_PASSWORD)
        await page.getByRole('button', { name: /ingresar|iniciar/i }).click()
        // Multi-workspace -> puede caer en /workspace/select o en el último workspace usado.
        // El patrón EXCLUYE /login (un glob amplio matchearía la propia página de login).
        await page.waitForURL(/\/(workspace\/select|coach\/dashboard|org\/|c\/)/, { timeout: 25_000 })
    }

    async function switchWorkspace(page: Page, optionText: string | RegExp) {
        await page.goto('/workspace/select')
        await page.getByText(optionText).first().click()
        await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
    }

    test('D3: /workspace/select lista >=3 entradas e incluye el team Movida (test)', async ({ page }) => {
        await loginJose(page)
        await page.goto('/workspace/select')
        const entries = page.locator('form button[type="submit"]')
        await expect(entries.first()).toBeVisible({ timeout: 20_000 })
        await expect.poll(() => entries.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3)
        await expect(page.getByText(TEAM_NAME).first()).toBeVisible()
        await expectNoRuntimeError(page)
    })

    test('D4: flip completo — team gana Equipo/pierde Mi Marca y ve a Carolina; standalone al revés', async ({ page }) => {
        await loginJose(page)

        // --- Contexto TEAM ---
        await switchWorkspace(page, TEAM_NAME)
        await expect(page.locator('aside nav a[title="Equipo"]')).toBeVisible({ timeout: 20_000 })
        await expect(page.locator('aside nav a[title="Mi Marca"]')).toHaveCount(0)
        await expectNoRuntimeError(page)

        await page.goto('/coach/clients')
        await page.waitForURL('**/coach/clients**', { timeout: 25_000 })
        await expect(page.getByText(POOL_STUDENT).first()).toBeVisible({ timeout: 20_000 })
        await expectNoRuntimeError(page)

        // --- Contexto STANDALONE ---
        await switchWorkspace(page, STANDALONE_LABEL)
        await expect(page.locator('aside nav a[title="Mi Marca"]')).toBeVisible({ timeout: 20_000 })
        await expect(page.locator('aside nav a[title="Equipo"]')).toHaveCount(0)
        await expectNoRuntimeError(page)

        await page.goto('/coach/clients')
        await page.waitForURL('**/coach/clients**', { timeout: 25_000 })
        // Anclar a contenido renderizado antes de afirmar ausencia (RSC streaming):
        await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText(POOL_STUDENT)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})
