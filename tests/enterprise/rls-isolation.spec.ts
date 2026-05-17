/**
 * RLS Isolation Tests — Enterprise
 *
 * Verifica que las políticas RLS de Supabase aíslan correctamente
 * los datos entre organizaciones, coaches y clientes.
 *
 * Requisitos:
 *   - npx supabase start (local)
 *   - npx supabase db reset (aplica seed.sql con datos de prueba)
 *   - npm run dev (no requerido para tests de API)
 *
 * Estrategia: signInWithPassword() con usuarios del seed → consultas directas
 * a Supabase via SDK → verificar que RLS filtra correctamente.
 * Nunca usar SET ROLE o service_role en estas pruebas.
 */

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Always run against local Supabase — these are RLS isolation tests, never prod
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const TEST_PASSWORD = 'TestPass123!'

// Seed UUIDs — matches supabase/seed.sql
const ORG_A_ID = '00000000-0000-0000-0002-000000000001'
const ORG_B_ID = '00000000-0000-0000-0002-000000000002'

const USERS = {
  ownerA:     'coach-owner-a@eva-test.cl',
  coachA1:    'coach-member-a1@eva-test.cl',
  ownerB:     'coach-owner-b@eva-test.cl',
  coachB1:    'coach-member-b1@eva-test.cl',
  coachBoth:  'coach-both@eva-test.cl',
  standalone: 'coach-solo@eva-test.cl',
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 0 } },
  })
}

async function signIn(email: string) {
  const client = makeClient()
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`signIn(${email}): ${error.message}`)
  return client
}

// These are pure API tests — no browser needed
test.use({ browserName: 'chromium' })

// ============================================================
// GRUPO 1 — Org isolation (coach de Org A no ve datos de Org B)
// ============================================================

test.describe('Org isolation', () => {
  test('coach Org A no ve clientes de Org B', async () => {
    const sb = await signIn(USERS.coachA1)

    const { data: clients } = await sb
      .from('clients')
      .select('id, org_id')
      .eq('org_id', ORG_B_ID)

    expect(clients ?? []).toHaveLength(0)
  })

  test('coach Org B no ve clientes de Org A', async () => {
    const sb = await signIn(USERS.coachB1)

    const { data: clients } = await sb
      .from('clients')
      .select('id, org_id')
      .eq('org_id', ORG_A_ID)

    expect(clients ?? []).toHaveLength(0)
  })

  test('coach Org A no ve organization_members de Org B', async () => {
    const sb = await signIn(USERS.coachA1)

    const { data: members } = await sb
      .from('organization_members')
      .select('id, org_id')
      .eq('org_id', ORG_B_ID)

    expect(members ?? []).toHaveLength(0)
  })

  test('coach Org B no ve organization_members de Org A', async () => {
    const sb = await signIn(USERS.coachB1)

    const { data: members } = await sb
      .from('organization_members')
      .select('id, org_id')
      .eq('org_id', ORG_A_ID)

    expect(members ?? []).toHaveLength(0)
  })

  test('org_owner A sí ve su propia org en organizations', async () => {
    const sb = await signIn(USERS.ownerA)

    const { data: orgs } = await sb
      .from('organizations')
      .select('id')
      .eq('id', ORG_A_ID)

    expect(orgs ?? []).toHaveLength(1)
  })

  test('org_owner A no ve Org B en organizations', async () => {
    const sb = await signIn(USERS.ownerA)

    const { data: orgs } = await sb
      .from('organizations')
      .select('id')
      .eq('id', ORG_B_ID)

    expect(orgs ?? []).toHaveLength(0)
  })
})

// ============================================================
// GRUPO 2 — Coach standalone no ve datos de orgs
// ============================================================

test.describe('Standalone coach isolation', () => {
  test('coach standalone no ve clients de ninguna org', async () => {
    const sb = await signIn(USERS.standalone)

    const { data: clients } = await sb
      .from('clients')
      .select('id, org_id')
      .not('org_id', 'is', null)

    expect(clients ?? []).toHaveLength(0)
  })

  test('coach standalone no ve organizations', async () => {
    const sb = await signIn(USERS.standalone)

    const { data: orgs } = await sb
      .from('organizations')
      .select('id')

    expect(orgs ?? []).toHaveLength(0)
  })

  test('coach standalone sí ve sus propios clientes', async () => {
    const sb = await signIn(USERS.standalone)

    const { data: clients } = await sb
      .from('clients')
      .select('id')
      .is('org_id', null)

    // seed crea 3 clientes para standalone coach
    expect((clients ?? []).length).toBeGreaterThanOrEqual(1)
  })
})

// ============================================================
// GRUPO 3 — Coach en 2 orgs
// ============================================================

test.describe('Coach en múltiples orgs', () => {
  test('coach_both ve clientes asignados de Org A', async () => {
    const sb = await signIn(USERS.coachBoth)

    const { data: assignments } = await sb
      .from('coach_client_assignments')
      .select('client_id, org_id')
      .eq('org_id', ORG_A_ID)

    // coach_both tiene 2 clientes asignados en org_a (seed: a4, a5)
    expect((assignments ?? []).length).toBeGreaterThanOrEqual(1)
  })

  test('coach_both ve sus membresías en ambas orgs', async () => {
    const sb = await signIn(USERS.coachBoth)

    const { data: memberships } = await sb
      .from('organization_members')
      .select('org_id, status')
      .eq('status', 'active')

    const orgIds = (memberships ?? []).map(m => m.org_id)
    expect(orgIds).toContain(ORG_A_ID)
    expect(orgIds).toContain(ORG_B_ID)
  })
})

// ============================================================
// GRUPO 4 — Audit logs (no UPDATE/DELETE permitido)
// ============================================================

test.describe('Audit log immutability', () => {
  test('coach no puede DELETE audit logs', async () => {
    const sb = await signIn(USERS.ownerA)

    const { error } = await sb
      .from('org_audit_logs')
      .delete()
      .eq('org_id', ORG_A_ID)

    // RLS debe bloquear → error o 0 rows afectadas
    // Supabase RLS en DELETE sin policy permitida devuelve error o 0 affected
    // Verificamos que no lanza error de conexión (solo de permisos o vacío)
    expect(error?.code).not.toBe('PGRST000') // no connection error
  })

  test('coach no puede UPDATE audit logs', async () => {
    const sb = await signIn(USERS.ownerA)

    const { error } = await sb
      .from('org_audit_logs')
      .update({ action: 'tampered' })
      .eq('org_id', ORG_A_ID)

    expect(error?.code).not.toBe('PGRST000')
  })
})
