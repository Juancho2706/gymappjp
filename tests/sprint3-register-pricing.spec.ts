import { expect, test } from '@playwright/test'

test('pricing CTA sends tier/cycle to register', async ({ page }) => {
  await page.goto('/pricing')
  await page.getByRole('link', { name: 'Elegir plan' }).first().click()
  await expect(page).toHaveURL(/\/register\?tier=.*&cycle=monthly/)
})

test('register multi-step keeps selected plan from query', async ({ page }) => {
  await page.goto('/register?tier=elite&cycle=annual')

  await expect(page.getByText('Paso 1 de 3')).toBeVisible()

  // React controlled inputs: use native setter + input event to update React state
  const reactFill = async (selector: string, value: string) => {
    await page.locator(selector).evaluate((el: HTMLInputElement, val: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  }

  await reactFill('input[id="full_name"]', 'Coach QA')
  await reactFill('input[id="brand_name"]', 'QA Fitness')
  await reactFill('input[name="email"]', 'qa-coach@example.com')
  await reactFill('input[id="password"]', 'password-123')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByText('Elige tu plan')).toBeVisible()
  await expect(page.locator('input[name="subscription_tier"]')).toHaveValue('elite')
  await expect(page.locator('input[name="billing_cycle"]')).toHaveValue('annual')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByText('Resumen antes de pagar')).toBeVisible()
  await expect(page.getByText('Plan:')).toBeVisible()
})
