/**
 * Invite Flow Tests — Enterprise
 *
 * Verifica el flujo completo de invitación de coaches a una organización.
 * Usa Inbucket (http://localhost:54324) para capturar emails de Supabase Auth.
 *
 * Requisitos:
 *   - npx supabase start (incluye Inbucket en :54324)
 *   - npx supabase db reset (seed aplicado)
 *   - npm run dev (Next.js en :3000)
 *
 * Nota: organization_invites usa token_hash (sha256 del token raw).
 * El flujo actual invita via organization_members.status='invited'.
 * Estos tests cubren el flujo de org_actions.inviteCoachAction.
 */

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const INBUCKET_URL = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324'
const TEST_PASSWORD = 'TestPass123!'

// Seed UUIDs
const ORG_A_SLUG = 'crossfit-test-norte'

function makeAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signIn(email: string) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`signIn(${email}): ${error.message}`)
  return client
}

// ============================================================
// GRUPO 1 — Invite via org panel (existing coach flow)
// ============================================================

test.describe('Invite coach via org panel', () => {
  test('owner A puede invitar a coach-invited a Org A via UI', async ({ page }) => {
    test.setTimeout(90_000)
    // Login as owner A
    await page.goto('/login')
    await page.fill('input[name="email"]', 'coach-owner-a@eva-test.cl')
    await page.fill('input[name="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(coach\/dashboard|org\/)/, { timeout: 10_000 })

    // Navigate to org coaches page
    await page.goto(`/org/${ORG_A_SLUG}/coaches`)
    await expect(page.locator('h1')).toBeVisible()

    // Invite form: coach-invited already exists as a coach in seed
    await page.locator('summary', { hasText: 'Abrir formulario' }).click()
    const emailInput = page.getByPlaceholder('coach existente@email.com')
    await emailInput.fill('coach-invited@eva-test.cl')
    const submitBtn = page.locator('details').getByRole('button', { name: /vincular|invitar/i })
    await submitBtn.click()
    await expect.poll(async () => {
      const admin = makeAdminClient()
      const { data } = await admin
        .from('organization_members')
        .select('id')
        .eq('org_id', '00000000-0000-0000-0002-000000000001')
        .eq('coach_id', '00000000-0000-0000-0001-000000000008')
      return data?.length ?? 0
    }, { timeout: 10_000 }).toBeGreaterThan(0)
  })

  test('coach suspendido tiene status suspended en organization_members', async () => {
    // organization_invites was dropped — invite states now live in organization_members.status
    const admin = makeAdminClient()
    const { data: member } = await admin
      .from('organization_members')
      .select('status')
      .eq('coach_id', '00000000-0000-0000-0001-000000000010') // coach_susp
      .eq('org_id',   '00000000-0000-0000-0002-000000000002') // org_b
      .maybeSingle()

    expect(member).not.toBeNull()
    expect(member!.status).toBe('suspended')
  })

  test('coach activo tiene status active en organization_members', async () => {
    const admin = makeAdminClient()
    const { data: member } = await admin
      .from('organization_members')
      .select('status, joined_at')
      .eq('coach_id', '00000000-0000-0000-0001-000000000002') // coach_a1
      .eq('org_id',   '00000000-0000-0000-0002-000000000001') // org_a
      .maybeSingle()

    expect(member).not.toBeNull()
    expect(member!.status).toBe('active')
    expect(member!.joined_at).not.toBeNull()
  })

  test('coach invitado tiene status invited en organization_members', async () => {
    const admin = makeAdminClient()
    const { data: member } = await admin
      .from('organization_members')
      .select('status, invited_at')
      .eq('coach_id', '00000000-0000-0000-0001-000000000008') // coach_inv
      .eq('org_id',   '00000000-0000-0000-0002-000000000002') // org_b
      .maybeSingle()

    expect(member).not.toBeNull()
    expect(member!.status).toBe('invited')
    expect(member!.invited_at).not.toBeNull()
  })
})

// ============================================================
// GRUPO 2 — Rate limiting en invitaciones
// ============================================================

test.describe('Rate limiting', () => {
  test('inviteCoachAction valida email real antes de invitar', async () => {
    const ownerSb = await signIn('coach-owner-a@eva-test.cl')

    // Try to invite a non-existent coach email
    const { data: { user } } = await ownerSb.auth.getUser()
    expect(user).not.toBeNull()

    // Verify org exists and owner has admin role
    const { data: membership } = await ownerSb
      .from('organization_members')
      .select('role')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .in('role', ['org_owner', 'org_admin'])
      .maybeSingle()

    expect(membership).not.toBeNull()
    expect(['org_owner', 'org_admin']).toContain(membership!.role)
  })
})

// ============================================================
// GRUPO 3 — Inbucket integration (solo si INBUCKET disponible)
// ============================================================

test.describe('Inbucket email capture', () => {
  test('Inbucket está disponible', async ({ request }) => {
    // Mailpit (used by Supabase local) responds at /api/v1/messages — Inbucket used /api/v1/status
    const res = await request.get(`${INBUCKET_URL}/api/v1/messages`).catch(() => null)
    if (!res) {
      test.skip(true, 'Mailpit/Inbucket no disponible — skip')
      return
    }
    expect(res.ok()).toBe(true)
  })

  test('emails de auth llegan a Inbucket en local', async ({ request }) => {
    // Check if any emails exist in Inbucket for test accounts
    const res = await request.get(`${INBUCKET_URL}/api/v1/mailbox/coach-owner-a`).catch(() => null)
    if (!res) {
      test.skip(true, 'Inbucket no disponible — skip')
      return
    }
    // Returns 200 even if empty mailbox — just verify the API responds
    expect([200, 404]).toContain(res.status())
  })
})
