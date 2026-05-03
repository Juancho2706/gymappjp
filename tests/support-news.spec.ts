import { test, expect } from '@playwright/test'

test('coach support page redirects unauthenticated to login', async ({ page }) => {
  await page.goto('/coach/support')
  await expect(page).toHaveURL(/\/login/)
})

test('admin novedades page redirects unauthenticated to admin login', async ({ page }) => {
  await page.goto('/admin/novedades')
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('landing page still loads correctly', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/EVA/i)
  await expect(page.locator('body')).toBeVisible()
})

test('login page still loads correctly', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible()
})
