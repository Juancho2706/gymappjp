import { test, expect } from '@playwright/test'

/**
 * Smoke de rutas públicas / shell (sin auth).
 * Complementa mediciones manuales descritas en docs/PERFORMANCE-NAV-BASELINE.md
 */
test.describe('navigation perf smoke', () => {
    test('landing y login responden sin error', async ({ page }) => {
        const t0 = Date.now()
        await page.goto('/')
        await expect(page.locator('body')).toBeVisible()
        expect(Date.now() - t0).toBeLessThan(30_000)

        await page.goto('/login')
        await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible()
    })

    test('coach nav secuencial (opcional con credenciales)', async ({ page }) => {
        const email = process.env.PERF_COACH_EMAIL
        const password = process.env.PERF_COACH_PASSWORD
        test.skip(!email || !password, 'Define PERF_COACH_EMAIL y PERF_COACH_PASSWORD para habilitar esta prueba')

        await page.goto('/login')
        await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible({ timeout: 60_000 })
        await page.getByLabel('Email').fill(email!)
        await page.getByLabel('Contraseña').fill(password!)
        await page.getByRole('button', { name: /ingresar al panel/i }).click()

        await expect(page).toHaveURL(/\/coach\/dashboard/, { timeout: 30_000 })

        const routes = [
            '/coach/clients',
            '/coach/nutrition-plans',
            '/coach/exercises',
            '/coach/dashboard',
        ]

        for (const route of routes) {
            const t0 = Date.now()
            await page.goto(route)
            await expect(page.locator('body')).toBeVisible()
            expect(Date.now() - t0).toBeLessThan(30_000)
        }
    })
})
