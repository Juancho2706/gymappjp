// NUT-005 — el endpoint de escrituras del coach movil es la barrera que RN no tenia:
// pertenencia al workspace y entitlement "Nutricion Pro" se re-validan SERVER-SIDE, y la
// persistencia corre con el cliente RLS del propio coach (nunca service_role).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

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
// `from` existe porque las acciones que escriben tablas (archive, createFood) usan el cliente RLS
// del propio coach: si un test lo llama sin declarar implementacion, el fallo es explicito.
const userFrom = vi.fn()
const userClient = { rpc: userRpc, from: (...a: unknown[]) => userFrom(...a) }
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => userClient),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionCoachWrite: vi.fn(async () => ({ ok: true })),
  jsonRateLimited: vi.fn(),
}))

const hasNutritionProV2 = vi.fn()
vi.mock('@/app/coach/nutrition-v2/_lib/nutrition-pro', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, hasNutritionProV2: (...a: unknown[]) => hasNutritionProV2(...a) }
})

const persistAndPublishDraft = vi.fn()
const resolveActiveClientPlanId = vi.fn()
// Mock PARCIAL: solo se doblan las dos rutinas de persistencia. Los helpers puros de mapeo de
// errores (`mapWriteError`, `fail`, `zodFields`) quedan REALES porque `insertCoachFood` los usa y
// el 42501 -> SCOPE_DENIED es justamente lo que este archivo verifica.
vi.mock('@/app/coach/nutrition-v2/_actions/plan-persistence', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    persistAndPublishDraft: (...a: unknown[]) => persistAndPublishDraft(...a),
    resolveActiveClientPlanId: (...a: unknown[]) => resolveActiveClientPlanId(...a),
  }
})

const COACH = '99999999-9999-4999-8999-999999999999'
const CLIENT = '11111111-1111-4111-8111-111111111111'
const TEAM_ID = '22222222-2222-4222-8222-222222222222'
const PLAN_ROOT = '33333333-3333-4333-8333-333333333333'
const VERSION_ID = '44444444-4444-4444-8444-444444444444'

import { POST } from './route'

const SCOPE = { scopeType: 'standalone', teamId: null, orgId: null }

function draft(overrides: Record<string, unknown> = {}): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    planId: PLAN_ROOT,
    clientId: CLIENT,
    name: 'Plan',
    strategy: 'structured',
    timezone: 'America/Santiago',
    permissions: {},
    dayVariants: [
      {
        key: 'default',
        label: 'Todos los dias',
        default: true,
        targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60 },
        mealSlots: [
          { code: 'slot-1', name: 'Desayuno', startTime: '08:00', items: [{ customName: 'Avena', quantity: 80, unit: 'g' }] },
        ],
      },
    ],
    ...overrides,
  })
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/mobile/nutrition-v2/coach/mutate', {
    method: 'POST',
    headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function admin(rowsByTable: Record<string, unknown>) {
  adminMaybeSingle.mockImplementation((table: string) => ({ data: rowsByTable[table] ?? null, error: null }))
}

/**
 * Lectura de la VERSION BASE que hace `publish` para el carry-over de notas (el wizard no edita
 * ni `protocol_notes` ni `visible_notes`, y publicar reescribe la version completa).
 */
function mockBaseVersionRead(result: { data?: unknown; error?: { message: string; code?: string } }) {
  userFrom.mockImplementation((table: string) => {
    if (table !== 'nutrition_plan_versions_v2') throw new Error(`tabla inesperada en el publish: ${table}`)
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
    }
    return chain
  })
}

/** Fila base por defecto: mismo plan del draft, sin notas (el caso "no hay nada que reponer"). */
function baseVersionRow(over: Record<string, unknown> = {}) {
  return { id: VERSION_ID, plan_id: PLAN_ROOT, protocol_notes: null, visible_notes: null, ...over }
}

/** Draft con el que `persistAndPublishDraft` fue llamado (lo que REALMENTE se persiste). */
function persistedDraft(): NutritionPlanDraft {
  return (persistAndPublishDraft.mock.calls[0][0] as { draft: NutritionPlanDraft }).draft
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: COACH } }, error: null })
  admin({ coaches: { id: COACH }, clients: { id: CLIENT }, team_members: { id: 'tm' }, teams: { id: TEAM_ID } })
  hasNutritionProV2.mockResolvedValue(true)
  persistAndPublishDraft.mockResolvedValue({ ok: true, versionId: VERSION_ID, planId: PLAN_ROOT })
  mockBaseVersionRead({ data: baseVersionRow() })
})

describe('POST coach/mutate · workspace', () => {
  it('workspace ajeno (team sin membresía) => 403 sin persistir', async () => {
    admin({ coaches: { id: COACH }, teams: { id: TEAM_ID } })
    const res = await POST(
      req({
        action: 'publish',
        workspace: { scopeType: 'team', teamId: TEAM_ID, orgId: null },
        draft: draft(),
        idempotencyKey: 'publish:key:abcdef',
        effectiveFrom: '2026-07-28',
      }),
    )
    expect(res.status).toBe(403)
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('sesion invalida => 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    expect(res.status).toBe(401)
  })

  it('accion desconocida => 400', async () => {
    const res = await POST(req({ action: 'nope', workspace: SCOPE }))
    expect(res.status).toBe(400)
  })
})

describe('POST coach/mutate · publish', () => {
  it('persiste con el cliente RLS del usuario y devuelve la version publicada', async () => {
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28', expectedCurrentVersionId: VERSION_ID }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, versionId: VERSION_ID, planId: PLAN_ROOT })
    expect(persistAndPublishDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        db: userClient,
        userId: COACH,
        idempotencyKey: 'publish:key:abcdef',
        effectiveFrom: '2026-07-28',
        expectedCurrentVersionId: VERSION_ID,
      }),
    )
  })

  it('reintento con la MISMA clave: la idempotencia vive en el payload, no en el transporte', async () => {
    const payload = { action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }
    await POST(req(payload))
    await POST(req(payload))
    const keys = persistAndPublishDraft.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey)
    expect(keys).toEqual(['publish:key:abcdef', 'publish:key:abcdef'])
  })

  it('sin addon Pro un draft hibrido => 403 UPGRADE_REQUIRED sin escribir', async () => {
    hasNutritionProV2.mockResolvedValue(false)
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft({ strategy: 'hybrid' }), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('UPGRADE_REQUIRED')
    expect(body.feature).toBe('hybrid_strategy')
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('sin addon Pro un draft BASE publica igual (la frontera es por capacidad)', async () => {
    hasNutritionProV2.mockResolvedValue(false)
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: draft(), idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    expect(res.status).toBe(200)
    expect(persistAndPublishDraft).toHaveBeenCalledTimes(1)
  })

  it('draft invalido => 400 INVALID_PAYLOAD', async () => {
    const res = await POST(req({ action: 'publish', workspace: SCOPE, draft: { nope: true }, idempotencyKey: 'publish:key:abcdef', effectiveFrom: '2026-07-28' }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('INVALID_PAYLOAD')
  })
})

// PERDIDA DE DATOS (P0): republicar desde el asistente RN reescribe la version COMPLETA. Las notas
// visibles (edicion rapida) y el protocolo profesional no se editan en el wizard, asi que sin
// carry-over cada "Rehacer con el asistente" + Publicar las borraba en silencio.
describe('POST coach/mutate · publish · carry-over de notas', () => {
  const base = (over: Record<string, unknown> = {}) => ({
    action: 'publish',
    workspace: SCOPE,
    idempotencyKey: 'publish:key:abcdef',
    effectiveFrom: '2026-07-28',
    expectedCurrentVersionId: VERSION_ID,
    ...over,
  })

  it('un binario RN sin carry-over (draft sin notas) NO borra las del alumno: se reponen de la base', async () => {
    mockBaseVersionRead({ data: baseVersionRow({ visible_notes: 'Toma 2L de agua', protocol_notes: 'Protocolo cetogenico' }) })
    const res = await POST(req(base({ draft: draft() })))
    expect(res.status).toBe(200)
    expect(persistedDraft().visibleNotes).toBe('Toma 2L de agua')
    expect(persistedDraft().protocolNotes).toBe('Protocolo cetogenico')
  })

  it('las notas visibles del draft MANDAN sobre la base (el wizard ya las rehidrato)', async () => {
    mockBaseVersionRead({ data: baseVersionRow({ visible_notes: 'Viejas' }) })
    const res = await POST(req(base({ draft: draft({ visibleNotes: 'Las que el coach vio en pantalla' }) })))
    expect(res.status).toBe(200)
    expect(persistedDraft().visibleNotes).toBe('Las que el coach vio en pantalla')
  })

  it('el protocolo repuesto NO dispara el gate Pro de un coach base (grandfathering por construccion)', async () => {
    hasNutritionProV2.mockResolvedValue(false)
    mockBaseVersionRead({ data: baseVersionRow({ protocol_notes: 'Protocolo ya publicado' }) })
    const res = await POST(req(base({ draft: draft() })))
    expect(res.status).toBe(200)
    expect(persistedDraft().protocolNotes).toBe('Protocolo ya publicado')
  })

  it('una version base de OTRO plan no contamina el draft (anti-confusion de ids)', async () => {
    mockBaseVersionRead({ data: baseVersionRow({ plan_id: '77777777-7777-4777-8777-777777777777', visible_notes: 'De otro alumno' }) })
    const res = await POST(req(base({ draft: draft() })))
    expect(res.status).toBe(200)
    expect(persistedDraft().visibleNotes).toBeNull()
    expect(persistedDraft().protocolNotes).toBeNull()
  })

  it('sin poder leer la version base NO publica (fail-closed: nunca a ciegas sobre las notas)', async () => {
    mockBaseVersionRead({ error: { message: 'denied', code: '42501' } })
    const res = await POST(req(base({ draft: draft() })))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('SCOPE_DENIED')
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('plan NUEVO (sin version base) publica sin leer notas de ninguna parte', async () => {
    const res = await POST(
      req({
        action: 'publish',
        workspace: SCOPE,
        draft: draft({ planId: undefined }),
        idempotencyKey: 'publish:key:abcdef',
        effectiveFrom: '2026-07-28',
      }),
    )
    expect(res.status).toBe(200)
    expect(userFrom).not.toHaveBeenCalled()
    expect(persistedDraft().visibleNotes).toBeNull()
  })
})

describe('POST coach/mutate · assign', () => {
  it('relee la FUENTE con la RPC scoped antes de copiar nada (NUT-012)', async () => {
    userRpc.mockResolvedValue({ data: null, error: null })
    await POST(
      req({
        action: 'assign',
        workspace: SCOPE,
        sourceClientId: CLIENT,
        expectedVersionId: VERSION_ID,
        targetClientIds: ['66666666-6666-4666-8666-666666666666'],
        effectiveFrom: '2026-07-28',
        operationId: 'assign-op-123456',
      }),
    )
    expect(userRpc).toHaveBeenCalledWith(
      'get_nutrition_client_detail_scoped_v2',
      expect.objectContaining({ p_client_id: CLIENT, p_scope_type: 'standalone' }),
    )
  })

  it('si la fuente no se puede releer NO copia nada (fail-closed, sin plan viejo propagado)', async () => {
    userRpc.mockResolvedValue({ data: null, error: { message: 'denied', code: '42501' } })
    const res = await POST(
      req({
        action: 'assign',
        workspace: SCOPE,
        sourceClientId: CLIENT,
        expectedVersionId: VERSION_ID,
        targetClientIds: ['66666666-6666-4666-8666-666666666666'],
        effectiveFrom: '2026-07-28',
        operationId: 'assign-op-123456',
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('SCOPE_DENIED')
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('seleccion invalida (la fuente entre los destinos) => 400 sin releer ni escribir', async () => {
    const res = await POST(
      req({
        action: 'assign',
        workspace: SCOPE,
        sourceClientId: CLIENT,
        expectedVersionId: VERSION_ID,
        targetClientIds: [CLIENT],
        effectiveFrom: '2026-07-28',
        operationId: 'assign-op-123456',
      }),
    )
    expect(res.status).toBe(400)
    expect(userRpc).not.toHaveBeenCalled()
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })
})

describe('POST coach/mutate · archive', () => {
  it('valida los ids y no escribe con un payload malformado', async () => {
    const res = await POST(req({ action: 'archive', workspace: SCOPE, clientId: 'no-uuid', planId: PLAN_ROOT }))
    expect(res.status).toBe(400)
  })
})

// NUT-005 — el alta de alimento coach-scoped del builder RN era el ULTIMO write del coach movil
// fuera de este endpoint (`createCoachFoodV2` insertaba directo en `foods`). Ahora comparte gate y
// reusa `insertCoachFood`, el MISMO insert de la server action web.
describe('POST coach/mutate · createFood', () => {
  const FOOD = {
    action: 'createFood',
    workspace: SCOPE,
    clientId: CLIENT,
    name: 'Salsa casera',
    brand: null,
    unit: 'g',
    calories: 120,
    proteinG: 3,
    carbsG: 10,
    fatsG: 8,
  }

  beforeEach(() => {
    userFrom.mockReset()
  })

  it('inserta con el cliente RLS del coach y devuelve el alimento como BuilderFood', async () => {
    const single = vi.fn(async () => ({ data: { id: 'food-1' }, error: null }))
    const rows: Record<string, unknown>[] = []
    const insert = vi.fn((row: Record<string, unknown>) => {
      rows.push(row)
      return { select: () => ({ single }) }
    })
    userFrom.mockImplementation(() => ({ insert }))

    const res = await POST(req(FOOD))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.food).toMatchObject({ id: 'food-1', name: 'Salsa casera', servingSize: 100, servingUnit: 'g', category: 'otro' })
    expect(userFrom).toHaveBeenCalledWith('foods')
    const row = rows[0]
    expect(row).toMatchObject({
      coach_id: COACH,
      org_id: null,
      serving_size: 100,
      serving_unit: 'g',
      is_liquid: false,
      catalog_source: 'coach',
      verification_status: 'coach_verified',
      protein_g: 3,
      carbs_g: 10,
      fats_g: 8,
    })
    // El sobre del transporte no debe filtrarse a la fila.
    expect(row.action).toBeUndefined()
    expect(row.workspace).toBeUndefined()
  })

  // F6.3 — el tab Alimentos de RN crea sin alumno en contexto. Este gate autoriza por workspace +
  // bearer y `insertCoachFood` nunca lee `clientId`, asi que el alta debe pasar igual.
  it('crea sin clientId (el tab Alimentos del movil no tiene alumno)', async () => {
    const single = vi.fn(async () => ({ data: { id: 'food-2' }, error: null }))
    const rows: Record<string, unknown>[] = []
    const insert = vi.fn((row: Record<string, unknown>) => {
      rows.push(row)
      return { select: () => ({ single }) }
    })
    userFrom.mockImplementation(() => ({ insert }))

    const sinCliente: Record<string, unknown> = { ...FOOD }
    delete sinCliente.clientId
    const res = await POST(req(sinCliente))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.food).toMatchObject({ id: 'food-2', name: 'Salsa casera' })
    expect(userFrom).toHaveBeenCalledWith('foods')
    expect(rows[0]).toMatchObject({ coach_id: COACH, catalog_source: 'coach' })
    expect(rows[0].client_id).toBeUndefined()
  })

  it('campos invalidos (nombre vacio, macros negativas) => 400 INVALID_PAYLOAD sin tocar la BD', async () => {
    const vacio = await POST(req({ ...FOOD, name: '   ' }))
    expect(vacio.status).toBe(400)
    expect((await vacio.json()).code).toBe('INVALID_PAYLOAD')

    const negativo = await POST(req({ ...FOOD, proteinG: -1 }))
    expect(negativo.status).toBe(400)

    const sinCliente = await POST(req({ ...FOOD, clientId: 'no-uuid' }))
    expect(sinCliente.status).toBe(400)

    const unidad = await POST(req({ ...FOOD, unit: 'un' }))
    expect(unidad.status).toBe(400)

    expect(userFrom).not.toHaveBeenCalled()
  })

  it('42501 de la RLS => 403 SCOPE_DENIED (la RLS sigue siendo la barrera de tenencia)', async () => {
    const single = vi.fn(async () => ({ data: null, error: { message: 'denied', code: '42501' } }))
    userFrom.mockImplementation(() => ({ insert: () => ({ select: () => ({ single }) }) }))
    const res = await POST(req(FOOD))
    const body = await res.json()
    expect(res.status).toBe(403)
    expect(body.code).toBe('SCOPE_DENIED')
  })
})

// T2.3 F6.4 — clasificar un alimento PROPIO ya existente desde el tab Alimentos de RN. El alta ya
// podia traer la equivalencia (`createFood`); esto es el camino de UPDATE, y usa la MISMA funcion
// de servicio que la server action web (`setOwnFoodExchangeEquivalence`).
describe('POST coach/mutate · setFoodEquivalence', () => {
  const FOOD_ID = '55555555-5555-4555-8555-555555555555'
  const GROUP_ID = '88888888-8888-4888-8888-888888888888'
  const EQUIV = {
    action: 'setFoodEquivalence',
    workspace: SCOPE,
    foodId: FOOD_ID,
    exchangeGroupId: GROUP_ID,
    exchangePortionGrams: 120,
    exchangePortionLabel: '1 taza',
  }

  /**
   * Espeja las TRES tablas que toca el servicio con el cliente RLS del coach: `exchange_groups`
   * (el grupo debe ser visible antes de escribir un id client-controlled), `foods` (UPDATE del
   * trio `exchange_*`) y `exchange_group_foods` (doble escritura de la fila de MI lista).
   */
  function mockEquivalenceDb(options: {
    groupVisible?: boolean
    food?: { data?: unknown; error?: { message: string; code?: string } }
  } = {}) {
    const calls = {
      foodUpdates: [] as Record<string, unknown>[],
      listInserts: [] as Record<string, unknown>[],
      listDeletes: 0,
    }
    const groups = options.groupVisible === false ? [] : [{ id: GROUP_ID }]
    const food = options.food ?? { data: { id: FOOD_ID }, error: null }

    userFrom.mockImplementation((table: string) => {
      if (table === 'exchange_groups') {
        // `.is('deleted_at', null)` cierra la consulta de visibilidad.
        const chain: Record<string, unknown> = {
          select: () => chain,
          in: () => chain,
          is: async () => ({ data: groups, error: null }),
        }
        return chain
      }
      if (table === 'foods') {
        const chain: Record<string, unknown> = {
          update: (row: Record<string, unknown>) => {
            calls.foodUpdates.push(row)
            return chain
          },
          eq: () => chain,
          select: () => chain,
          maybeSingle: async () => ({ data: food.data ?? null, error: food.error ?? null }),
        }
        return chain
      }
      if (table === 'exchange_group_foods') {
        // El delete se cierra con `await query` (sin `maybeSingle`), de ahi el thenable.
        const chain: Record<string, unknown> = {
          delete: () => {
            calls.listDeletes += 1
            return chain
          },
          insert: (row: Record<string, unknown>) => {
            calls.listInserts.push(row)
            return chain
          },
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          // Antes del insert no hay fila propia (alta); despues devuelve la recien escrita.
          maybeSingle: async () => ({
            data: calls.listInserts.length > 0 ? { id: 'list-row-1' } : null,
            error: null,
          }),
          then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: null }),
        }
        return chain
      }
      throw new Error(`tabla inesperada en setFoodEquivalence: ${table}`)
    })
    return calls
  }

  beforeEach(() => {
    userFrom.mockReset()
  })

  it('escribe el trio en el alimento propio y sincroniza la fila de MI lista', async () => {
    const calls = mockEquivalenceDb()
    const res = await POST(req(EQUIV))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.foodUpdates[0]).toEqual({
      exchange_group_id: GROUP_ID,
      exchange_portion_grams: 120,
      exchange_portion_label: '1 taza',
    })
    // Reclasificar borra mis filas viejas de ESE alimento antes de escribir la nueva.
    expect(calls.listDeletes).toBe(1)
    expect(calls.listInserts[0]).toMatchObject({
      exchange_group_id: GROUP_ID,
      food_id: FOOD_ID,
      coach_id: COACH,
      org_id: null,
      portion_grams: 120,
      portion_label: '1 taza',
      is_excluded: false,
    })
  })

  it('grupo sin gramos => 400 INVALID_PAYLOAD sin tocar la BD (regla junto-o-nada)', async () => {
    const res = await POST(req({ ...EQUIV, exchangePortionGrams: null }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_PAYLOAD')
    expect(userFrom).not.toHaveBeenCalled()
  })

  it('limpiar la clasificacion (sin grupo) escribe los 3 NULL y no deja fila en la lista', async () => {
    const calls = mockEquivalenceDb()
    const res = await POST(
      req({ ...EQUIV, exchangeGroupId: null, exchangePortionGrams: null, exchangePortionLabel: null }),
    )
    expect(res.status).toBe(200)
    expect(calls.foodUpdates[0]).toEqual({
      exchange_group_id: null,
      exchange_portion_grams: null,
      exchange_portion_label: null,
    })
    // Sin grupo no hay nada que verificar ni que insertar: solo se retira mi fila vieja.
    expect(userFrom).not.toHaveBeenCalledWith('exchange_groups')
    expect(calls.listDeletes).toBe(1)
    expect(calls.listInserts).toHaveLength(0)
  })
})
