import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
const ORG_LOGIN = `${BASE}/org/login`

test.describe('Enterprise login page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(ORG_LOGIN)
    })

    test('renders card with Panel Enterprise heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /Panel Enterprise/i })).toBeVisible()
    })

    test('form fields visible with labels', async ({ page }) => {
        await expect(page.getByLabel('Email corporativo')).toBeVisible()
        await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: /Ingresar al panel Enterprise/i })).toBeVisible()
    })

    test('password toggle works', async ({ page }) => {
        const pwd = page.getByLabel('Contraseña', { exact: true })
        const toggle = page.getByRole('button', { name: /Mostrar contraseña/i })
        await expect(pwd).toHaveAttribute('type', 'password')
        await toggle.click()
        await expect(pwd).toHaveAttribute('type', 'text')
    })

    test('back link points to eva-app.cl', async ({ page }) => {
        const backLink = page.getByRole('link', { name: /Volver a EVA Enterprise/i })
        await expect(backLink).toBeVisible()
        await expect(backLink).toHaveAttribute('href', /eva-app\.cl/)
    })

    test('coach redirect footer link is absolute cross-subdomain URL', async ({ page }) => {
        const coachLink = page.getByRole('link', { name: /eva-app\.cl/i })
        await expect(coachLink).toBeVisible()
        const href = await coachLink.getAttribute('href')
        expect(href).toMatch(/^https?:\/\/eva-app\.cl\/login/)
    })

    test('forgot-password link present with sufficient contrast class', async ({ page }) => {
        const link = page.getByRole('link', { name: /Olvidaste tu contraseña/i })
        await expect(link).toBeVisible()
        const className = await link.getAttribute('class')
        expect(className).not.toContain('text-zinc-600')
    })

    test('no horizontal overflow on mobile 375px', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto(ORG_LOGIN)
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        expect(bodyWidth).toBeLessThanOrEqual(375)
    })

    test('no horizontal overflow on mobile 393px', async ({ page }) => {
        await page.setViewportSize({ width: 393, height: 852 })
        await page.goto(ORG_LOGIN)
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        expect(bodyWidth).toBeLessThanOrEqual(393)
    })

    test('dark background applied (enterprise surface)', async ({ page }) => {
        const root = page.locator('[data-eva-surface="enterprise"]')
        await expect(root).toBeVisible()
    })

    test('EVA Enterprise badge visible', async ({ page }) => {
        // Target the amber badge specifically (not the back link or submit button)
        await expect(
            page.locator('span.text-amber-400', { hasText: /^Enterprise$/ }),
        ).toBeVisible()
    })

    test('submit button not disabled initially', async ({ page }) => {
        await expect(
            page.getByRole('button', { name: /Ingresar al panel Enterprise/i }),
        ).toBeEnabled()
    })

    test('generic error shown on wrong credentials', async ({ page }) => {
        await page.getByLabel('Email corporativo').fill('nobody@example.com')
        await page.getByLabel('Contraseña', { exact: true }).fill('wrongpassword')
        await page.getByRole('button', { name: /Ingresar al panel Enterprise/i }).click()
        // Wait for AuthErrorAlert (role=alert + aria-live=polite, not a field error)
        const alert = page.locator('div[role="alert"][aria-live="polite"]')
        await expect(alert).toBeVisible({ timeout: 10_000 })
        const alertText = await alert.textContent()
        // Generic message — must NOT reveal org membership
        expect(alertText).not.toMatch(/organización/i)
        expect(alertText).not.toMatch(/acceso/i)
    })
})
