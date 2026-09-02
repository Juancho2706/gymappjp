import { test, expect } from '../_fixtures/suave'

/**
 * SMOKE SUAVE — superficies tocadas por el tren de backlog del 2026-09-02 (solo lectura).
 *
 * Misma disciplina que `coach-basico.spec.ts`: cinco cargas de panel con la cuenta QA propia,
 * aserciones baratas (URL, un texto o landmark) y una captura por pantalla para el owner. Nada
 * escribe. Cubre lo que cambió en web y se puede ver sin alumnos:
 *  - Mi plan sin candado ni «plan pago» (OB2)
 *  - Funciones: DomainsCard con switches con nombre accesible (B6/OB5)
 *  - Movimiento: hub gateado por dominio (OB9)
 *  - Catálogo de ejercicios (E2/E3/E5)
 *  - Directorio con el panel de solicitudes (W3/W4.1)
 */

test.describe('@smoke backlog 02-09 - solo lectura', () => {
    test('Mi plan: módulos incluidos en todos los planes, sin candado', async ({ page }, testInfo) => {
        await page.goto('/coach/subscription')
        await expect(page).toHaveURL(/\/coach\/subscription/)
        await expect(page.getByText(/incluidos en todos los planes/i).first()).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText(/cualquier plan pago/i)).toHaveCount(0)
        await testInfo.attach('mi-plan.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    })

    test('Funciones: switches de dominio con nombre accesible', async ({ page }, testInfo) => {
        await page.goto('/coach/settings/funciones')
        await expect(page).toHaveURL(/\/coach\/settings\/funciones/)
        await expect(page.getByRole('switch', { name: /Mostrar /i }).first()).toBeVisible({ timeout: 15_000 })
        await testInfo.attach('funciones.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    })

    test('Movimiento: el hub carga con sesión', async ({ page }, testInfo) => {
        await page.goto('/coach/movement')
        await expect(page).toHaveURL(/\/coach\/(movement|dashboard)/)
        await expect(page.locator('nav[aria-label="Navegación principal"]').first()).toBeVisible()
        await testInfo.attach('movimiento.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    })

    test('Ejercicios: el catálogo carga', async ({ page }, testInfo) => {
        await page.goto('/coach/exercises')
        await expect(page).toHaveURL(/\/coach\/exercises/)
        await expect(page).toHaveTitle(/Ejercicios|EVA/)
        await testInfo.attach('ejercicios.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    })

    test('Alumnos: el panel de solicitudes abre', async ({ page }, testInfo) => {
        await page.goto('/coach/clients?solicitudes=1')
        await expect(page).toHaveURL(/\/coach\/clients/)
        await expect(page.locator('nav[aria-label="Navegación principal"]').first()).toBeVisible()
        await testInfo.attach('solicitudes.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
    })
})
