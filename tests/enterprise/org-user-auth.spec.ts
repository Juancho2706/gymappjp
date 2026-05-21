import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const TEST_PASSWORD = 'TestPass123!'
const ORG_A_ID = '00000000-0000-0000-0002-000000000001'
const ORG_A_SLUG = 'crossfit-test-norte'
const ORG_ONLY_EMAIL = 'org-owner-nocoach@eva-test.cl'

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

test.describe('Org-only user auth', () => {
  test('org-only user can log in through /org/login', async ({ page }) => {
    await page.goto('/org/login')
    await page.fill('input[name="email"]', ORG_ONLY_EMAIL)
    await page.fill('input[name="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(`/org/${ORG_A_SLUG}`, { timeout: 10_000 })
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible()
  })

  test('org-only user has org access but no coach row', async () => {
    const sb = makeClient()
    const { error } = await sb.auth.signInWithPassword({
      email: ORG_ONLY_EMAIL,
      password: TEST_PASSWORD,
    })
    expect(error).toBeNull()

    const { data: { user } } = await sb.auth.getUser()
    expect(user).not.toBeNull()

    const { data: members } = await sb
      .from('organization_members')
      .select('org_id, role, coach_id')
      .eq('org_id', ORG_A_ID)
      .eq('user_id', user!.id)

    expect(members ?? []).toHaveLength(1)
    expect(members![0].role).toBe('org_admin')
    expect(members![0].coach_id).toBeNull()

    const { data: coaches } = await sb.from('coaches').select('id').eq('id', user!.id)
    expect(coaches ?? []).toHaveLength(0)
  })

  test('org-only user cannot stay on /coach/dashboard', async ({ page }) => {
    await page.goto('/org/login')
    await page.fill('input[name="email"]', ORG_ONLY_EMAIL)
    await page.fill('input[name="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(`/org/${ORG_A_SLUG}`, { timeout: 10_000 })

    await page.goto('/coach/dashboard')
    await expect(page).not.toHaveURL(/\/coach\/dashboard$/)
  })
})
