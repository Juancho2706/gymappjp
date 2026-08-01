import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Gate (mutation:true) resuelve el token via admin.auth.getUser + valida workspace.
const adminGetUser = vi.fn()
const adminMaybeSingle = vi.fn()
const fakeAdmin = {
  auth: { getUser: (...a: unknown[]) => adminGetUser(...a) },
  from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => adminMaybeSingle(table) }) }),
  }),
}
vi.mock('@/lib/supabase/admin-client', () => ({
  createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mobile-auth')>()),
  verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

const resolveNutritionDomainEnabled = vi.fn()
vi.mock('@/services/feature-prefs.service', () => ({
  resolveNutritionDomainEnabled: (...a: unknown[]) => resolveNutritionDomainEnabled(...a),
}))

const userRpc = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: userRpc })),
}))

let intakeAllowed = true
const rateLimitNutritionIntake = vi.fn(async (..._a: unknown[]) =>
  intakeAllowed ? { ok: true as const } : { ok: false as const, retryAfter: 30 },
)
vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionIntake: (...a: unknown[]) => rateLimitNutritionIntake(...a),
  jsonRateLimited: (retryAfter: number) =>
    new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    }),
}))

import { POST } from './route'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const FOOD_ID = '44444444-4444-4444-8444-444444444444'
const NEW_ID = '55555555-5555-4555-8555-555555555555'
const ENTRY_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'

const PERMISSIONS_RPC = 'get_nutrition_student_permissions_v2'

type PermissionsFixture = {
  permissions?: Record<string, unknown>
  prescribed?: { quantity: number | null; unit: string | null; mealSlot: string | null } | null
}
let permissionsFixture: PermissionsFixture = {}

/** Llamadas al RPC SIN la de permisos (que corre en toda escritura del alumno). */
function mutationCalls() {
  return userRpc.mock.calls.filter(([name]) => name !== PERMISSIONS_RPC)
}

function req(body: unknown = { action: 'record', payload: {} }) {
  return new NextRequest('http://localhost/api/mobile/nutrition-v2/intake', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function recordPayload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    localDate: '2026-07-15',
    occurredAt: '2026-07-15T12:00:00.000Z',
    timezone: 'America/Santiago',
    foodId: FOOD_ID,
    customName: null,
    quantity: 100,
    unit: 'g',
    mealSlot: 'lunch',
    source: 'offplan',
    captureMethod: 'search',
    planVersionId: null,
    prescriptionItemId: null,
    idempotencyKey: 'intake-abcdefgh12',
    note: null,
    snapshot: {
      name: 'Pollo',
      brand: null,
      calories: 165,
      proteinG: 31,
      carbsG: 0,
      fatsG: 3.6,
      fiberG: null,
      servingSize: 100,
      servingUnit: 'g',
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  intakeAllowed = true
  permissionsFixture = {}
  userRpc.mockImplementation(async (name: string) => {
    if (name === PERMISSIONS_RPC) {
      return {
        data: {
          permissions: permissionsFixture.permissions ?? {},
          prescribed: permissionsFixture.prescribed ?? null,
        },
        error: null,
      }
    }
    return { data: NEW_ID, error: null }
  })
  adminGetUser.mockResolvedValue({ data: { user: { id: CLIENT_ID } }, error: null })
  adminMaybeSingle.mockImplementation((table: string) =>
    table === 'clients'
      ? {
          data: { id: CLIENT_ID, coach_id: 'coach-1', team_id: null, org_id: null, is_archived: false, is_active: true },
          error: null,
        }
      : { data: null, error: null },
  )
  resolveNutritionDomainEnabled.mockResolvedValue(true)
})

describe('POST /api/mobile/nutrition-v2/intake · rate limit', () => {
  it('404 cuando el master switch de nutrición del alumno está apagado', async () => {
    resolveNutritionDomainEnabled.mockResolvedValue(false)
    const res = await POST(req())
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('NUTRITION_DOMAIN_DISABLED')
    expect(rateLimitNutritionIntake).not.toHaveBeenCalled()
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('429 cuando el limitador de registro niega, sin tocar la RPC ni leer el body', async () => {
    intakeAllowed = false
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(rateLimitNutritionIntake).toHaveBeenCalledWith(CLIENT_ID)
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('deja pasar cuando el limitador permite (llega a parsear la accion)', async () => {
    intakeAllowed = true
    const res = await POST(req())
    // Payload vacio => 400 INVALID_PAYLOAD, pero NUNCA 429: el limitador permitio.
    expect(res.status).not.toBe(429)
    expect(rateLimitNutritionIntake).toHaveBeenCalledWith(CLIENT_ID)
  })
})

/**
 * NUT-009 — ESPEJO del guard de la server action web.
 *
 * La asimetria entre web y movil fue exactamente lo que dejo el permiso sin efecto: el gateway
 * movil no tenia NINGUNA lectura de `student_permissions` (grep de `permission|canRegister` sobre
 * apps/web/src/app/api/mobile/nutrition-v2/: cero coincidencias). Estos casos fijan que la API
 * aplique la misma regla que la web, para que la brecha no se reabra por un solo lado.
 */
describe('POST /api/mobile/nutrition-v2/intake · permisos del plan', () => {
  it('canRegisterFreely=false rechaza el registro LIBRE con 403 y codigo propio', async () => {
    permissionsFixture = { permissions: { canRegisterFreely: false } }
    const res = await POST(req({ action: 'record', payload: recordPayload() }))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('PLAN_PERMISSION_DENIED')
    // 403 NO es reintentable para la cola offline (isRetryable): la mutacion se descarta en vez
    // de gastar 8 intentos contra una regla del coach.
    expect(mutationCalls()).toHaveLength(0)
  })

  it('canRegisterFreely=false NO bloquea el "Lo comi" de un item prescrito', async () => {
    permissionsFixture = {
      permissions: { canRegisterFreely: false },
      prescribed: { quantity: 100, unit: 'g', mealSlot: 'lunch' },
    }
    const res = await POST(
      req({
        action: 'record',
        payload: recordPayload({
          source: 'prescription',
          captureMethod: 'prescription',
          prescriptionItemId: ITEM_ID,
        }),
      }),
    )

    expect(res.status).toBe(201)
    expect(mutationCalls()).toHaveLength(1)
    expect(mutationCalls()[0][0]).toBe('record_nutrition_intake_v2')
  })

  it('un plan legado (snapshot {}) sigue registrando libre: el merge de defaults es permisivo', async () => {
    permissionsFixture = { permissions: {} }
    const res = await POST(req({ action: 'record', payload: recordPayload() }))

    expect(res.status).toBe(201)
    expect(mutationCalls()).toHaveLength(1)
  })

  it('quantityAdjustmentPercent acota la correccion de un item prescrito', async () => {
    permissionsFixture = {
      permissions: { canAdjustPrescribedQuantity: true, quantityAdjustmentPercent: 10 },
      prescribed: { quantity: 100, unit: 'g', mealSlot: 'lunch' },
    }
    const correction = (quantity: number) => ({
      action: 'correct',
      payload: recordPayload({
        quantity,
        prescriptionItemId: ITEM_ID,
        correctsEntryId: ENTRY_ID,
        correctionReason: 'ajuste de cantidad',
      }),
    })

    const inRange = await POST(req(correction(105)))
    expect(inRange.status).toBe(200)

    vi.clearAllMocks()
    const outOfRange = await POST(req(correction(150)))
    expect(outOfRange.status).toBe(403)
    expect((await outOfRange.json()).code).toBe('PLAN_PERMISSION_DENIED')
    expect(mutationCalls()).toHaveLength(0)
  })

  it('mapea nutrition_v2_permission_denied del RPC a 403 con codigo propio (no el crudo 42501)', async () => {
    userRpc.mockImplementation(async (name: string) => {
      if (name === PERMISSIONS_RPC) return { data: { permissions: {}, prescribed: null }, error: null }
      return {
        data: null,
        error: { message: 'nutrition_v2_permission_denied:free_registration', code: '42501' },
      }
    })
    const res = await POST(req({ action: 'record', payload: recordPayload() }))

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('PLAN_PERMISSION_DENIED')
  })
})

/** NUT-010 — retiro TERMINAL por el gateway movil. */
describe('POST /api/mobile/nutrition-v2/intake · action void', () => {
  it('llama void_nutrition_intake_v2 con el payload minimo', async () => {
    const res = await POST(
      req({
        action: 'void',
        payload: { clientId: CLIENT_ID, entryId: ENTRY_ID, reason: 'lo registre por error' },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, id: NEW_ID, action: 'void' })
    expect(mutationCalls()).toHaveLength(1)
    expect(mutationCalls()[0][0]).toBe('void_nutrition_intake_v2')
    expect(mutationCalls()[0][1]).toEqual({
      p_client_id: CLIENT_ID,
      p_entry_id: ENTRY_ID,
      p_reason: 'lo registre por error',
      p_idempotency_key: null,
    })
  })

  it('el retiro no consulta permisos: retirar lo propio siempre se puede', async () => {
    permissionsFixture = { permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: false } }
    const res = await POST(
      req({
        action: 'void',
        payload: { clientId: CLIENT_ID, entryId: ENTRY_ID, reason: 'lo registre por error' },
      }),
    )

    expect(res.status).toBe(200)
    expect(userRpc).not.toHaveBeenCalledWith(PERMISSIONS_RPC, expect.anything())
  })

  it('rechaza un retiro de otro alumno con 403 CLIENT_SCOPE_MISMATCH', async () => {
    const res = await POST(
      req({
        action: 'void',
        payload: {
          clientId: '11111111-1111-4111-8111-111111111111',
          entryId: ENTRY_ID,
          reason: 'no es mio',
        },
      }),
    )

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_SCOPE_MISMATCH')
    expect(userRpc).not.toHaveBeenCalled()
  })

  it('el camino correct_ sigue vivo para drenar retiros encolados con el payload viejo', async () => {
    const res = await POST(
      req({
        action: 'correct',
        payload: recordPayload({
          source: 'manual',
          captureMethod: 'manual',
          note: 'Registro retirado',
          correctsEntryId: ENTRY_ID,
          correctionReason: 'lo registre por error',
          idempotencyKey: 'void-abcdefgh12',
          snapshot: { name: 'Pollo', calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 },
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(mutationCalls()[0][0]).toBe('correct_nutrition_intake_v2')
  })
})
