import { expect, test } from '@playwright/test'

const slug = process.env.E2E_COACH_SLUG
const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD

test.describe('Student nutrition smoke', () => {
  test('login → nutrición carga sin error', async ({ page }) => {
    test.setTimeout(90_000)
    test.skip(
      !slug || !email || !password,
      'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD'
    )

    await page.goto(`/c/${slug}/login`)
    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Contraseña').fill(password!)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.waitForURL(new RegExp(`/c/${slug}/dashboard`), { timeout: 45_000 })

    await page.goto(`/c/${slug}/nutrition`)
    await expect(page.getByRole('heading', { name: 'Plan Nutricional' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('body')).toBeVisible()
  })
})
