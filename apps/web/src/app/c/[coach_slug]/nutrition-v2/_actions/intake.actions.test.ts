import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, getUser, getScope, domainEnabled, revalidate, rateIntake, rateSearch, requestHeaders } =
  vi.hoisted(() => ({
    rpc: vi.fn(),
    getUser: vi.fn(),
    getScope: vi.fn(),
    domainEnabled: vi.fn(),
    revalidate: vi.fn(),
    rateIntake: vi.fn(),
    rateSearch: vi.fn(),
    // Headers que inyecta el proxy en el request de la server action (NUT-006).
    requestHeaders: new Map<string, string>(),
  }))

vi.mock('next/cache', () => ({ revalidatePath: revalidate }))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (key: string) => requestHeaders.get(key) ?? null }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ rpc })) }))
vi.mock('@/services/auth/current-student-nutrition.service', () => ({
  getCurrentStudentNutritionSession: getUser,
  getCurrentStudentNutritionScope: getScope,
}))
vi.mock('@/services/feature-prefs.service', () => ({ resolveNutritionDomainEnabled: domainEnabled }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionIntake: rateIntake,
  rateLimitNutritionCatalogSearch: rateSearch,
}))

import {
  closeDayAction,
  correctIntakeAction,
  recordIntakeAction,
  recordSlotIntakeBatchAction,
  searchFoodCatalogAction,
  voidIntakeAction,
  voidSlotIntakeBatchAction,
} from './intake.actions'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const FOOD_ID = '44444444-4444-4444-8444-444444444444'
const NEW_ID = '55555555-5555-4555-8555-555555555555'
const ENTRY_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'

const PERMISSIONS_RPC = 'get_nutrition_student_permissions_v2'

/**
 * NUT-009: cada acción de escritura resuelve primero los permisos del día. El mock despacha por
 * nombre de RPC para que las aserciones sigan hablando SOLO de la mutación real.
 */
type PermissionsFixture = {
  permissions?: Record<string, unknown>
  prescribed?: { quantity: number | null; unit: string | null; mealSlot: string | null } | null
}
let permissionsFixture: PermissionsFixture = {}

function setPermissions(fixture: PermissionsFixture) {
  permissionsFixture = fixture
}

/** Llamadas al RPC SIN la de permisos (que corre en toda escritura). */
function mutationCalls() {
  return rpc.mock.calls.filter(([name]) => name !== PERMISSIONS_RPC)
}

function basePayload() {
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
  }
}

/** Simula el request tal como lo sirve el proxy para un alumno standalone `/c/<slug>`. */
function setStandaloneRequest() {
  requestHeaders.clear()
  requestHeaders.set('x-coach-slug', 'josefit')
}

/** Simula el request de un alumno de TEAM: el proxy setea `x-client-base-path` = `/t/<slug>`. */
function setTeamRequest(teamSlug = 'eva-team') {
  requestHeaders.clear()
  requestHeaders.set('x-client-base-path', `/t/${teamSlug}`)
  requestHeaders.set('x-coach-slug', 'josefit')
}

beforeEach(() => {
  vi.clearAllMocks()
  setStandaloneRequest()
  getUser.mockResolvedValue({ user: { id: CLIENT_ID }, hasClientRow: true })
  getScope.mockResolvedValue({ coachId: null, teamId: null, orgId: null })
  domainEnabled.mockResolvedValue(true)
  // Por defecto, plan LEGADO: snapshot `{}` => el merge de defaults lo deja permisivo.
  permissionsFixture = {}
  rpc.mockImplementation(async (name: string) => {
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
  rateIntake.mockResolvedValue({ ok: true })
  rateSearch.mockResolvedValue({ ok: true })
})

describe('recordIntakeAction', () => {
  it('construye los args del RPC record al exito y NO revalida (H11)', async () => {
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(mutationCalls()).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith(
      'record_nutrition_intake_v2',
      expect.objectContaining({
        p_client_id: CLIENT_ID,
        p_local_date: '2026-07-15',
        p_food_id: FOOD_ID,
        p_quantity: 100,
        p_unit: 'g',
        p_meal_slot: 'lunch',
        p_source: 'offplan',
        p_capture_method: 'search',
        p_idempotency_key: 'intake-abcdefgh12',
        p_snapshot: expect.objectContaining({ name: 'Pollo', calories: 165 }),
      }),
    )
    // H11: las mutaciones del alumno NO revalidan — el apply de un action revalidado colgaba el
    // router en Next 16.3.0 (tabs muertos tras marcar); la UI reconcilia con la action de lectura.
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('rechaza payload invalido (cantidad no positiva) sin tocar el RPC', async () => {
    const bad = { ...basePayload(), quantity: -5 }
    const res = await recordIntakeAction({ payload: bad })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('ignora un revalidatePath inyectado por el cliente (Zod lo strippea) y jamas revalida', async () => {
    // NUT-006 + H11: la ruta nunca vino del cliente y desde H11 estas mutaciones no revalidan
    // NADA — un input hostil no puede convertirse en una revalidacion arbitraria.
    const res = await recordIntakeAction({ payload: basePayload(), revalidatePath: '/coach/dashboard' })
    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('falla cerrado si el clientId no es el usuario autenticado', async () => {
    getUser.mockResolvedValue({ user: { id: 'someone-else' }, hasClientRow: true })
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('CLIENT_SCOPE_MISMATCH')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza Enterprise antes de consultar los RPC V2', async () => {
    getScope.mockResolvedValue({ coachId: null, teamId: null, orgId: '11111111-1111-4111-8111-111111111111' })
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('WORKSPACE_NOT_ALLOWED')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza escrituras si el master switch de nutrición está apagado', async () => {
    domainEnabled.mockResolvedValue(false)
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NUTRITION_DOMAIN_DISABLED')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('mapea el 42501 del RPC a SCOPE_DENIED sin revalidar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'denied', code: '42501' } })
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('SCOPE_DENIED')
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('rechaza un source fuera del contrato con INVALID_PAYLOAD sin tocar el RPC', async () => {
    // Regresion (perdida silenciosa QA): un source invalido debe ser un fallo HONESTO con shape
    // { ok:false, code, error }, nunca un ok:true fantasma que la UI presente como guardado.
    const bad = { ...basePayload(), source: 'quien-sabe' }
    const res = await recordIntakeAction({ payload: bad })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('INVALID_PAYLOAD')
      expect(typeof res.error).toBe('string')
      expect(res.error.length).toBeGreaterThan(0)
    }
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('el rate limit devuelve un error honesto (RATE_LIMITED) y NO escribe ni revalida', async () => {
    // La causa raiz de la perdida silenciosa: el ok:false del rate limit debe llegar como error
    // visible (shape correcto), no tragarse. El registro NUNCA se persiste en este caso.
    rateIntake.mockResolvedValue({ ok: false, retryAfter: 5 })
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('RATE_LIMITED')
      expect(typeof res.error).toBe('string')
      expect(res.error.length).toBeGreaterThan(0)
    }
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })
})

describe('correctIntakeAction', () => {
  it('construye los args de correccion (corrects_entry_id + reason + comunes)', async () => {
    const payload = {
      ...basePayload(),
      correctsEntryId: ENTRY_ID,
      correctionReason: 'comi un poco menos',
      quantity: 80,
    }
    const res = await correctIntakeAction({ payload })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(rpc).toHaveBeenCalledWith(
      'correct_nutrition_intake_v2',
      expect.objectContaining({
        p_corrects_entry_id: ENTRY_ID,
        p_correction_reason: 'comi un poco menos',
        p_client_id: CLIENT_ID,
        p_quantity: 80,
      }),
    )
  })

  it('rechaza motivo de correccion demasiado corto', async () => {
    const payload = { ...basePayload(), correctsEntryId: ENTRY_ID, correctionReason: 'x' }
    const res = await correctIntakeAction({ payload })
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('voidIntakeAction', () => {
  // NUT-010 (opcion A): "Retirar" es un RPC propio con estado TERMINAL. Payload MINIMO —
  // ya no viaja el snapshot en cero ni la cantidad, porque no se inserta ninguna entry.
  function voidPayload() {
    return {
      clientId: CLIENT_ID,
      entryId: ENTRY_ID,
      reason: 'lo registre por error',
      idempotencyKey: 'void-abcdefgh12',
    }
  }

  it('retira via void_nutrition_intake_v2 con el payload minimo, sin revalidar (H11)', async () => {
    const res = await voidIntakeAction({ payload: voidPayload() })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(mutationCalls()).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('void_nutrition_intake_v2', {
      p_client_id: CLIENT_ID,
      p_entry_id: ENTRY_ID,
      p_reason: 'lo registre por error',
      p_idempotency_key: 'void-abcdefgh12',
    })
    // Nunca mas por el camino de correccion: era el que dejaba el fantasma activo.
    expect(rpc).not.toHaveBeenCalledWith('correct_nutrition_intake_v2', expect.anything())
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('el retiro NO se gatea por permisos del plan (registro erroneo imborrable seria peor)', async () => {
    setPermissions({
      permissions: { canRegisterFreely: false, canAdjustPrescribedQuantity: false, canMoveMealSlot: false },
    })
    const res = await voidIntakeAction({ payload: voidPayload() })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(rpc).toHaveBeenCalledWith('void_nutrition_intake_v2', expect.anything())
  })

  it('rechaza entryId no-uuid sin tocar el RPC', async () => {
    const res = await voidIntakeAction({ payload: { ...voidPayload(), entryId: 'nope' } })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza un motivo demasiado corto sin tocar el RPC', async () => {
    const res = await voidIntakeAction({ payload: { ...voidPayload(), reason: 'x' } })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * NUT-009 — los permisos del coach por fin GOBIERNAN la escritura.
 *
 * Antes eran 100% decorativos (solo chips de texto en la card de reglas): un plan "Solo alimentos
 * prescritos" mostraba igual el boton "Registrar alimento" y el registro entraba sin objecion.
 */
describe('NUT-009 — permisos del plan en la escritura del alumno', () => {
  it('canRegisterFreely=false rechaza el registro LIBRE sin tocar el RPC de escritura', async () => {
    setPermissions({ permissions: { canRegisterFreely: false } })
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('PLAN_PERMISSION_DENIED')
    expect(mutationCalls()).toHaveLength(0)
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('canRegisterFreely=false NO bloquea el "Lo comi" de un item prescrito', async () => {
    setPermissions({
      permissions: { canRegisterFreely: false },
      prescribed: { quantity: 100, unit: 'g', mealSlot: 'lunch' },
    })
    const res = await recordIntakeAction({
      payload: { ...basePayload(), source: 'prescription', captureMethod: 'prescription', prescriptionItemId: ITEM_ID },
    })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(mutationCalls()).toHaveLength(1)
  })

  it('un plan legado (snapshot {}) sigue registrando libre: el merge de defaults es permisivo', async () => {
    setPermissions({ permissions: {} })
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(mutationCalls()).toHaveLength(1)
  })

  it('si no se pueden resolver los permisos, la escritura NO se bloquea (el RPC es la barrera)', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === PERMISSIONS_RPC) return { data: null, error: { message: 'function does not exist', code: '42883' } }
      return { data: NEW_ID, error: null }
    })
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(mutationCalls()).toHaveLength(1)
  })

  it('canMoveMealSlot=false rechaza mover un item del plan a otra franja', async () => {
    setPermissions({
      permissions: { canMoveMealSlot: false },
      prescribed: { quantity: 100, unit: 'g', mealSlot: 'dinner' },
    })
    const res = await recordIntakeAction({
      payload: { ...basePayload(), source: 'prescription', captureMethod: 'prescription', prescriptionItemId: ITEM_ID },
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('PLAN_PERMISSION_DENIED')
    expect(mutationCalls()).toHaveLength(0)
  })

  it('canAdjustPrescribedQuantity=false rechaza corregir la cantidad de un item prescrito', async () => {
    setPermissions({
      permissions: { canAdjustPrescribedQuantity: false },
      prescribed: { quantity: 100, unit: 'g', mealSlot: 'lunch' },
    })
    const res = await correctIntakeAction({
      payload: {
        ...basePayload(),
        prescriptionItemId: ITEM_ID,
        quantity: 80,
        correctsEntryId: ENTRY_ID,
        correctionReason: 'comi menos',
      },
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('PLAN_PERMISSION_DENIED')
    expect(mutationCalls()).toHaveLength(0)
  })

  it('canAdjustPrescribedQuantity=false NO bloquea corregir un alimento LIBRE ya registrado', async () => {
    setPermissions({ permissions: { canAdjustPrescribedQuantity: false } })
    const res = await correctIntakeAction({
      payload: {
        ...basePayload(),
        prescriptionItemId: null,
        quantity: 80,
        correctsEntryId: ENTRY_ID,
        correctionReason: 'comi menos',
      },
    })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(mutationCalls()).toHaveLength(1)
  })

  it('quantityAdjustmentPercent acota la desviacion contra lo PRESCRITO (105 pasa, 150 no)', async () => {
    setPermissions({
      permissions: { canAdjustPrescribedQuantity: true, quantityAdjustmentPercent: 10 },
      prescribed: { quantity: 100, unit: 'g', mealSlot: 'lunch' },
    })
    const base = {
      ...basePayload(),
      prescriptionItemId: ITEM_ID,
      correctsEntryId: ENTRY_ID,
      correctionReason: 'ajuste de cantidad',
    }

    const inRange = await correctIntakeAction({ payload: { ...base, quantity: 105 } })
    expect(inRange).toEqual({ ok: true, id: NEW_ID })

    vi.clearAllMocks()
    const outOfRange = await correctIntakeAction({ payload: { ...base, quantity: 150 } })
    expect(outOfRange.ok).toBe(false)
    if (!outOfRange.ok) expect(outOfRange.code).toBe('PLAN_PERMISSION_DENIED')
    expect(mutationCalls()).toHaveLength(0)
  })

  it('mapea nutrition_v2_permission_denied del RPC a un codigo propio (no SCOPE_DENIED)', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === PERMISSIONS_RPC) return { data: { permissions: {}, prescribed: null }, error: null }
      return {
        data: null,
        error: { message: 'nutrition_v2_permission_denied:free_registration', code: '42501' },
      }
    })
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('PLAN_PERMISSION_DENIED')
      expect(res.code).not.toBe('SCOPE_DENIED')
    }
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('el bulk-mark tampoco es puerta trasera del registro libre', async () => {
    setPermissions({ permissions: { canRegisterFreely: false } })
    const res = await recordSlotIntakeBatchAction({ payloads: [basePayload()] })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('PLAN_PERMISSION_DENIED')
    expect(mutationCalls()).toHaveLength(0)
  })
})

describe('closeDayAction', () => {
  it('asegura el snapshot del dia via ensure_nutrition_day_snapshot_v2', async () => {
    const res = await closeDayAction({
      clientId: CLIENT_ID,
      localDate: '2026-07-15',
      timezone: 'America/Santiago',
    })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(rpc).toHaveBeenCalledWith('ensure_nutrition_day_snapshot_v2', {
      p_client_id: CLIENT_ID,
      p_local_date: '2026-07-15',
      p_timezone: 'America/Santiago',
    })
  })
})

/**
 * NUT-006 — Team (`/t/<slug>`) escribia CERO: el schema exigia `revalidatePath` que empezara con
 * `/c/`, se parseaba ANTES del RPC y abortaba los 7 gestos de escritura del alumno de Team en web.
 * Desde H11 estas mutaciones ya no revalidan NADA (el apply de un action revalidado colgaba el
 * router), pero el invariante que este bloque protege sigue vivo: un alumno de Team ESCRIBE sin
 * `INVALID_PAYLOAD`, y ningun header/inyeccion produce una revalidacion.
 */
describe('NUT-006 — Team escribe; nada revalida (H11)', () => {
  it('un alumno de Team (/t/...) registra sin INVALID_PAYLOAD y sin revalidar', async () => {
    setTeamRequest()
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(mutationCalls()).toHaveLength(1)
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('un alumno de Team corrige y retira (correct_ y void_) sin INVALID_PAYLOAD', async () => {
    setTeamRequest()
    const correction = {
      ...basePayload(),
      correctsEntryId: ENTRY_ID,
      correctionReason: 'comi un poco menos',
      quantity: 80,
    }
    const corrected = await correctIntakeAction({ payload: correction })
    expect(corrected).toEqual({ ok: true, id: NEW_ID })

    const removed = await voidIntakeAction({
      payload: { clientId: CLIENT_ID, entryId: ENTRY_ID, reason: 'lo registre por error' },
    })
    expect(removed).toEqual({ ok: true, id: NEW_ID })
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('los batch de Team (bulk-mark y deshacer) escriben y tampoco revalidan', async () => {
    setTeamRequest()
    const recorded = await recordSlotIntakeBatchAction({ payloads: [basePayload()] })
    expect(recorded).toEqual({ ok: true, ids: [NEW_ID], failed: 0 })

    const undone = await voidSlotIntakeBatchAction({
      payloads: [{ clientId: CLIENT_ID, entryId: ENTRY_ID, reason: 'Deshacer registro de la comida' }],
    })
    expect(undone).toEqual({ ok: true, ids: [NEW_ID], failed: 0 })
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('un header con path traversal NO se usa como ruta de revalidacion', async () => {
    requestHeaders.clear()
    requestHeaders.set('x-client-base-path', '/c/otro-coach/../../admin')

    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('sin headers confiables la escritura entra igual y simplemente no revalida', async () => {
    requestHeaders.clear()
    const res = await recordIntakeAction({ payload: basePayload() })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(mutationCalls()).toHaveLength(1)
    expect(revalidate).not.toHaveBeenCalled()
  })
})

describe('searchFoodCatalogAction', () => {
  const EMPTY_SEARCH = {
    schemaVersion: 1,
    generatedAt: '2026-07-15T00:00:00.000Z',
    query: 'pollo',
    countryCode: 'CL',
    items: [],
    nextCursor: null,
    hasMore: false,
  }

  it('llama search_food_catalog_v2 con los params y devuelve el read model', async () => {
    rpc.mockResolvedValue({ data: EMPTY_SEARCH, error: null })
    const res = await searchFoodCatalogAction({ clientId: CLIENT_ID, query: 'pollo' })

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.result.items).toEqual([])
    expect(rpc).toHaveBeenCalledWith(
      'search_food_catalog_v2',
      expect.objectContaining({ p_query: 'pollo', p_country_code: 'CL', p_page_size: 25 }),
    )
  })

  it('rechaza clientId invalido', async () => {
    const res = await searchFoodCatalogAction({ clientId: 'nope', query: 'pollo' })
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
