import { test, expect, type Page } from '@playwright/test'
import { assertAllowedE2eEmail, assertAllowedE2eClientId } from '../e2e-accounts'

/**
 * E2E del modulo COMPOSICION CORPORAL (body_composition) — superficie del coach dentro de la
 * ficha del alumno (ruta nueva /coach/clients/[clientId]/bodycomp).
 *
 * Cubre el flujo del SPEC (AC1/AC2/AC4/AC7): un coach del pool con el modulo ON
 *   - captura una medicion BIA -> aparece en la pestana "Bioimpedancia" con etiqueta dispositivo
 *   - captura una medicion ISAK -> aparece en "Antropometria" con el % grasa etiquetado "Preliminar"
 *   - los metodos NO se mezclan (cada pestana su propia serie)
 *
 * Credenciales + target por env (NO commitear secretos; default al fixture PROPIO
 * scripts/e2e/seed-pool-fixture.mjs). Sin ellas, el bloque se SALTA (no rompe CI local).
 * Corre SOLO en el gate autorizado, build prod, --workers=1.
 *   E2E_POOL_COACH_EMAIL / E2E_POOL_COACH_PASSWORD  -> owner del pool (e2e-pool-owner)
 *   E2E_BODYCOMP_CLIENT_ID                          -> alumno del pool con consent de salud (E2E Alumno Uno)
 *
 * Ejecutar: npx playwright test tests/team/bodycomp-flow.spec.ts --workers=1
 */

const COACH_EMAIL = process.env.E2E_POOL_COACH_EMAIL ?? 'e2e-pool-owner@evatest.cl'
const COACH_PASSWORD = process.env.E2E_POOL_COACH_PASSWORD ?? process.env.E2E_PERSONAS_PASSWORD ?? ''
const CLIENT_ID = process.env.E2E_BODYCOMP_CLIENT_ID ?? 'e2e0a004-0000-4000-8000-000000000004'

// Guard fail-closed: el camino POOL jamas apunta al workspace del CEO (josefit).
assertAllowedE2eEmail(COACH_EMAIL, 'bodycomp · E2E_POOL_COACH_EMAIL')
assertAllowedE2eClientId(CLIENT_ID, 'bodycomp · E2E_BODYCOMP_CLIENT_ID')

const hasCreds = !!(COACH_EMAIL && COACH_PASSWORD && CLIENT_ID)

async function loginCoach(page: Page) {
    await page.goto('/login')
    await page.getByRole('textbox', { name: /email/i }).fill(COACH_EMAIL)
    await page.getByRole('textbox', { name: /contraseña/i }).fill(COACH_PASSWORD)
    await page.getByRole('button', { name: /ingresar/i }).click()
    await page.waitForURL('**/coach/**', { timeout: 25_000 })
}

test.describe.configure({ mode: 'serial' })

test.describe('Composicion corporal — captura del coach', () => {
    test.skip(!hasCreds, 'E2E_POOL_COACH_* / E2E_BODYCOMP_CLIENT_ID no seteados')

    test('la ruta del modulo carga con las sub-pestanas BIA / ISAK', async ({ page }) => {
        await loginCoach(page)
        await page.goto(`/coach/clients/${CLIENT_ID}/bodycomp`)
        await expect(page.getByRole('heading', { name: /composición corporal/i })).toBeVisible()
        await expect(page.getByRole('button', { name: /bioimpedancia/i })).toBeVisible()
        await expect(page.getByRole('button', { name: /antropometría/i })).toBeVisible()
    })

    test('captura BIA -> aparece en la pestana Bioimpedancia con etiqueta de dispositivo', async ({ page }) => {
        await loginCoach(page)
        await page.goto(`/coach/clients/${CLIENT_ID}/bodycomp`)

        await page.getByRole('button', { name: /bioimpedancia/i }).click()
        await page.getByRole('button', { name: /nueva medición/i }).click()

        await page.getByLabel(/marca del equipo/i).fill('InBody')
        await page.getByLabel('Modelo').fill('570')
        await page.getByLabel(/% grasa corporal/i).fill('18.5')
        await page.getByLabel(/masa muscular esquelética/i).fill('35.2')

        await page.getByRole('button', { name: /guardar medición bia/i }).click()

        // Tras guardar (revalidate), la fila aparece con la etiqueta "InBody 570 · <fecha>".
        await expect(page.getByText(/InBody 570/i).first()).toBeVisible({ timeout: 15_000 })
    })

    test('captura ISAK -> % grasa etiquetado "Preliminar", sin mezclar con BIA', async ({ page }) => {
        await loginCoach(page)
        await page.goto(`/coach/clients/${CLIENT_ID}/bodycomp`)

        await page.getByRole('button', { name: /antropometría/i }).click()
        await page.getByRole('button', { name: /nueva medición/i }).click()

        // Paso 1: datos base + pliegues
        await page.getByLabel(/edad/i).fill('30')
        await page.getByLabel(/estatura/i).fill('178')
        await page.getByLabel('Peso (kg)').fill('75')
        await page.getByLabel(/talla sentado/i).fill('92')
        for (const [label, value] of [
            ['Tríceps', '8'],
            ['Subescapular', '10'],
            ['Supraespinal', '7'],
            ['Abdominal', '12'],
            ['Muslo anterior', '10'],
            ['Pantorrilla medial', '6'],
            ['Bíceps', '4'],
            ['Cresta ilíaca', '9'],
        ] as const) {
            await page.getByLabel(new RegExp(label, 'i')).first().fill(value)
        }
        await page.getByRole('button', { name: /siguiente/i }).click()

        // Paso 2: perimetros
        for (const [label, value] of [
            ['Cabeza', '57'],
            ['Brazo relajado', '32'],
            ['Brazo flexionado', '34'],
            ['Antebrazo', '27.5'],
            ['Tórax \\(mesoesternal\\)', '98'],
            ['Cintura', '80'],
            ['Muslo', '56'],
            ['Pantorrilla', '37.5'],
        ] as const) {
            await page.getByLabel(new RegExp(label, 'i')).first().fill(value)
        }
        await page.getByRole('button', { name: /siguiente/i }).click()

        // Paso 3: diametros
        for (const [label, value] of [
            ['Biacromial', '42'],
            ['Biiliocristal', '28'],
            ['Húmero', '7.2'],
            ['Fémur', '9.9'],
            ['Tórax transverso', '29'],
            ['Tórax A-P', '19'],
        ] as const) {
            await page.getByLabel(new RegExp(label, 'i')).first().fill(value)
        }
        await page.getByRole('button', { name: /siguiente/i }).click()

        // Paso 4: revision — el preview en vivo muestra el badge "Preliminar"
        await expect(page.getByText(/preliminar/i).first()).toBeVisible()
        await page.getByRole('button', { name: /guardar medición isak/i }).click()

        // Persistido: la lista ISAK muestra "Preliminar" y % grasa; la pestana BIA no se mezcla.
        await expect(page.getByText(/preliminar/i).first()).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText(/grasa/i).first()).toBeVisible()
    })
})
