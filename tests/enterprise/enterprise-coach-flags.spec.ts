import { test, expect } from '@playwright/test'

const TEST_PASSWORD = 'TestPass123!'

async function loginCoach(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(coach\/dashboard|org\/)/, { timeout: 10_000 })
}

test.describe('Enterprise coach feature flags', () => {
  test('org-managed coach does not see subscription or brand links', async ({ page }) => {
    await loginCoach(page, 'coach-member-a1@eva-test.cl')
    await page.goto('/coach/dashboard')

    await expect(page.locator('a[href="/coach/subscription"]')).toHaveCount(0)
    await expect(page.locator('a[href="/coach/settings"]')).toHaveCount(0)
  })

  test('standalone coach sees subscription and brand links', async ({ page }) => {
    await loginCoach(page, 'coach-solo@eva-test.cl')
    await page.goto('/coach/dashboard')

    await expect(page.locator('a[href="/coach/subscription"]').first()).toBeVisible()
    await expect(page.locator('a[href="/coach/settings"]').first()).toBeVisible()
  })

  test('org-managed coach is redirected away from subscription', async ({ page }) => {
    await loginCoach(page, 'coach-member-a1@eva-test.cl')
    await page.goto('/coach/subscription')

    await expect(page).toHaveURL(/\/coach\/dashboard(\?.*)?$/, { timeout: 10_000 })
  })
})
