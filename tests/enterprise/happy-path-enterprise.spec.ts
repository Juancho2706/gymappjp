import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_PASSWORD = 'TestPass123!'
const ORG_A_ID = '00000000-0000-0000-0002-000000000001'
const ORG_A_SLUG = 'crossfit-test-norte'
const COACH_A1_ID = '00000000-0000-0000-0001-000000000002'
const POST_LOGIN_URL = /\/(coach\/dashboard|org\/)/

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

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

async function waitForClientCoach(clientId: string, coachId: string) {
  const admin = adminClient()
  await expect.poll(async () => {
    const { data } = await admin
      .from('clients')
      .select('coach_id')
      .eq('id', clientId)
      .maybeSingle()
    return data?.coach_id ?? null
  }, { timeout: 10_000 }).toBe(coachId)
}

async function waitForClientPayment(clientId: string) {
  const admin = adminClient()
  await expect.poll(async () => {
    const { data } = await admin
      .from('client_payments')
      .select('id, status')
      .eq('client_id', clientId)
      .order('payment_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.status ?? null
  }, { timeout: 10_000 }).toBe('paid')
}

async function seedTemporaryClient() {
  const admin = adminClient()
  const id = randomUUID()
  const stamp = Date.now()
  const fullName = `Eva E2E Happy ${stamp}`
  const email = `eva-e2e-happy-${stamp}@example.com`

  const { error: authError } = await admin.auth.admin.createUser({
    id,
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, e2e: 'enterprise_happy_path' },
  })
  if (authError) throw new Error(authError.message)

  const { error } = await admin.from('clients').insert({
    id,
    org_id: ORG_A_ID,
    coach_id: null,
    email,
    full_name: fullName,
    is_active: true,
    is_archived: false,
    force_password_change: false,
    onboarding_completed: true,
    age_confirmed_at: new Date().toISOString(),
  })
  if (error) {
    await admin.auth.admin.deleteUser(id)
    throw new Error(error.message)
  }

  return { id, fullName, email }
}

async function cleanupTemporaryClient(clientId: string) {
  const admin = adminClient()
  const { data: payments } = await admin
    .from('client_payments')
    .select('id')
    .eq('client_id', clientId)

  const paymentIds = payments?.map((payment) => payment.id) ?? []
  if (paymentIds.length > 0) {
    await admin.from('org_audit_logs').delete().in('target_id', paymentIds)
  }

  await admin.from('org_audit_logs').delete().eq('target_id', clientId)
  await admin.from('client_payments').delete().eq('client_id', clientId)
  await admin.from('coach_client_assignments').delete().eq('client_id', clientId)
  await admin.from('clients').delete().eq('id', clientId)
  await admin.auth.admin.deleteUser(clientId)
}

test.describe('Enterprise happy path', () => {
  test('owner assigns a new client, records payment, and exports operational CSVs', async ({ page }) => {
    const client = await seedTemporaryClient()

    try {
      await loginAsOrgOwner(page)

      await page.goto(`/org/${ORG_A_SLUG}`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1').first()).toBeVisible()

      await page.goto(`/org/${ORG_A_SLUG}/assignments`, { waitUntil: 'domcontentloaded' })
      await page.getByLabel('Alumno sin coach').selectOption(client.id)
      await page.getByLabel('Coach destino').first().selectOption(COACH_A1_ID)
      await page.getByRole('button', { name: 'Asignar alumno' }).click()
      await expect(page.getByText('Alumno asignado.')).toBeVisible()
      await waitForClientCoach(client.id, COACH_A1_ID)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`/org/${ORG_A_SLUG}/payments?status=missing`, { waitUntil: 'domcontentloaded' })
      const clientRow = page.locator('div.border-b', { hasText: client.fullName }).first()
      await expect(clientRow).toBeVisible()
      await clientRow.getByRole('button', { name: /Registrar pago/i }).click()
      const paymentDialog = page.getByRole('dialog')
      await expect(paymentDialog.getByRole('heading', { name: 'Pago alumno' })).toBeVisible()
      await paymentDialog.getByLabel('Monto').fill('50000')
      await paymentDialog.getByLabel('Estado').selectOption('paid')
      await paymentDialog.getByLabel('Nota interna').fill('transferencia e2e happy path')
      await paymentDialog.getByRole('button', { name: 'Guardar pago' }).click()
      await expect(page.getByRole('heading', { name: 'Pago alumno' })).toBeHidden({ timeout: 10_000 })
      await waitForClientPayment(client.id)

      const paymentsExport = await page.request.get(`/org/${ORG_A_SLUG}/payments/export?status=paid`)
      expect(paymentsExport.status()).toBe(200)
      expect(paymentsExport.headers()['content-type']).toContain('text/csv')
      expect(await paymentsExport.text()).toContain(client.email)

      const reportsExport = await page.request.get(`/org/${ORG_A_SLUG}/reports/export`)
      expect(reportsExport.status()).toBe(200)
      expect(reportsExport.headers()['content-type']).toContain('text/csv')
      expect(await reportsExport.text()).toContain('RESUMEN OPERACIONAL')
    } finally {
      await cleanupTemporaryClient(client.id)
    }
  })
})
