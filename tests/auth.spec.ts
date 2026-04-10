import { test, expect } from '@playwright/test'

test('landing carga', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/EVA/i)
    await expect(page.locator('body')).toBeVisible()
})

test('login coach carga', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible()
})
