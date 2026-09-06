// W4.1 «Cantidades honestas»: el coach retira y corrige registros del día de su alumno desde
// móvil. Misma barrera que el resto de las escrituras del coach (NUT-005): workspace validado
// server-side, rate limit y persistencia con el cliente RLS del propio coach (nunca service_role),
// reusando EXACTAMENTE la implementación de la server action web.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const adminMaybeSingle = vi.fn()
const fakeAdmin = {
  auth: { getUser: (...a: unknown[]) => getUser(...a) },
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: () => adminMaybeSingle(table),
    }
    return chain
  },
}
vi.mock('@/lib/supabase/admin-client', () => ({
  createServiceRoleClient: vi.fn(() => fakeAdmin),
}))
vi.mock('@/lib/mobile-auth', () => ({
  verifyMobileBearer: vi.fn(async () => ({ ok: true, userId: COACH })),
  isBlockedClientRow: () => false,
}))

const userRpc = vi.fn()
const userMaybeSingle = vi.fn()
const userClient = {
  rpc: (...a: unknown[]) => userRpc(...a),
  from: (table: string) => {
    if (table !== 'nutrition_intake_entries') throw new Error(`tabla inesperada: ${table}`)
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => userMaybeSingle(),
    }
    return chain
  },
}
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => userClient) }))

vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionCoachWrite: vi.fn(async () => ({ ok: true })),
  jsonRateLimited: vi.fn(),
}))

const COACH = '99999999-9999-4999-8999-999999999999'
const CLIENT = '11111111-1111-4111-8111-111111111111'
const TEAM_ID = '22222222-2222-4222-8222-222222222222'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const NEW_ENTRY_ID = '55555555-5555-4555-8555-555555555555'

import { POST } from './route'

const SCOPE = { scopeType: 'standalone', teamId: null, orgId: null }

const ENTRY_ROW = {
  id: ENTRY_ID,
  client_id: CLIENT,
  log_date: '2026-09-06',
  food_id: '77777777-7777-4777-8777-777777777777',
  custom_name: null,
  quantity: 60,
  unit: 'un',
  occurred_at: '2026-09-06T16:04:00.000Z',
  timezone: 'America/Santiago',
  note: null,
  entry_status: 'active',
  meal_slot_v2: 'lunch',
  intake_source_v2: 'prescription',
  capture_method_v2: 'prescription',
  snapshot_name: 'Pan pita',
  snapshot_brand: null,
  snapshot_calories: 159.6,
  snapshot_protein_g: 5.4,
  snapshot_carbs_g: 33,
  snapshot_fats_g: 0.7,
  snapshot_fiber_g: null,
  snapshot_serving_size: 100,
  snapshot_serving_unit: 'g',
  snapshot_macros_basis: 'per_serving',
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/mobile/nutrition-v2/coach/intake', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function admin(rowsByTable: Record<string, unknown>) {
  adminMaybeSingle.mockImplementation((table: string) => ({ data: rowsByTable[table] ?? null, error: null }))
}

function rpcCall(name: string): Record<string, unknown> {
  const call = userRpc.mock.calls.find(([called]) => called === name)
  if (!call) throw new Error(`no se llamó a ${name}`)
  return call[1] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: COACH } }, error: null })
  admin({ coaches: { id: COACH }, clients: { id: CLIENT }, team_members: { id: 'tm' }, teams: { id: TEAM_ID } })
  userMaybeSingle.mockResolvedValue({ data: ENTRY_ROW, error: null })
  userRpc.mockImplementation((name: string) => ({
    data: name === 'void_nutrition_intake_v2' ? ENTRY_ID : NEW_ENTRY_ID,
    error: null,
  }))
})

describe('POST coach/intake · gate', () => {
  it('sesión inválida => 401 sin tocar la base', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    const res = await POST(req({ op: 'void', workspace: SCOPE, clientId: CLIENT, entryId: ENTRY_ID }))
    expect(res.status).toBe(401)
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('workspace ajeno (team sin membresía) => 403 sin escribir', async () => {
    admin({ coaches: { id: COACH }, teams: { id: TEAM_ID } })
    const res = await POST(
      req({
        op: 'void',
        workspace: { scopeType: 'team', teamId: TEAM_ID, orgId: null },
        clientId: CLIENT,
        entryId: ENTRY_ID,
      }),
    )
    expect(res.status).toBe(403)
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('operación desconocida => 400', async () => {
    const res = await POST(req({ op: 'nope', workspace: SCOPE, clientId: CLIENT, entryId: ENTRY_ID }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_PAYLOAD')
  })

  it('cantidad inválida => 400 sin escribir', async () => {
    const res = await POST(
      req({ op: 'correct-quantity', workspace: SCOPE, clientId: CLIENT, entryId: ENTRY_ID, quantity: 0 }),
    )
    expect(res.status).toBe(400)
    expect(userRpc).not.toHaveBeenCalled()
  })
})

describe('POST coach/intake · void', () => {
  it('llama al RPC terminal con el cliente RLS del coach', async () => {
    const res = await POST(req({ op: 'void', workspace: SCOPE, clientId: CLIENT, entryId: ENTRY_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, id: ENTRY_ID, op: 'void' })
    expect(rpcCall('void_nutrition_intake_v2')).toMatchObject({
      p_client_id: CLIENT,
      p_entry_id: ENTRY_ID,
      p_reason: 'Registro retirado por el coach',
    })
  })

  it('42501 del RPC => 403 SCOPE_DENIED', async () => {
    userRpc.mockResolvedValue({ data: null, error: { message: 'nutrition_v2_void_scope_denied', code: '42501' } })
    const res = await POST(req({ op: 'void', workspace: SCOPE, clientId: CLIENT, entryId: ENTRY_ID }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('SCOPE_DENIED')
  })
})

describe('POST coach/intake · correct-quantity', () => {
  it('re-lee la fila y corrige SOLO la cantidad', async () => {
    const res = await POST(
      req({ op: 'correct-quantity', workspace: SCOPE, clientId: CLIENT, entryId: ENTRY_ID, quantity: 2 }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, id: NEW_ENTRY_ID, op: 'correct-quantity' })
    expect(rpcCall('correct_nutrition_intake_v2')).toMatchObject({
      p_corrects_entry_id: ENTRY_ID,
      p_client_id: CLIENT,
      p_quantity: 2,
      p_unit: 'un',
      p_meal_slot: 'lunch',
      p_plan_version_id: null,
      p_prescription_item_id: null,
    })
  })

  it('registro inexistente para ese alumno => 404 sin escribir', async () => {
    userMaybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(
      req({ op: 'correct-quantity', workspace: SCOPE, clientId: CLIENT, entryId: ENTRY_ID, quantity: 2 }),
    )
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('ENTRY_NOT_FOUND')
    expect(userRpc).not.toHaveBeenCalled()
  })
})
