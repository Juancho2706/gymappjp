import { expect, test } from '@playwright/test'

const TEST_PASSWORD = 'TestPass123!'
const ORG_A_SLUG = 'crossfit-test-norte'
const ORG_B_SLUG = 'box-test-sur'
const POST_LOGIN_URL = /\/(coach\/dashboard|org\/)/

const EXPORTS = [
  { name: 'audit', path: '/audit/export?limit=5', expectedHeader: 'created_at' },
  { name: 'payments', path: '/payments/export?status=all', expectedHeader: 'client_id' },
  { name: 'reports', path: '/reports/export', expectedHeader: 'RESUMEN OPERACIONAL' },
]

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  const closeCookies = page.getByRole('button', { name: 'Cerrar' })
  if (await closeCookies.isVisible().catch(() => false)) {
    await closeCookies.click()
  }
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', TEST_PASSWORD)
  await Promise.all([
    page.waitForURL(POST_LOGIN_URL, { timeout: 30_000 }),
    page.getByRole('button', { name: /Ingresar al Panel/i }).click(),
  ])
}

test.describe('Enterprise export cross-tenant guards', () => {
  test('org_owner A can export own org CSV endpoints', async ({ page }) => {
    await login(page, 'coach-owner-a@eva-test.cl')

    for (const item of EXPORTS) {
      const response = await page.request.get(`/org/${ORG_A_SLUG}${item.path}`)
      expect(response.status(), item.name).toBe(200)
      expect(response.headers()['content-type'], item.name).toContain('text/csv')
      const body = await response.text()
      expect(body, item.name).toContain(item.expectedHeader)
      expect(body, item.name).not.toContain('box-test-sur')
    }
  })

  test('org_owner A cannot export org B endpoints by slug swap', async ({ page }) => {
    await login(page, 'coach-owner-a@eva-test.cl')

    for (const item of EXPORTS) {
      const response = await page.request.get(`/org/${ORG_B_SLUG}${item.path}`, { maxRedirects: 0 })
      expect([302, 303, 307, 308, 403], item.name).toContain(response.status())
      const body = await response.text()
      expect(body, item.name).not.toContain('text/csv')
      expect(body, item.name).not.toContain('client_id,full_name')
      expect(body, item.name).not.toContain('RESUMEN OPERACIONAL')
      expect(response.headers()['content-type'] ?? '', item.name).not.toContain('text/csv')
      expect(response.headers()['content-disposition'] ?? '', item.name).not.toContain('attachment')
    }
  })
})
