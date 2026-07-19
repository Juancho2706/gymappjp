import { test, expect, type Page } from '@playwright/test'
import { assertAllowedE2eEmail } from '../e2e-accounts'

/**
 * E2E del modulo movement_assessment (Screening de Movimiento de Ingreso).
 * Flujo kine -> alumno (specs/movida-screening F7 / AC1, AC3, AC4, AC5, AC6):
 *   1. coach del pool abre el hub /coach/movement (modulo ON en el team de prueba)
 *   2. evalua a un alumno: wizard 7 patrones (draft con autosave)
 *   3. abandona a mitad y RETOMA el borrador (AC3)
 *   4. finaliza (consentimiento del pool ya activo) y ve el semaforo en hub/reporte
 *   5. el alumno ve el reporte en /t/[team_slug]/movimiento con marca del team
 *   6. print abre la pagina imprimible (bitacora pdf_generate se valida en suite SQL)
 *   7. regla de marca AC5: ninguna superficie muestra "FMS"
 *
 * NO SE CORRE por tanda — SOLO en el gate final autorizado (regla 2026-06-10), contra
 * build prod + Supabase con el seed de prueba (team movida-test, modulo ON).
 *
 * Credenciales por env (fixture PROPIO scripts/e2e/seed-pool-fixture.mjs; default al fixture):
 *   E2E_POOL_COACH_EMAIL / E2E_POOL_COACH_PASSWORD   -> owner del pool (e2e-pool-owner)
 *   E2E_POOL_ALUMNO_EMAIL / E2E_POOL_ALUMNO_PASSWORD -> alumno del pool con consent activo (E2E Alumno Uno)
 * Sin credenciales -> specs se saltan (no rompen CI local sin secretos).
 *
 * Ejecutar (gate): npx playwright test tests/e2e/movement-assessment.spec.ts --workers=1
 */

const TEAM_SLUG = process.env.E2E_TEAM_SLUG ?? 'e2e-pool-movida'

const COACH_EMAIL = process.env.E2E_POOL_COACH_EMAIL ?? 'e2e-pool-owner@evatest.cl'
const COACH_PASSWORD = process.env.E2E_POOL_COACH_PASSWORD ?? process.env.E2E_PERSONAS_PASSWORD ?? ''
const ALUMNO_EMAIL = process.env.E2E_POOL_ALUMNO_EMAIL ?? 'e2e-pool-uno@evatest.cl'
const ALUMNO_PASSWORD = process.env.E2E_POOL_ALUMNO_PASSWORD ?? process.env.E2E_PERSONAS_PASSWORD ?? ''

// Guard fail-closed: el camino POOL jamas apunta al workspace del CEO (josefit).
assertAllowedE2eEmail(COACH_EMAIL, 'movement · E2E_POOL_COACH_EMAIL')
assertAllowedE2eEmail(ALUMNO_EMAIL, 'movement · E2E_POOL_ALUMNO_EMAIL')

const hasCoachCreds = !!(COACH_EMAIL && COACH_PASSWORD)
const hasAlumnoCreds = !!(ALUMNO_EMAIL && ALUMNO_PASSWORD)

async function loginCoach(page: Page) {
    await page.goto('/login')
    await page.getByLabel(/correo|email/i).fill(COACH_EMAIL)
    await page.getByLabel(/contraseña|password/i).fill(COACH_PASSWORD)
    await page.getByRole('button', { name: /iniciar|entrar|login/i }).click()
    await page.waitForURL(/\/coach/, { timeout: 20_000 })
}

/** Puntua el paso visible del wizard (single o L/R) con `score` y avanza. */
async function scoreStepAndNext(page: Page, score: number) {
    const groups = page.getByRole('radiogroup')
    const count = await groups.count()
    for (let g = 0; g < count; g++) {
        await groups.nth(g).getByRole('radio', { name: String(score), exact: true }).click()
    }
    await page
        .getByRole('button', { name: /siguiente|revisión|next|review/i })
        .click()
    // autosave por paso: espera a que el boton vuelva de "Guardando…"
    await expect(page.getByText(/guardando|saving/i)).toHaveCount(0, { timeout: 15_000 })
}

test.describe('movement_assessment — flujo kine → alumno', () => {
    test.skip(!hasCoachCreds, 'Sin credenciales E2E_POOL_COACH_*')

    test('hub gateado por modulo: carga con modulo ON', async ({ page }) => {
        await loginCoach(page)
        await page.goto('/coach/movement')
        await expect(page.getByRole('heading', { name: /screening de movimiento/i })).toBeVisible()
        // AC5: disclaimer visible en el hub
        await expect(page.getByText(/no es diagnóstico ni predice lesiones/i)).toBeVisible()
    })

    test('wizard: draft → abandono → retoma → finaliza → semaforo', async ({ page }) => {
        await loginCoach(page)
        await page.goto('/coach/movement')

        // Primer alumno de la lista -> evaluar
        const evaluateCta = page.getByRole('link', { name: /evaluar|retomar/i }).first()
        await evaluateCta.click()
        await page.waitForURL(/\/coach\/movement\/.+\/new/, { timeout: 15_000 })
        const wizardUrl = page.url()

        // Paso 1 (sentadilla profunda, puntaje unico) + paso 2 (paso de valla, L/R)
        await scoreStepAndNext(page, 2)
        await scoreStepAndNext(page, 2)

        // AC3 — abandona a mitad y retoma: el borrador restaura los pasos ya puntuados
        await page.goto('/coach/movement')
        await expect(page.getByText(/borrador en curso/i).first()).toBeVisible({ timeout: 15_000 })
        await page.goto(wizardUrl)
        // El total parcial restaurado refleja los 2 patrones guardados (2+2)
        await expect(page.getByText(/total parcial/i)).toBeVisible()
        await expect(page.getByText(/^4/).first()).toBeVisible()

        // Completa los 5 patrones restantes
        for (let i = 0; i < 5; i++) await scoreStepAndNext(page, 2)

        // Revision: preview del semaforo (todo 2 => 14/21 => prioridad alta) + finalizar
        await expect(page.getByText(/revisión/i).first()).toBeVisible()
        await expect(page.getByText(/14/).first()).toBeVisible()
        await page.getByRole('button', { name: /finalizar evaluación/i }).click()

        // Redirige al reporte: semaforo + compuesto + disclaimer (AC5)
        await page.waitForURL(/\/coach\/movement\/[^/]+$/, { timeout: 20_000 })
        await expect(page.getByText(/prioridad alta/i).first()).toBeVisible()
        await expect(page.getByText(/14/).first()).toBeVisible()
        await expect(page.getByText(/no es diagnóstico ni predice lesiones/i).first()).toBeVisible()

        // Print (bitacora pdf_generate se valida en la suite SQL del gate)
        const [printPage] = await Promise.all([
            page.context().waitForEvent('page'),
            page.getByRole('link', { name: /imprimir/i }).click(),
        ])
        await printPage.waitForLoadState('domcontentloaded')
        await expect(printPage.getByText(/screening de movimiento/i).first()).toBeVisible()
        await expect(printPage.getByText(/no es diagnóstico ni predice lesiones/i)).toBeVisible()

        // AC5 — regla de marca: cero "FMS" en las superficies recorridas
        for (const p of [page, printPage]) {
            const body = await p.locator('body').innerText()
            expect(body).not.toMatch(/FMS|functional movement/i)
        }
    })
})

test.describe('movement_assessment — vista del alumno via /t', () => {
    test.skip(!hasAlumnoCreds, 'Sin credenciales E2E_POOL_ALUMNO_*')

    test('alumno ve su reporte final con marca del team y disclaimer', async ({ page }) => {
        await page.goto(`/t/${TEAM_SLUG}/login`)
        await page.getByLabel(/correo|email/i).fill(ALUMNO_EMAIL)
        await page.getByLabel(/contraseña|password/i).fill(ALUMNO_PASSWORD)
        await page.getByRole('button', { name: /iniciar|entrar|login/i }).click()
        await page.waitForURL(new RegExp(`/t/${TEAM_SLUG}/`), { timeout: 20_000 })

        await page.goto(`/t/${TEAM_SLUG}/movimiento`)
        await expect(page.getByRole('heading', { name: /tu screening de movimiento/i })).toBeVisible({
            timeout: 15_000,
        })
        // Read-only: el alumno no tiene CTA de evaluar ni de eliminar
        await expect(page.getByRole('button', { name: /eliminar/i })).toHaveCount(0)
        // Disclaimer obligatorio (AC5) y cero marca prohibida
        await expect(page.getByText(/no es diagnóstico ni predice lesiones/i).first()).toBeVisible()
        const body = await page.locator('body').innerText()
        expect(body).not.toMatch(/FMS|functional movement/i)
    })
})
