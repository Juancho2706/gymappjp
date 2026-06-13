import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { PERSONAS } from './personas'

/**
 * SUITE — Catálogo de módulos read-only (compra-only, plan estrategia 03 / F1.2).
 *
 * Settings > Módulos dejó de ser self-toggle: es un catálogo read-only con badge
 * Activo/Disponible, pitch + superficies y CTA por contexto. Verifica que NINGÚN coach
 * pueda activarse módulos desde la UI (cero switches / botón Guardar) y que el CTA
 * sea el correcto por rol:
 *   - teamCoach (miembro sin gestión) -> "Pídelo al owner de tu equipo." (sin link)
 *   - teamOwner (gestor)              -> CTA "Conversemos — contacto@eva-app.cl"
 *   - soloCoach (standalone)          -> CTA mailto interino (contacto@eva-app.cl)
 *
 * Disciplina E2E (de module-matrix.spec.ts): storageState pre-generado por ./personas;
 * NUNCA networkidle (RSC streaming) — anclar a contenido renderizado; guard del overlay
 * de error de Next dev; sin storageState o sin E2E_PERSONAS_PASSWORD los specs se saltan.
 *
 * Ejecutar: npx playwright test tests/separation/module-catalog.spec.ts --workers=1
 */

const MODULES_URL = '/coach/settings/modules'
const CONTACT_MAILTO = 'a[href^="mailto:contacto@eva-app.cl"]'

const hasPassword = !!process.env.E2E_PERSONAS_PASSWORD

function personaReady(persona: { storageState: string } | undefined): boolean {
    return !!persona && hasPassword && fs.existsSync(persona.storageState)
}

const SKIP_MSG = 'Persona E2E no disponible (falta E2E_PERSONAS_PASSWORD o el storageState del setup de personas)'

/** Fallback que evita romper la colección si la key no existe en PERSONAS (el skip guard actúa). */
const EMPTY_STATE = { cookies: [], origins: [] }

/** Overlay de ERROR de Next dev (los locators CSS de Playwright atraviesan shadow roots). */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

/** Abre Settings > Módulos y espera al heading renderizado (sin networkidle). */
async function gotoModules(page: Page) {
    await page.goto(MODULES_URL)
    // El patrón excluye /login: si la sesión no sirve, falla con timeout (señal clara).
    await page.waitForURL('**/coach/settings/modules**', { timeout: 25_000 })
    await expect(page.getByRole('heading', { name: 'Módulos' })).toBeVisible({ timeout: 20_000 })
}

/** El catálogo es read-only: NUNCA hay switches ni botón Guardar en la página. */
async function expectReadOnlyCatalog(page: Page) {
    await expect(page.getByRole('switch')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Guardar/i })).toHaveCount(0)
}

// ---------------------------------------------------------------------------
// 1. TEAM MEMBER COACH (miembro del pool, sin gestión)
// ---------------------------------------------------------------------------
test.describe('Catálogo módulos — team member (e2e-team-coach)', () => {
    test.skip(!personaReady(PERSONAS.teamCoach), SKIP_MSG)
    test.use({ storageState: PERSONAS.teamCoach?.storageState ?? EMPTY_STATE })

    test('C1: read-only, badge Disponible y "Pídelo al owner" (sin CTA mailto)', async ({ page }) => {
        await gotoModules(page)
        await expectReadOnlyCatalog(page)
        // Al menos un módulo Disponible (las personas de la matriz no tienen módulos ON).
        await expect(page.getByText('Disponible').first()).toBeVisible()
        await expect(page.getByText('Pídelo al owner de tu equipo.').first()).toBeVisible()
        // Miembro sin gestión NO ve CTA conversacional con mailto.
        await expect(page.locator(CONTACT_MAILTO)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// 2. TEAM OWNER (gestor del pool)
// ---------------------------------------------------------------------------
test.describe('Catálogo módulos — team owner (e2e-team-owner)', () => {
    test.skip(!personaReady(PERSONAS.teamOwner), SKIP_MSG)
    test.use({ storageState: PERSONAS.teamOwner?.storageState ?? EMPTY_STATE })

    test('C2: read-only y CTA "Conversemos" (mailto contacto) para el gestor', async ({ page }) => {
        await gotoModules(page)
        await expectReadOnlyCatalog(page)
        await expect(page.getByRole('link', { name: /Conversemos/i }).first()).toBeVisible()
        await expect(page.locator(CONTACT_MAILTO).first()).toBeVisible()
        // El gestor NO recibe el texto del miembro.
        await expect(page.getByText('Pídelo al owner de tu equipo.')).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})

// ---------------------------------------------------------------------------
// 3. COACH STANDALONE (mailto interino)
// ---------------------------------------------------------------------------
test.describe('Catálogo módulos — standalone (e2e-solo-coach)', () => {
    test.skip(!personaReady(PERSONAS.soloCoach), SKIP_MSG)
    test.use({ storageState: PERSONAS.soloCoach?.storageState ?? EMPTY_STATE })

    test('C3: read-only y CTA mailto interino (contacto@eva-app.cl), cero switches', async ({ page }) => {
        await gotoModules(page)
        await expectReadOnlyCatalog(page)
        // CTA interino self-service OFF -> mailto a contacto@eva-app.cl.
        await expect(page.locator(CONTACT_MAILTO).first()).toBeVisible()
        await expect(page.getByText('Disponible').first()).toBeVisible()
        // Standalone no es team -> no aparece el texto del miembro de equipo.
        await expect(page.getByText('Pídelo al owner de tu equipo.')).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})
