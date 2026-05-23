import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'

test.describe('Coach login page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`${BASE}/login`)
    })

    test('renders heading and form fields', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible()
        await expect(page.locator('#email')).toBeVisible()
        await expect(page.locator('#password')).toBeVisible()
        await expect(page.getByRole('button', { name: /Ingresar al Panel/i })).toBeVisible()
    })

    test('labels are wired to inputs (htmlFor)', async ({ page }) => {
        await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email')
        await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'password')
    })

    test('password toggle shows/hides text', async ({ page }) => {
        const passwordInput = page.getByLabel('Contraseña', { exact: true })
        const toggle = page.getByRole('button', { name: /Mostrar contraseña/i })

        await expect(passwordInput).toHaveAttribute('type', 'password')
        await toggle.click()
        await expect(passwordInput).toHaveAttribute('type', 'text')
        await expect(page.getByRole('button', { name: /Ocultar contraseña/i })).toBeVisible()
        await page.getByRole('button', { name: /Ocultar contraseña/i }).click()
        await expect(passwordInput).toHaveAttribute('type', 'password')
    })

    test('client validation shows aria-invalid on blur', async ({ page }) => {
        await page.locator('#email').fill('not-an-email')
        await page.locator('#password').focus()
        await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true')

        await page.locator('#email').focus()
        await page.locator('#password').fill('ab')
        await page.locator('#email').focus()
        await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true')
    })

    test('invalid email shows client error', async ({ page }) => {
        await page.locator('#email').fill('not-an-email')
        await page.locator('#password').focus()
        await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true')
    })

    test('Google OAuth button visible', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Continuar con Google/i })).toBeVisible()
    })

    test('forgot-password link present', async ({ page }) => {
        await expect(page.getByRole('link', { name: /Olvidaste tu contraseña/i })).toBeVisible()
    })

    test('create account link present', async ({ page }) => {
        await expect(page.getByRole('link', { name: /Crear cuenta/i })).toBeVisible()
    })

    test('no elements overflow on mobile 375px', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto(`${BASE}/login`)
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        expect(bodyWidth).toBeLessThanOrEqual(375)
    })

    test('no elements overflow on mobile 393px', async ({ page }) => {
        await page.setViewportSize({ width: 393, height: 852 })
        await page.goto(`${BASE}/login`)
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
        expect(bodyWidth).toBeLessThanOrEqual(393)
    })

    test('url error banner renders from ?error= param', async ({ page }) => {
        await page.goto(`${BASE}/login?error=session_expired`)
        await expect(page.locator('[role="alert"][aria-live="polite"]').first()).toBeVisible()
        await expect(page.getByText(/sesión expiró/i)).toBeVisible()
    })

    test('unknown url error shows generic message', async ({ page }) => {
        await page.goto(`${BASE}/login?error=unknown_xyz`)
        await expect(page.locator('[role="alert"][aria-live="polite"]').first()).toBeVisible()
        await expect(page.getByText(/Ocurrió un error/i)).toBeVisible()
    })

    test('submit button has accessible label and is not disabled initially', async ({ page }) => {
        const btn = page.getByRole('button', { name: /Ingresar al Panel/i })
        await expect(btn).toBeEnabled()
        await expect(btn).not.toHaveAttribute('aria-busy', 'true')
    })
})
