import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_PASSWORD = 'TestPass123!'

const ORG_B_ID = '00000000-0000-0000-0002-000000000002'
const ORG_B_SLUG = 'box-test-sur'
const COACH_SUSPENDED_ID = '00000000-0000-0000-0001-000000000010'
const COACH_SUSPENDED_EMAIL = 'coach-suspended@eva-test.cl'

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function seedStaleEnterprisePreference() {
  const admin = adminClient()
  const { data: previous } = await admin
    .from('workspace_preferences')
    .select('user_id, last_workspace_type, last_org_id, last_coach_id, last_client_id, updated_at')
    .eq('user_id', COACH_SUSPENDED_ID)
    .maybeSingle()

  const { error } = await admin
    .from('workspace_preferences')
    .upsert({
      user_id: COACH_SUSPENDED_ID,
      last_workspace_type: 'enterprise_coach',
      last_org_id: ORG_B_ID,
      last_coach_id: COACH_SUSPENDED_ID,
      last_client_id: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)

  return async () => {
    if (previous) {
      await admin.from('workspace_preferences').upsert(previous, { onConflict: 'user_id' })
    } else {
      await admin.from('workspace_preferences').delete().eq('user_id', COACH_SUSPENDED_ID)
    }
  }
}

async function signInSuspendedCoach() {
  const sb = anonClient()
  const { data, error } = await sb.auth.signInWithPassword({
    email: COACH_SUSPENDED_EMAIL,
    password: TEST_PASSWORD,
  })
  if (error) throw new Error(error.message)
  const token = data.session?.access_token
  if (!token) throw new Error('Missing access token')
  return token
}

test.describe.serial('Workspace revocation stale cache guards', () => {
  test('stale enterprise workspace preference does not authorize suspended coach APIs', async ({ request }) => {
    const cleanup = await seedStaleEnterprisePreference()
    try {
      const token = await signInSuspendedCoach()

      const response = await request.get('/api/mobile/coach/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.workspace.type).toBe('coach_standalone')
      expect(body.workspace.orgId).toBeNull()
    } finally {
      await cleanup()
    }
  })

  test('stale enterprise workspace preference does not authorize /org slug access', async ({ page }) => {
    const cleanup = await seedStaleEnterprisePreference()
    try {
      await page.goto('/login')
      const closeCookies = page.getByRole('button', { name: 'Cerrar' })
      if (await closeCookies.isVisible().catch(() => false)) {
        await closeCookies.click()
      }
      await page.fill('input[name="email"]', COACH_SUSPENDED_EMAIL)
      await page.fill('input[name="password"]', TEST_PASSWORD)
      await Promise.all([
        page.waitForURL('**/coach/dashboard', { timeout: 30_000 }),
        page.getByRole('button', { name: /Ingresar al Panel/i }).click(),
      ])

      await page.goto(`/org/${ORG_B_SLUG}`)
      await expect(page).not.toHaveURL(new RegExp(`/org/${ORG_B_SLUG}$`))
      await expect(page).toHaveURL(/\/coach\/dashboard|\/workspace\/select/)
    } finally {
      await cleanup()
    }
  })
})
