import { expect, test } from '@playwright/test'

const TEST_PASSWORD = 'TestPass123!'
const ORG_A_SLUG = 'crossfit-test-norte'
const POST_LOGIN_URL = /\/(coach\/dashboard|org\/)/

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
]

const ORG_ROUTES = [
  { name: 'dashboard', path: '' },
  { name: 'clients', path: '/clients' },
  { name: 'assignments', path: '/assignments' },
  { name: 'payments', path: '/payments' },
  { name: 'coaches', path: '/coaches' },
  { name: 'team', path: '/team' },
  { name: 'brand', path: '/brand' },
  { name: 'announcements', path: '/announcements' },
  { name: 'nutrition', path: '/nutrition' },
  { name: 'reports', path: '/reports' },
  { name: 'settings', path: '/settings' },
  { name: 'audit', path: '/audit' },
]

async function loginAsOrgOwner(page: import('@playwright/test').Page) {
  await page.goto('/login')
  const closeCookies = page.getByRole('button', { name: 'Cerrar' })
  if (await closeCookies.isVisible().catch(() => false)) {
    await closeCookies.click()
  }
  await page.fill('input[name="email"]', 'coach-owner-a@eva-test.cl')
  await page.fill('input[name="password"]', TEST_PASSWORD)
  await Promise.all([
    page.waitForURL(POST_LOGIN_URL, { timeout: 30_000 }),
    page.getByRole('button', { name: /Ingresar al Panel/i }).click(),
  ])
}

test.describe('Enterprise mobile visual audit', () => {
  test.setTimeout(120_000)

  for (const viewport of VIEWPORTS) {
    test(`menus render without horizontal overflow at ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await loginAsOrgOwner(page)

      for (const route of ORG_ROUTES) {
        await page.goto(`/org/${ORG_A_SLUG}${route.path}`, { waitUntil: 'domcontentloaded' })

        await expect(page.locator('h1').first()).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Enterprise primary navigation' })).toBeVisible()

        const metrics = await page.evaluate(() => ({
          body: document.body.scrollWidth,
          document: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }))
        expect(Math.max(metrics.body, metrics.document)).toBeLessThanOrEqual(metrics.viewport + 1)

        await page.screenshot({
          path: testInfo.outputPath(`${viewport.name}-${route.name}.png`),
          fullPage: false,
          caret: 'initial',
        })
      }
    })
  }

  test('payments mobile opens record sheet without horizontal overflow', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsOrgOwner(page)
    await page.goto(`/org/${ORG_A_SLUG}/payments`, { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: /Editar registro|Registrar pago/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Pago alumno' })).toBeVisible()

    const metrics = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }))
    expect(Math.max(metrics.body, metrics.document)).toBeLessThanOrEqual(metrics.viewport + 1)

    await page.screenshot({
      path: testInfo.outputPath('390x844-payments-sheet.png'),
      fullPage: false,
      caret: 'initial',
    })
  })

  test('assignments mobile opens coach sheet without horizontal overflow', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsOrgOwner(page)
    await page.goto(`/org/${ORG_A_SLUG}/assignments`, { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: 'Ver alumnos' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const metrics = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }))
    expect(Math.max(metrics.body, metrics.document)).toBeLessThanOrEqual(metrics.viewport + 1)

    await page.screenshot({
      path: testInfo.outputPath('390x844-assignments-sheet.png'),
      fullPage: false,
      caret: 'initial',
    })
  })
})
