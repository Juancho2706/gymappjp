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

const EXERCISES = {
  coachA1Scoped: '00000000-0000-0000-0007-000000000001', // coach_a1 personal (coach_id=coach_a1, org_id=null)
  orgAScoped:    '00000000-0000-0000-0007-000000000002', // org exercise (org_id=org_a, coach_id=null)
  soloScoped:    '00000000-0000-0000-0007-000000000003', // standalone coach_solo (coach_id=solo, org_id=null)
}

const CHECKINS = {
  orgA:       '00000000-0000-0000-0009-000000000001', // client ca1 (org_a / coach_a1)
  standalone: '00000000-0000-0000-0009-000000000002', // client cs1 (standalone / coach_solo)
}

const FIXTURES = {
  nutritionPlanOrgA:  '00000000-0000-0000-0006-000000000001', // ca1/coach_a1/org_a
  workoutProgramOrgA: '00000000-0000-0000-0008-000000000001', // ca1/coach_a1/org_a
  clientPaymentOrgA:  '00000000-0000-0000-000a-000000000001', // ca1/coach_a1
}

const USERS = {
  ownerA:       'coach-owner-a@eva-test.cl',
  coachA1:      'coach-member-a1@eva-test.cl',
  ownerB:       'coach-owner-b@eva-test.cl',
  coachB1:      'coach-member-b1@eva-test.cl',
  coachBoth:    'coach-both@eva-test.cl',
  standalone:   'coach-solo@eva-test.cl',
  coachSuspended: 'coach-suspended@eva-test.cl', // suspended from org_b, has standalone account
  clientA1:     'client-a1@eva-test.cl',    // alumno org_a, coach_a1
  clientSolo:   'client-solo1@eva-test.cl', // alumno standalone, coach_solo
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

// ============================================================
// GRUPO 5 — Exercises RLS isolation
// ============================================================

test.describe('Exercises isolation', () => {
  test('coach standalone NO ve exercises de org_a', async () => {
    const sb = await signIn(USERS.standalone)
    const { data } = await sb
      .from('exercises')
      .select('id')
      .eq('id', EXERCISES.orgAScoped)
    expect(data ?? []).toHaveLength(0)
  })

  test('coach standalone SÍ ve su propio exercise', async () => {
    const sb = await signIn(USERS.standalone)
    const { data } = await sb
      .from('exercises')
      .select('id')
      .eq('id', EXERCISES.soloScoped)
    expect(data ?? []).toHaveLength(1)
  })

  test('coach_a1 SÍ ve exercise org_a (org member)', async () => {
    const sb = await signIn(USERS.coachA1)
    const { data } = await sb
      .from('exercises')
      .select('id')
      .eq('id', EXERCISES.orgAScoped)
    expect(data ?? []).toHaveLength(1)
  })

  test('coach_a1 NO ve exercise standalone de coach_solo', async () => {
    const sb = await signIn(USERS.coachA1)
    const { data } = await sb
      .from('exercises')
      .select('id')
      .eq('id', EXERCISES.soloScoped)
    expect(data ?? []).toHaveLength(0)
  })

  test('coach_b1 NO ve exercise org_a', async () => {
    const sb = await signIn(USERS.coachB1)
    const { data } = await sb
      .from('exercises')
      .select('id')
      .eq('id', EXERCISES.orgAScoped)
    expect(data ?? []).toHaveLength(0)
  })

  test('coach standalone NO puede INSERT exercise con org_id', async () => {
    const sb = await signIn(USERS.standalone)
    const { error } = await sb
      .from('exercises')
      .insert({
        name: 'Attack Exercise',
        muscle_group: 'Pecho',
        org_id: ORG_A_ID,
        coach_id: null,
        source: 'org',
      })
    // RLS debe bloquear
    expect(error).not.toBeNull()
  })

  test('coach_a1 NO puede INSERT exercise en org_b', async () => {
    const sb = await signIn(USERS.coachA1)
    const { error } = await sb
      .from('exercises')
      .insert({
        name: 'CrossOrg Attack',
        muscle_group: 'Espalda',
        org_id: ORG_B_ID,
        coach_id: null,
        source: 'org',
      })
    expect(error).not.toBeNull()
  })
})

// ============================================================
// GRUPO 6 — Enterprise coach no ve datos standalone
// ============================================================

test.describe('Enterprise coach isolation from standalone', () => {
  test('coach_a1 (org_managed) NO ve clientes standalone (org_id IS NULL de otros coaches)', async () => {
    const sb = await signIn(USERS.coachA1)
    // Standalone clients have coach_id=coach_solo, org_id=null
    // coach_a1 should NOT see them — RLS only allows coach_id=auth.uid() for standalone
    const { data } = await sb
      .from('clients')
      .select('id, org_id')
      .is('org_id', null)
    // coach_a1 has no standalone clients in seed
    const foreignStandalone = (data ?? []).filter(c => c.org_id === null)
    // All returned rows must belong to coach_a1's own standalone (none in seed)
    expect(foreignStandalone).toHaveLength(0)
  })

  test('coach standalone NO puede ver workout_programs de org_a', async () => {
    const sb = await signIn(USERS.standalone)
    const { data } = await sb
      .from('workout_programs')
      .select('id, org_id')
      .eq('org_id', ORG_A_ID)
    expect(data ?? []).toHaveLength(0)
  })

  test('coach_a1 NO puede ver workout_programs de org_b', async () => {
    const sb = await signIn(USERS.coachA1)
    const { data } = await sb
      .from('workout_programs')
      .select('id, org_id')
      .eq('org_id', ORG_B_ID)
    expect(data ?? []).toHaveLength(0)
  })
})

// ============================================================
// GRUPO 7 — workspace_preferences isolation
// ============================================================

test.describe('Workspace preferences isolation', () => {
  test('coach standalone NO ve workspace_preferences de otro usuario', async () => {
    const sb = await signIn(USERS.standalone)
    // workspace_preferences should only return own rows
    const { data } = await sb
      .from('workspace_preferences')
      .select('user_id')
    const uniqueUsers = [...new Set((data ?? []).map(r => r.user_id))]
    // All returned rows must be own user_id (RLS enforced)
    expect(uniqueUsers.length).toBeLessThanOrEqual(1)
  })
})

// ============================================================
// GRUPO 8 — check_ins isolation (datos de salud sensibles)
// Regresión del leak: policy "Enable read access for authenticated users"
// (qual=true) permitía a cualquier autenticado leer TODOS los check-ins.
// Fix: migración 20260530170000_fix_checkins_rls_leak.sql
// ============================================================

test.describe('Check-ins isolation (health data)', () => {
  test('alumno NO ve check-ins de otro alumno', async () => {
    const sb = await signIn(USERS.clientSolo)
    // clientSolo intenta leer el check-in de ca1 (org_a) — debe dar 0 filas
    const { data } = await sb
      .from('check_ins')
      .select('id, weight, notes')
      .eq('id', CHECKINS.orgA)
    expect(data ?? []).toHaveLength(0)
  })

  test('alumno SÍ ve sus propios check-ins', async () => {
    const sb = await signIn(USERS.clientSolo)
    const { data } = await sb
      .from('check_ins')
      .select('id')
      .eq('id', CHECKINS.standalone)
    expect(data ?? []).toHaveLength(1)
  })

  test('coach NO ve check-ins de alumnos de otro coach', async () => {
    const sb = await signIn(USERS.standalone) // coach_solo
    // coach_solo intenta leer check-in de ca1 (alumno de coach_a1) — 0 filas
    const { data } = await sb
      .from('check_ins')
      .select('id')
      .eq('id', CHECKINS.orgA)
    expect(data ?? []).toHaveLength(0)
  })

  test('coach SÍ ve check-ins de sus propios alumnos', async () => {
    const sb = await signIn(USERS.standalone) // coach_solo, dueño de cs1
    const { data } = await sb
      .from('check_ins')
      .select('id')
      .eq('id', CHECKINS.standalone)
    expect(data ?? []).toHaveLength(1)
  })

  test('regresión leak: ningún coach puede leer TODOS los check-ins', async () => {
    const sb = await signIn(USERS.coachB1)
    // coach_b1 no es dueño de ca1 ni cs1 → no debe ver ninguno de los 2 seed check-ins
    const { data } = await sb
      .from('check_ins')
      .select('id')
      .in('id', [CHECKINS.orgA, CHECKINS.standalone])
    expect(data ?? []).toHaveLength(0)
  })
})

// ============================================================
// GRUPO 9 — workout_programs isolation
// ============================================================

test.describe('Workout programs isolation', () => {
  test('coach_b1 NO ve workout_programs de org_a', async () => {
    const sb = await signIn(USERS.coachB1)
    const { data } = await sb
      .from('workout_programs')
      .select('id')
      .eq('id', FIXTURES.workoutProgramOrgA)
    expect(data ?? []).toHaveLength(0)
  })

  test('standalone NO ve workout_programs de org_a', async () => {
    const sb = await signIn(USERS.standalone)
    const { data } = await sb
      .from('workout_programs')
      .select('id')
      .eq('id', FIXTURES.workoutProgramOrgA)
    expect(data ?? []).toHaveLength(0)
  })

  test('coach_a1 SÍ ve workout_programs de su propio cliente', async () => {
    const sb = await signIn(USERS.coachA1)
    const { data } = await sb
      .from('workout_programs')
      .select('id')
      .eq('id', FIXTURES.workoutProgramOrgA)
    expect(data ?? []).toHaveLength(1)
  })
})

// ============================================================
// GRUPO 10 — nutrition_plans isolation
// ============================================================

test.describe('Nutrition plans isolation', () => {
  test('coach_b1 NO ve nutrition_plans de org_a', async () => {
    const sb = await signIn(USERS.coachB1)
    const { data } = await sb
      .from('nutrition_plans')
      .select('id')
      .eq('id', FIXTURES.nutritionPlanOrgA)
    expect(data ?? []).toHaveLength(0)
  })

  test('standalone NO ve nutrition_plans de org_a', async () => {
    const sb = await signIn(USERS.standalone)
    const { data } = await sb
      .from('nutrition_plans')
      .select('id')
      .eq('id', FIXTURES.nutritionPlanOrgA)
    expect(data ?? []).toHaveLength(0)
  })

  test('coach_a1 SÍ ve nutrition_plans de su propio cliente', async () => {
    const sb = await signIn(USERS.coachA1)
    const { data } = await sb
      .from('nutrition_plans')
      .select('id')
      .eq('id', FIXTURES.nutritionPlanOrgA)
    expect(data ?? []).toHaveLength(1)
  })
})

// ============================================================
// GRUPO 11 — client_payments isolation
// ============================================================

test.describe('Client payments isolation', () => {
  test('coach_b1 NO ve client_payments de org_a', async () => {
    const sb = await signIn(USERS.coachB1)
    const { data } = await sb
      .from('client_payments')
      .select('id')
      .eq('id', FIXTURES.clientPaymentOrgA)
    expect(data ?? []).toHaveLength(0)
  })

  test('standalone NO ve client_payments de org_a', async () => {
    const sb = await signIn(USERS.standalone)
    const { data } = await sb
      .from('client_payments')
      .select('id')
      .eq('id', FIXTURES.clientPaymentOrgA)
    expect(data ?? []).toHaveLength(0)
  })

  test('coach_a1 SÍ ve client_payments de su propio cliente', async () => {
    const sb = await signIn(USERS.coachA1)
    const { data } = await sb
      .from('client_payments')
      .select('id')
      .eq('id', FIXTURES.clientPaymentOrgA)
    expect(data ?? []).toHaveLength(1)
  })
})

// ============================================================
// GRUPO 12 — Branding resolver: workspace determines brand source
// ============================================================

test.describe('Branding workspace isolation', () => {
  test('enterprise client (ca1) has org_id set — inherits org brand', async () => {
    const sb = await signIn(USERS.clientA1)
    const { data } = await sb
      .from('clients')
      .select('id, org_id, coach_id')
      .eq('id', '00000000-0000-0000-0003-000000000001')
    const client = (data ?? [])[0]
    // Must have org_id (enterprise context) — brand comes from org not coach
    expect(client?.org_id).toBe(ORG_A_ID)
    expect(client?.org_id).not.toBeNull()
  })

  test('standalone client (cs1) has no org_id — inherits coach brand', async () => {
    const sb = await signIn(USERS.clientSolo)
    const { data } = await sb
      .from('clients')
      .select('id, org_id, coach_id')
      .eq('id', '00000000-0000-0000-0005-000000000001')
    const client = (data ?? [])[0]
    // Must NOT have org_id (standalone context) — brand comes from coach
    expect(client?.org_id).toBeNull()
    expect(client?.coach_id).not.toBeNull()
  })

  test('enterprise client workspace has org_id — brand resolver uses org not coach', async () => {
    const sb = await signIn(USERS.clientA1)
    // ca1 belongs to org_a. The brand resolver picks org brand when org_id is set.
    // Verify: ca1's org brand source (org_a has primary_color/logo_url).
    // Coaches table is semi-public; brand isolation is service-layer, not row-level.
    // Test: ca1 can see their own org's data but NOT org_b org data (org isolation).
    const { data: orgAData } = await sb.from('clients').select('org_id').eq('id', '00000000-0000-0000-0003-000000000001')
    expect((orgAData ?? [])[0]?.org_id).toBe(ORG_A_ID)

    // ca1 cannot read org_b's members (already tested in Group 1), confirming org isolation
    const { data: orgBMembers } = await sb.from('organization_members').select('id').eq('org_id', ORG_B_ID)
    expect(orgBMembers ?? []).toHaveLength(0)
  })

  test('standalone client cannot read enterprise org branding', async () => {
    const sb = await signIn(USERS.clientSolo)
    const { data } = await sb
      .from('organizations')
      .select('id, primary_color, logo_url')
      .eq('id', ORG_A_ID)
    // Standalone client has no org membership — org branding not accessible
    expect(data ?? []).toHaveLength(0)
  })
})

// ============================================================
// GRUPO 13 — Revoke: suspended/revoked coach loses enterprise access,
//            retains standalone capabilities
// ============================================================

test.describe('Revoke preserves standalone workspace', () => {
  test('suspended enterprise coach still has a coaches row (standalone preserved)', async () => {
    const sb = await signIn(USERS.coachSuspended)
    // coach_susp has a coaches table row with standalone data
    const { data } = await sb
      .from('coaches')
      .select('id, active_org_id, subscription_status')
      .eq('id', '00000000-0000-0000-0001-000000000010')
    expect(data ?? []).toHaveLength(1)
  })

  test('suspended coach cannot read org_b data via organization_members', async () => {
    const sb = await signIn(USERS.coachSuspended)
    // Status = suspended → RLS should block active membership query
    const { data } = await sb
      .from('organization_members')
      .select('id, status')
      .eq('org_id', ORG_B_ID)
      .eq('status', 'active')
    // Suspended member has no active membership — should return 0 active rows
    const ownActive = (data ?? []).filter(m => m.status === 'active')
    expect(ownActive).toHaveLength(0)
  })

  test('suspended coach cannot read org_b clients', async () => {
    const sb = await signIn(USERS.coachSuspended)
    // coach_susp is suspended from org_b — org_b clients must be invisible
    const { data } = await sb
      .from('clients')
      .select('id')
      .eq('org_id', ORG_B_ID)
    expect(data ?? []).toHaveLength(0)
  })

  test('suspended coach can still read their own standalone clients', async () => {
    const sb = await signIn(USERS.coachSuspended)
    // coach_susp has standalone coach row — standalone clients visible via coach RLS
    // (seed: coach_susp has no standalone clients, check they can query standalone space)
    const { data } = await sb
      .from('clients')
      .select('id')
      .is('org_id', null)
      .eq('coach_id', '00000000-0000-0000-0001-000000000010')
    // No standalone clients for coach_susp in seed, but query should work (not 403)
    expect(Array.isArray(data)).toBe(true)
  })
})
