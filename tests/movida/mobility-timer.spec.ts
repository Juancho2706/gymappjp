/**
 * E2E Plan 2 Movida (specs/movida-entrenamiento, AC5):
 * bloque de movilidad con hold → el alumno abre el timer de hold (countdown) y el
 * timer de intervalos muestra "intervalo N de M"; un solo timer activo a la vez.
 *
 * REGLA 2026-06-10: este spec se ESCRIBE en la tanda pero SOLO corre en el gate
 * final autorizado (1 corrida, --workers=1, contra build prod).
 *
 * Env requerido:
 *   E2E_COACH_SLUG / E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD
 *   E2E_MOBILITY_PLAN_ID — plan con al menos un bloque mobility (hold 30s)
 *                          y un bloque cardio con interval_config cronometrable.
 */
import { expect, test } from '@playwright/test'

const slug = process.env.E2E_COACH_SLUG
const clientEmail = process.env.E2E_CLIENT_EMAIL
const clientPassword = process.env.E2E_CLIENT_PASSWORD
const planId = process.env.E2E_MOBILITY_PLAN_ID

test.describe('Movida Plan 2 — timers de movilidad e intervalos', () => {
    test.beforeEach(async ({ page }) => {
        test.skip(
            !slug || !clientEmail || !clientPassword || !planId,
            'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD, E2E_MOBILITY_PLAN_ID'
        )
        await page.goto(`/c/${slug}/login`)
        await page.getByLabel('Email').fill(clientEmail!)
        await page.getByLabel('Contraseña').fill(clientPassword!)
        await page.getByRole('button', { name: 'Ingresar' }).click()
        await page.waitForTimeout(1500)
        await page.goto(`/c/${slug}/workout/${planId}`)
        await expect(page).toHaveURL(new RegExp(`/workout/${planId}`), { timeout: 30_000 })
    })

    test('HoldTimer: cuenta regresiva y botón repetir (AC5)', async ({ page }) => {
        test.setTimeout(120_000)

        // El bloque de movilidad muestra su card de Hold y el botón de timer
        await expect(page.getByText('Hold', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
        const holdButton = page.getByRole('button', { name: /Timer de hold/i }).first()
        await holdButton.click()

        // Overlay del hold: countdown visible + controles
        await expect(page.getByText('Mantén la posición')).toBeVisible({ timeout: 10_000 })
        await expect(page.getByRole('button', { name: 'Repetir hold' })).toBeVisible()

        // Cerrar
        await page.getByRole('button', { name: 'Cerrar timer' }).click()
        await expect(page.getByText('Mantén la posición')).toBeHidden({ timeout: 5_000 })
    })

    test('IntervalTimer: "intervalo N de M" + Wake Lock toggle (AC5)', async ({ page }) => {
        test.setTimeout(120_000)

        const intervalButton = page.getByRole('button', { name: /Iniciar intervalos/i }).first()
        test.skip(!(await intervalButton.isVisible().catch(() => false)), 'El plan no tiene bloque cardio con intervalos cronometrables')
        await intervalButton.click()

        // Indicador de fase + progreso "intervalo N de M"
        await expect(page.getByText(/intervalo 1 de \d+/i)).toBeVisible({ timeout: 15_000 })

        // Wake Lock: toggle visible (requiere gesto), con nota de batería al activarlo
        const wakeButton = page.getByRole('button', { name: 'Mantener pantalla encendida' })
        await expect(wakeButton).toBeVisible()
        await wakeButton.click()
        await expect(page.getByText(/consume más batería/i)).toBeVisible()

        // Un solo timer activo: iniciar el hold reemplaza al de intervalos (confirmación suave)
        const holdButton = page.getByRole('button', { name: /Timer de hold/i }).first()
        if (await holdButton.isVisible().catch(() => false)) {
            await holdButton.click()
            await expect(page.getByText('Temporizador anterior reemplazado')).toBeVisible({ timeout: 10_000 })
            await expect(page.getByText('Mantén la posición')).toBeVisible()
            await expect(page.getByText(/intervalo \d+ de \d+/i)).toBeHidden()
        }
    })

    test('regresión strength: bloques de fuerza intactos (AC3)', async ({ page }) => {
        // Un bloque strength del mismo plan sigue mostrando "Series x reps" y Kg/Reps
        const strengthHeader = page.getByText('Series x reps').first()
        test.skip(!(await strengthHeader.isVisible().catch(() => false)), 'El plan no tiene bloque strength')
        await expect(strengthHeader).toBeVisible()
        await expect(page.getByText('Kg', { exact: true }).first()).toBeVisible()
        await expect(page.getByText('Reps', { exact: true }).first()).toBeVisible()
    })
})
