import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { PERSONAS } from './personas'
import { assertAllowedE2eEmail } from '../e2e-accounts'

/**
 * SUITE D — Workspace switcher: oculto para cuentas single-contexto, flip completo
 * para el coach multi-contexto del fixture PROPIO (e2e-pool-owner: standalone activo +
 * owner del team e2e-pool-movida). Reemplaza al workspace del CEO (Jose Fit/josefit).
 *
 * Personas single-contexto (storageState pre-generado por ./personas):
 *   PERSONAS.soloCoach -> e2e-solo-coach@evatest.cl (standalone puro)
 *   PERSONAS.teamCoach -> e2e-team-coach@evatest.cl (solo miembro del pool)
 *
 * El pool owner NO usa storageState: el cambio de contexto se hace via /workspace/select
 * (click en el texto de la entrada), igual que el smoke manual. Credenciales por env
 * (default al fixture):
 *   E2E_POOL_COACH_EMAIL / E2E_POOL_COACH_PASSWORD
 *
 * Disciplina E2E (de tests/team/team-flows.spec.ts): NUNCA networkidle; waitForURL
 * con patrones que EXCLUYEN /login; guard del overlay de error de Next dev; modo
 * serial (el flip muta el last-used workspace en el servidor); skip sin secretos.
 *
 * Ejecutar: npx playwright test tests/separation/switcher.spec.ts --workers=1
 */

const TEAM_NAME = 'E2E Movida (test)'
const STANDALONE_LABEL = /E2E Pool Owner|Mi negocio/
const POOL_STUDENT = 'E2E Alumno Uno'

const JOSE_EMAIL = process.env.E2E_POOL_COACH_EMAIL ?? 'e2e-pool-owner@evatest.cl'
const JOSE_PASSWORD = process.env.E2E_POOL_COACH_PASSWORD ?? process.env.E2E_PERSONAS_PASSWORD ?? ''
// Guard fail-closed: el camino POOL jamas apunta al workspace del CEO (josefit).
assertAllowedE2eEmail(JOSE_EMAIL, 'switcher · E2E_POOL_COACH_EMAIL')
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

// El flip del pool owner muta el last-used workspace server-side → nada de paralelo.
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
// D3-D4. Pool owner multi-contexto: login fresco, flip via /workspace/select
// ---------------------------------------------------------------------------
test.describe('D3-D4: pool owner multi-contexto (flip standalone <-> team)', () => {
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

    test('D3: /workspace/select lista los 2 contextos (standalone + team) e incluye el team', async ({ page }) => {
        await loginJose(page)
        await page.goto('/workspace/select')
        const entries = page.locator('form button[type="submit"]')
        await expect(entries.first()).toBeVisible({ timeout: 20_000 })
        // El fixture pool owner tiene EXACTAMENTE 2 workspaces (standalone activo + team que es owner);
        // el switcher se muestra con >1 y el flip D4 los ejercita. (Jose Fit tenia 3+; el fixture propio,
        // por diseno, 2 — checamos ambas etiquetas presentes, mas fuerte que un conteo pelado.)
        await expect.poll(() => entries.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
        await expect(page.getByText(TEAM_NAME).first()).toBeVisible()
        await expect(page.getByText(STANDALONE_LABEL).first()).toBeVisible()
        await expectNoRuntimeError(page)
    })

    test('D4: flip completo — team gana Equipo y ve al alumno del pool; standalone pierde Equipo (Opciones en ambos)', async ({ page }) => {
        await loginJose(page)

        // Movida 1 (declutter): "Mi Marca"/"Suscripción" standalone se colapsaron en "Opciones"
        // (hub /coach/settings). El discriminador team↔standalone es ahora la presencia de "Equipo"
        // (solo team), no la marca. "Opciones" existe en AMBOS contextos (settings_team vs options).

        // --- Contexto TEAM ---
        await switchWorkspace(page, TEAM_NAME)
        await expect(page.locator('aside nav a[title="Equipo"]')).toBeVisible({ timeout: 20_000 })
        await expectNoRuntimeError(page)

        await page.goto('/coach/clients')
        await page.waitForURL('**/coach/clients**', { timeout: 25_000 })
        await expect(page.getByText(POOL_STUDENT).first()).toBeVisible({ timeout: 20_000 })
        await expectNoRuntimeError(page)

        // --- Contexto STANDALONE ---
        await switchWorkspace(page, STANDALONE_LABEL)
        await expect(page.locator('aside nav a[title="Opciones"]')).toBeVisible({ timeout: 20_000 })
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
