import { expect, test, type Page } from '@playwright/test'

const slug = process.env.E2E_COACH_SLUG
const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD

function requireE2ECreds() {
  test.skip(!slug || !email || !password, 'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD')
}

async function loginClient(page: Page) {
  await page.goto(`/c/${slug}/login`)
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Contraseña').fill(password!)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(new RegExp(`/c/${slug}/dashboard`), { timeout: 45_000 })
}

test.describe('Student nutrition smoke', () => {
  test('login -> nutricion carga sin error', async ({ page }) => {
    test.setTimeout(90_000)
    requireE2ECreds()

    await loginClient(page)
    await page.goto(`/c/${slug}/nutrition`)
    await expect(page.getByRole('heading', { name: 'Plan Nutricional' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('body')).toContainText(/Plan Nutricional|Sin plan asignado|Copia local/i)
  })

  test('nutricion mantiene experiencia offline basica', async ({ page, context }) => {
    test.setTimeout(90_000)
    requireE2ECreds()

    await loginClient(page)
    await page.goto(`/c/${slug}/nutrition`)
    await expect(page.getByRole('heading', { name: 'Plan Nutricional' })).toBeVisible({ timeout: 20_000 })

    try {
      await context.setOffline(true)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.locator('body')).toContainText(/Sin conexion|Plan Nutricional|Copia local|Sin conexión/i)
    } finally {
      await context.setOffline(false)
    }
  })
})
