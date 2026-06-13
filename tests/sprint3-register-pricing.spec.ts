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
  await expect(page.getByText('Plan', { exact: true }).first()).toBeVisible()
})

// ── Plan 04 (consolidación de planes): oferta = free/starter/pro/elite ──
// growth/scale salen de TODA superficie de venta; trimestral disponible en starter/pro;
// silencio total de IVA hasta constituir EVAapp SpA (F0-f).

test('pricing shows exactly the 4 sale plans and no legacy growth/scale', async ({ page }) => {
  await page.goto('/pricing')

  // Las 4 cards de plan a la venta están presentes (heading de cada PlanCard).
  await expect(page.getByRole('heading', { name: 'Free', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Starter', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Elite', exact: true })).toBeVisible()

  // Ningún tier legacy en la página de precios.
  await expect(page.getByRole('heading', { name: 'Growth', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Scale', exact: true })).toHaveCount(0)
  await expect(page.getByText('Growth', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Scale', { exact: false })).toHaveCount(0)
})

test('pricing lists Trimestral for starter and pro', async ({ page }) => {
  await page.goto('/pricing')

  // El ciclo trimestral aparece como fila de precio (recién habilitado en starter/pro).
  await expect(page.getByText('Trimestral').first()).toBeVisible()
  // Al menos una fila "Trimestral" por cada uno de starter/pro/elite → ≥3.
  expect(await page.getByText('Trimestral').count()).toBeGreaterThanOrEqual(3)
})

test('register normalizes ?tier=growth to starter (legacy link degrades safely)', async ({ page }) => {
  await page.goto('/register?tier=growth&cycle=quarterly')

  // Avanzar al paso 2 para inspeccionar el hidden input ya normalizado.
  const reactFill = async (selector: string, value: string) => {
    await page.locator(selector).evaluate((el: HTMLInputElement, val: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  }
  await reactFill('input[id="full_name"]', 'Coach QA')
  await reactFill('input[id="brand_name"]', 'QA Fitness')
  await reactFill('input[name="email"]', 'qa-growth@example.com')
  await reactFill('input[id="password"]', 'password-123')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByText('Elige tu plan')).toBeVisible()
  await expect(page.locator('input[name="subscription_tier"]')).toHaveValue('starter')
})

test('register keeps billing_cycle=quarterly for ?tier=pro&cycle=quarterly', async ({ page }) => {
  await page.goto('/register?tier=pro&cycle=quarterly')

  const reactFill = async (selector: string, value: string) => {
    await page.locator(selector).evaluate((el: HTMLInputElement, val: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  }
  await reactFill('input[id="full_name"]', 'Coach QA')
  await reactFill('input[id="brand_name"]', 'QA Fitness')
  await reactFill('input[name="email"]', 'qa-pro-q@example.com')
  await reactFill('input[id="password"]', 'password-123')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByText('Elige tu plan')).toBeVisible()
  await expect(page.locator('input[name="subscription_tier"]')).toHaveValue('pro')
  await expect(page.locator('input[name="billing_cycle"]')).toHaveValue('quarterly')
})

test('register step 2 marks pro as "Más popular"', async ({ page }) => {
  await page.goto('/register?tier=starter&cycle=monthly')

  const reactFill = async (selector: string, value: string) => {
    await page.locator(selector).evaluate((el: HTMLInputElement, val: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, value)
  }
  await reactFill('input[id="full_name"]', 'Coach QA')
  await reactFill('input[id="brand_name"]', 'QA Fitness')
  await reactFill('input[name="email"]', 'qa-popular@example.com')
  await reactFill('input[id="password"]', 'password-123')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByText('Elige tu plan')).toBeVisible()
  await expect(page.getByText('Más popular')).toBeVisible()
})

test('neither pricing nor register mention IVA (F0-f: EVAapp SpA pendiente)', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('IVA', { exact: false })).toHaveCount(0)

  await page.goto('/register?tier=starter&cycle=monthly')
  await expect(page.getByText('IVA', { exact: false })).toHaveCount(0)
})
