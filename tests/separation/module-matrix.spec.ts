import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { PERSONAS } from './personas'

/**
 * SUITE A — Matriz de módulos por contexto (separación de flujos).
 *
 * Verifica que cada flujo (coach_standalone / enterprise_coach / coach_team) vea SOLO
 * sus módulos en el sidebar (registro: apps/web/src/components/coach/coach-nav.ts) y que
 * las rutas exclusivas (/coach/team, /coach/settings/modules) respeten el contexto activo.
 *
 * Personas Wave 2 (seed @evatest.cl) via storageState pre-generado por ./personas:
 *   PERSONAS.soloCoach    -> e2e-solo-coach@evatest.cl    (standalone, elite/active, módulos OFF)
 *   PERSONAS.orgOwner     -> e2e-org-owner@evatest.cl     (org_owner, SIN fila coaches)
 *   PERSONAS.orgCoach     -> e2e-org-coach@evatest.cl     (org_managed, rol coach)
 *   PERSONAS.teamOwner    -> e2e-team-owner@evatest.cl    (team_managed, owner del pool)
 *   PERSONAS.teamCoach    -> e2e-team-coach@evatest.cl    (team_managed, miembro sin manage)
 *   PERSONAS.modulesCoach -> e2e-modules-coach@evatest.cl (standalone, los 4 módulos ON — persona 9,
 *                            FUERA de la matriz: listas propias con el grupo MÓDULOS; D7/F4 plan 03)
 *
 * Disciplina E2E (de tests/team/team-flows.spec.ts): NUNCA networkidle; waitForURL con
 * patrones que EXCLUYEN /login; guard del overlay de error de Next dev; sin storageState
 * generado o sin E2E_PERSONAS_PASSWORD los specs se saltan (no rompen CI sin secretos).
 *
 * Ejecutar: npx playwright test tests/separation/module-matrix.spec.ts --workers=1
 */

const ORG_NAME = 'E2E Performance Lab'
const ORG_SLUG = 'e2e-performance-lab'
const TEAM_NAME = 'E2E Pool Vortex'

// Orden exacto del registro NAV_MODULES (coach-nav.ts) por contexto:
const STANDALONE_MODULES = ['Dashboard', 'Alumnos', 'Programas', 'Ejercicios', 'Nutrición', 'Mi Marca', 'Suscripción', 'Soporte']
const ENTERPRISE_MODULES = ['Dashboard', 'Alumnos', 'Programas', 'Ejercicios', 'Nutrición', 'Soporte']
// Cardio + Movimiento aparecen para el team owner cuando enabled_modules los tiene ON
// (E2E Pool Vortex: cardio/movement_assessment = true). Planes 2+3 los agregaron a la nav.
const TEAM_MODULES = ['Dashboard', 'Alumnos', 'Equipo', 'Programas', 'Ejercicios', 'Cardio', 'Movimiento', 'Nutrición', 'Opciones', 'Soporte']
// Persona 9 (e2e-modules-coach): standalone con los 4 módulos ON. El nav desktop renderiza el
// bloque CORE y, tras el divisor "MÓDULOS" (F3 — splitNavItems), el bloque de módulos al final.
// collectNavTitles lee a[title] en orden de DOM ⇒ core seguido de los módulos.
const MODULES_COACH_MODULES = [
    'Dashboard', 'Alumnos', 'Programas', 'Ejercicios', 'Nutrición', 'Mi Marca', 'Suscripción', 'Soporte',
    'Cardio', 'Movimiento',
]
// Contrato con F3 (CoachSidebar.tsx): el divisor del grupo MÓDULOS expone este testid en desktop.
const MODULES_DIVIDER_TESTID = 'nav-modules-divider'

const hasPassword = !!process.env.E2E_PERSONAS_PASSWORD

function personaReady(persona: { storageState: string } | undefined): boolean {
    return !!persona && hasPassword && fs.existsSync(persona.storageState)
}

const SKIP_MSG = 'Persona E2E no disponible (falta E2E_PERSONAS_PASSWORD o el storageState del setup de personas)'

/** Fallback que evita romper la colección si la key no existe en PERSONAS (el skip guard actúa). */
const EMPTY_STATE = { cookies: [], origins: [] }

/**
 * Overlay de ERROR de Next dev (no el portal: <nextjs-portal> siempre existe en dev 16).
 * Los locators CSS de Playwright atraviesan shadow roots.
 */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

/**
 * Títulos de los links del nav del sidebar coach, en orden de render.
 * El sidebar renderiza <Link title={label}> dentro de <aside><nav> (incluye "Panel empresa"
 * cuando corresponde, así que un toEqual exacto también prueba su ausencia).
 */
async function collectNavTitles(page: Page): Promise<string[]> {
    await expect(page.locator('aside nav a[title="Dashboard"]')).toBeVisible({ timeout: 20_000 })
    return page.locator('aside nav a[title]').evaluateAll(els => els.map(el => el.getAttribute('title') ?? ''))
}

async function gotoCoachDashboard(page: Page) {
    await page.goto('/coach/dashboard')
    // El patrón excluye /login: si la sesión no sirve, esto falla con timeout (señal clara).
    await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
}

// ---------------------------------------------------------------------------
// 1-2. COACH STANDALONE (solo coach — single contexto)
// ---------------------------------------------------------------------------
test.describe('Standalone — e2e-solo-coach', () => {
    test.skip(!personaReady(PERSONAS.soloCoach), SKIP_MSG)
    test.use({ storageState: PERSONAS.soloCoach?.storageState ?? EMPTY_STATE })

    test('A1: sidebar muestra EXACTAMENTE los módulos standalone (y NO Equipo)', async ({ page }) => {
        await gotoCoachDashboard(page)
        const titles = await collectNavTitles(page)
        expect(titles).toEqual(STANDALONE_MODULES)
        // Refuerzo explícito de la separación: el módulo Equipo no existe fuera de coach_team.
        await expect(page.locator('aside nav a[title="Equipo"]')).toHaveCount(0)
        await expectNoRuntimeError(page)
    })

    test('A2: GET /coach/team redirige a /coach/dashboard (módulo inexistente en standalone)', async ({ page }) => {
        await page.goto('/coach/team')
        await page.waitForURL('**/coach/dashboard**', { timeout: 25_000 })
        expect(page.url()).not.toContain('/coach/team')
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// 3-4. ENTERPRISE COACH (org_managed, rol coach)
// ---------------------------------------------------------------------------
test.describe('Enterprise coach — e2e-org-coach', () => {
    test.skip(!personaReady(PERSONAS.orgCoach), SKIP_MSG)
    test.use({ storageState: PERSONAS.orgCoach?.storageState ?? EMPTY_STATE })

    test('A3: sidebar oculta Mi Marca + Suscripción + Equipo y muestra "Gestionado por"', async ({ page }) => {
        await gotoCoachDashboard(page)
        const titles = await collectNavTitles(page)
        expect(titles).toEqual(ENTERPRISE_MODULES)
        await expect(page.locator('aside nav a[title="Mi Marca"]')).toHaveCount(0)
        await expect(page.locator('aside nav a[title="Suscripción"]')).toHaveCount(0)
        await expect(page.locator('aside nav a[title="Equipo"]')).toHaveCount(0)
        await expect(page.getByText(`Gestionado por ${ORG_NAME}`)).toBeVisible()
        await expectNoRuntimeError(page)
    })

    test('A4: rol coach NO ve el link "Panel empresa" (solo org_owner/org_admin)', async ({ page }) => {
        await gotoCoachDashboard(page)
        await collectNavTitles(page) // espera a que el nav esté renderizado antes de afirmar ausencia
        await expect(page.locator('a[title="Panel empresa"]')).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// 5-6, 8-9. TEAM OWNER (pool E2E Pool Vortex)
// ---------------------------------------------------------------------------
test.describe('Team owner — e2e-team-owner', () => {
    test.skip(!personaReady(PERSONAS.teamOwner), SKIP_MSG)
    test.use({ storageState: PERSONAS.teamOwner?.storageState ?? EMPTY_STATE })

    test('A5: sidebar muestra Equipo y oculta Mi Marca + Suscripción', async ({ page }) => {
        await gotoCoachDashboard(page)
        const titles = await collectNavTitles(page)
        expect(titles).toEqual(TEAM_MODULES)
        await expect(page.locator('aside nav a[title="Equipo"]')).toBeVisible()
        await expect(page.locator('aside nav a[title="Mi Marca"]')).toHaveCount(0)
        await expect(page.locator('aside nav a[title="Suscripción"]')).toHaveCount(0)
        await expectNoRuntimeError(page)
    })

    test('A6: owner abre /coach/settings/modules (heading "Módulos")', async ({ page }) => {
        await page.goto('/coach/settings/modules')
        await page.waitForURL('**/coach/settings/modules**', { timeout: 25_000 })
        await expect(page.getByRole('heading', { name: 'Módulos' })).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText(`Equipo "${TEAM_NAME}"`)).toBeVisible()
        await expectNoRuntimeError(page)
    })

    test('A8: owner ve el botón "Agregar coach" en /coach/team (gestión del roster)', async ({ page }) => {
        await page.goto('/coach/team')
        await page.waitForURL('**/coach/team**', { timeout: 25_000 })
        await expect(page.getByRole('heading', { name: TEAM_NAME })).toBeVisible({ timeout: 20_000 })
        await expect(page.getByRole('button', { name: 'Agregar coach' })).toBeVisible()
        await expectNoRuntimeError(page)
    })

    test('A9: /coach/team lista SOLO "E2E Pool Vortex" (no se cruzan otros teams)', async ({ page }) => {
        await page.goto('/coach/team')
        await page.waitForURL('**/coach/team**', { timeout: 25_000 })
        await expect(page.getByRole('heading', { name: TEAM_NAME })).toBeVisible({ timeout: 20_000 })
        // Un solo team renderizado (un h1 por section de team en la página).
        await expect(page.getByRole('main').locator('h1')).toHaveCount(1)
        await expect(page.getByText('Movida (test)')).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// 7, 10. TEAM MEMBER COACH (miembro del pool, can_manage=false)
// ---------------------------------------------------------------------------
test.describe('Team member coach — e2e-team-coach', () => {
    test.skip(!personaReady(PERSONAS.teamCoach), SKIP_MSG)
    test.use({ storageState: PERSONAS.teamCoach?.storageState ?? EMPTY_STATE })

    test('A7: /coach/team muestra el roster READ-ONLY (sin botón "Agregar coach")', async ({ page }) => {
        await page.goto('/coach/team')
        await page.waitForURL('**/coach/team**', { timeout: 25_000 })
        await expect(page.getByRole('heading', { name: TEAM_NAME })).toBeVisible({ timeout: 20_000 })
        await expect(page.getByRole('button', { name: 'Agregar coach' })).toHaveCount(0)
        await expectNoRuntimeError(page)
    })

    test('A10: /coach/nutrition-plans carga SIN upsell (team_managed/elite, sin "Desbloquear nutrición")', async ({ page }) => {
        await page.goto('/coach/nutrition-plans')
        await page.waitForURL('**/coach/nutrition-plans**', { timeout: 25_000 })
        // NUNCA networkidle con RSC streaming — anclar a contenido renderizado:
        await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText('Desbloquear nutrición')).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// 11-12. ORG OWNER (staff puro: SIN fila coaches — no es coach en ningún flujo)
// ---------------------------------------------------------------------------
test.describe('Org owner — e2e-org-owner', () => {
    test.skip(!personaReady(PERSONAS.orgOwner), SKIP_MSG)
    test.use({ storageState: PERSONAS.orgOwner?.storageState ?? EMPTY_STATE })

    test('A11: aterriza en /org/e2e-performance-lab (workspace único enterprise_staff)', async ({ page }) => {
        // /workspace/select con 1 solo workspace auto-redirige a workspaceHome().
        await page.goto('/workspace/select')
        await page.waitForURL(new RegExp(`/org/${ORG_SLUG}(/|$|\\?)`), { timeout: 25_000 })
        expect(page.url()).toContain(`/org/${ORG_SLUG}`)
        expect(page.url()).not.toContain('/login')
        await expectNoRuntimeError(page)
    })

    test('A12: /coach/dashboard NO renderiza el panel coach para staff (redirect o sin nav)', async ({ page }) => {
        await page.goto('/coach/dashboard', { waitUntil: 'domcontentloaded' })
        // El layout coach es RSC: si renderizara, el nav llega en el HTML inicial. Aceptamos
        // ambas defensas válidas: redirect fuera de /coach/dashboard O página sin nav de coach.
        if (page.url().includes('/coach/dashboard')) {
            await expect(page.locator('aside nav a[title="Alumnos"]')).toHaveCount(0)
            await expect(page.locator('aside nav a[title="Dashboard"]')).toHaveCount(0)
        } else {
            expect(page.url()).not.toContain('/coach/dashboard')
        }
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// 13. STANDALONE CON MÓDULOS ON (persona 9 — fuera de la matriz; D7/F4 plan 03)
//
// Las 8 personas de arriba quedan SIN módulos (assertan el nav byte-idéntico al actual).
// e2e-modules-coach es la 9na cuenta permanente con los 4 módulos ON via seed service-role:
// ejercita el grupo "MÓDULOS" del nav (divisor desktop + módulos al final) y que las rutas
// de módulo cargan sin redirect. Sus listas esperadas son PROPIAS (no tocan las de la matriz).
// ---------------------------------------------------------------------------
test.describe('Standalone con módulos — e2e-modules-coach', () => {
    test.skip(!personaReady(PERSONAS.modulesCoach), SKIP_MSG)
    test.use({ storageState: PERSONAS.modulesCoach?.storageState ?? EMPTY_STATE })

    test('A13: sidebar incluye Cardio + Movimiento AL FINAL (grupo MÓDULOS tras el core)', async ({ page }) => {
        await gotoCoachDashboard(page)
        const titles = await collectNavTitles(page)
        expect(titles).toEqual(MODULES_COACH_MODULES)
        // Cardio/Movimiento existen (entitlement ON) y van después del core (orden del array).
        await expect(page.locator('aside nav a[title="Cardio"]')).toBeVisible()
        await expect(page.locator('aside nav a[title="Movimiento"]')).toBeVisible()
        // Standalone: conserva Mi Marca + Suscripción y NO ve Equipo.
        await expect(page.locator('aside nav a[title="Equipo"]')).toHaveCount(0)
        await expectNoRuntimeError(page)
    })

    test('A14: el divisor del grupo MÓDULOS es visible en desktop (no contamina collectNavTitles)', async ({ page }) => {
        await gotoCoachDashboard(page)
        await collectNavTitles(page) // asegura el nav renderizado antes de afirmar el divisor
        // El divisor lo renderiza CoachSidebar (F3) con este testid SOLO cuando hay ≥1 módulo ON.
        // No es <a title> ⇒ no aparece en la lista de títulos (A13 sigue exacta).
        await expect(page.getByTestId(MODULES_DIVIDER_TESTID)).toBeVisible({ timeout: 20_000 })
        await expectNoRuntimeError(page)
    })

    test('A15: /coach/cardio carga SIN redirect (entitlement ON ⇒ assertModule pasa)', async ({ page }) => {
        await page.goto('/coach/cardio')
        // El patrón excluye /dashboard y /login: si assertModule rebotara, esto falla con timeout.
        await page.waitForURL('**/coach/cardio**', { timeout: 25_000 })
        expect(page.url()).toContain('/coach/cardio')
        expect(page.url()).not.toContain('/coach/dashboard')
        await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
        await expectNoRuntimeError(page)
    })
})
