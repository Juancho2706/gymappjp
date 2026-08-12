// T2.3 F6.4 — la lectura "donde esta clasificado HOY este alimento" que el tab Alimentos de RN
// necesita para abrir el formulario con el estado real. Coach-only y con el dueño derivado del
// ACTOR: el query string nunca es autoridad de identidad.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// GET => el gate verifica el bearer localmente (lectura, sin `mutation: true`).
const adminMaybeSingle = vi.fn()
const fakeAdmin = {
  auth: { getUser: vi.fn() },
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

// La lectura corre con el cliente RLS del propio coach (nunca service_role): solo `from`.
const userFrom = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (...a: unknown[]) => userFrom(...a) })),
}))

import { GET } from './route'

const COACH = '99999999-9999-4999-8999-999999999999'
const FOOD_ID = '55555555-5555-4555-8555-555555555555'
const GROUP_ID = '88888888-8888-4888-8888-888888888888'

function req(query: string) {
  return new NextRequest(`http://localhost/api/mobile/nutrition-v2/food-classification?${query}`, {
    headers: { authorization: 'Bearer tok' },
  })
}

/** Las dos fuentes que mezcla el read-model: el trio `foods.exchange_*` y MIS filas de lista. */
function mockClassificationDb(over: { food?: unknown; rows?: unknown[] } = {}) {
  const food =
    over.food === undefined
      ? {
          id: FOOD_ID,
          coach_id: COACH,
          exchange_group_id: GROUP_ID,
          // numeric de Postgres puede llegar como string: el servicio lo normaliza a number.
          exchange_portion_grams: '120',
          exchange_portion_label: '1 taza',
        }
      : over.food
  const rows = over.rows ?? [
    {
      id: 'list-row-1',
      exchange_group_id: GROUP_ID,
      food_id: FOOD_ID,
      coach_id: COACH,
      org_id: null,
      portion_grams: 120,
      portion_label: '1 taza',
      is_excluded: false,
      source: 'coach',
      foods: { name: 'Arroz', brand: null },
    },
  ]

  userFrom.mockImplementation((table: string) => {
    if (table === 'foods') {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: food, error: null }),
      }
      return chain
    }
    if (table === 'exchange_group_foods') {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: async () => ({ data: rows, error: null }),
      }
      return chain
    }
    throw new Error(`tabla inesperada: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMobileBearer.mockResolvedValue({ ok: true, userId: COACH })
  // El mismo usuario es coach Y (para el caso COACH_ONLY) alumno: la superficie la decide el
  // parametro, no la existencia de la fila.
  adminMaybeSingle.mockImplementation((table: string) =>
    table === 'coaches'
      ? { data: { id: COACH }, error: null }
      : {
          data: {
            id: COACH,
            coach_id: 'coach-1',
            team_id: null,
            org_id: null,
            is_archived: false,
            is_active: true,
          },
          error: null,
        },
  )
  resolveNutritionDomainEnabled.mockResolvedValue(true)
  mockClassificationDb()
})

describe('GET /api/mobile/nutrition-v2/food-classification', () => {
  it('devuelve el contrato completo: columnas del alimento + MIS filas vivas', async () => {
    const res = await GET(req(`foodId=${FOOD_ID}&surface=coach`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      classification: {
        ownedByActor: true,
        columns: { groupId: GROUP_ID, portionGrams: 120, portionLabel: '1 taza' },
        ownRows: [{ groupId: GROUP_ID, portionGrams: 120, portionLabel: '1 taza' }],
      },
    })
  })

  it('sin ?surface=coach => 403 COACH_ONLY sin leer nada (el alumno no clasifica)', async () => {
    const res = await GET(req(`foodId=${FOOD_ID}`))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('COACH_ONLY')
    expect(userFrom).not.toHaveBeenCalled()
  })

  it('foodId invalido => 400 INVALID_PAYLOAD sin tocar la BD', async () => {
    const res = await GET(req('foodId=no-uuid&surface=coach'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_PAYLOAD')
    expect(userFrom).not.toHaveBeenCalled()
  })
})
