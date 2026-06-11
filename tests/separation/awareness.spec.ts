import { test, expect } from '@playwright/test'
import { PERSONAS, STUDENT_IDS, STUDENT_NAMES, hasPersonasPassword } from './personas'

/**
 * E — awareness del pool: "Editado por X · hace Y" + acceso colaborativo a la pauta.
 *
 * Estado determinista del seed: el plan nutricional del pool alumno fue creado por el
 * TEAM OWNER (backfill => last_edited_by = owner). El TEAM COACH (otro miembro del pool)
 * debe ver el badge; un coach standalone sobre su propio contenido NUNCA lo ve.
 *
 * NOTA (regla 2026-06-10): este spec se ESCRIBE con la feature pero solo se CORRE en el
 * gate final del plan con autorización del usuario.
 */

test.describe('E — awareness de último editor en el pool', () => {
    test.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')

    test.describe('team coach (pool member)', () => {
        test.use({ storageState: PERSONAS.teamCoach.storageState })

        test('pauta nutricional del pool alumno: ABRE (gate colaborativo) y muestra el badge del owner', async ({ page }) => {
            await page.goto(`/coach/nutrition-plans/client/${STUDENT_IDS.pool}`)

            // Regresión del gate: antes esta página exigía coach_id propio => notFound para el pool.
            await expect(page.getByRole('heading', { name: 'Plan nutricional' })).toBeVisible({ timeout: 20_000 })
            await expect(page.getByText(STUDENT_NAMES.pool).first()).toBeVisible({ timeout: 10_000 })

            // Badge de awareness: el último editor es el owner (≠ viewer).
            await expect(page.getByText(/Editado por/i).first()).toBeVisible({ timeout: 10_000 })
        })
    })

    test.describe('team owner (último editor = él mismo)', () => {
        test.use({ storageState: PERSONAS.teamOwner.storageState })

        test('NO ve badge sobre su propia edición (solo ediciones ajenas son señal)', async ({ page }) => {
            await page.goto(`/coach/nutrition-plans/client/${STUDENT_IDS.pool}`)
            await expect(page.getByRole('heading', { name: 'Plan nutricional' })).toBeVisible({ timeout: 20_000 })
            await expect(page.getByText(/Editado por/i)).toHaveCount(0)
        })
    })

    test.describe('solo coach (standalone — fuera del pool)', () => {
        test.use({ storageState: PERSONAS.soloCoach.storageState })

        test('NUNCA ve el badge en su propio contenido (awareness es solo del pool)', async ({ page }) => {
            await page.goto(`/coach/nutrition-plans/client/${STUDENT_IDS.solo}`)
            await expect(page.getByRole('heading', { name: 'Plan nutricional' })).toBeVisible({ timeout: 20_000 })
            await expect(page.getByText(/Editado por/i)).toHaveCount(0)
        })

        test('la pauta del POOL alumno le es DENEGADA (aislamiento intacto)', async ({ page }) => {
            await page.goto(`/coach/nutrition-plans/client/${STUDENT_IDS.pool}`)
            // El gate por workspace activo no matchea => notFound (404) o redirect; jamás el nombre.
            await expect(page.getByText(STUDENT_NAMES.pool)).toHaveCount(0)
        })
    })
})
