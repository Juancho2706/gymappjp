import { expect, test } from '@playwright/test'

test('pricing CTA sends tier/cycle to register', async ({ page }) => {
  await page.goto('/pricing')
  await page.getByRole('link', { name: 'Elegir plan' }).first().click()
  await expect(page).toHaveURL(/\/register\?tier=.*&cycle=monthly/)
})

test('register multi-step keeps selected plan from query', async ({ page }) => {
  await page.goto('/register?tier=elite&cycle=annual')

  await expect(page.getByText('Paso 1 de 3')).toBeVisible()
  await page.getByLabel('Nombre completo').fill('Coach QA')
  await page.getByLabel('Nombre de tu marca').fill('QA Fitness')
  await page.getByLabel('Email').fill('qa-coach@example.com')
  await page.getByLabel('Contraseña').fill('password-123')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByText('Elige tu plan')).toBeVisible()
  await expect(page.locator('input[name="subscription_tier"]')).toHaveValue('elite')
  await expect(page.locator('input[name="billing_cycle"]')).toHaveValue('annual')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByText('Resumen antes de pagar')).toBeVisible()
  await expect(page.getByText('Plan:')).toBeVisible()
})
