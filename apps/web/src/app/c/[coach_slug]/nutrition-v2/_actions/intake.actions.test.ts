import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, getUser, getScope, isEnabled, revalidate, rateIntake, rateSearch } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  getScope: vi.fn(),
  isEnabled: vi.fn(),
  revalidate: vi.fn(),
  rateIntake: vi.fn(),
  rateSearch: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidate }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ rpc })) }))
vi.mock('../../nutrition/_data/nutrition-auth.queries', () => ({ getClientNutritionUser: getUser }))
vi.mock('../../nutrition/_data/client-scope.queries', () => ({ getClientScope: getScope }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: isEnabled }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionIntake: rateIntake,
  rateLimitNutritionCatalogSearch: rateSearch,
}))

import {
  closeDayAction,
  correctIntakeAction,
  recordIntakeAction,
  searchFoodCatalogAction,
  voidIntakeAction,
} from './intake.actions'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const FOOD_ID = '44444444-4444-4444-8444-444444444444'
const NEW_ID = '55555555-5555-4555-8555-555555555555'
const ENTRY_ID = '66666666-6666-4666-8666-666666666666'
const REVALIDATE = '/c/josefit/nutrition-v2'

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

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ user: { id: CLIENT_ID }, hasClientRow: true })
  getScope.mockResolvedValue({ coachId: null, teamId: null, orgId: null })
  isEnabled.mockResolvedValue(true)
  rpc.mockResolvedValue({ data: NEW_ID, error: null })
  rateIntake.mockResolvedValue({ ok: true })
  rateSearch.mockResolvedValue({ ok: true })
})

describe('recordIntakeAction', () => {
  it('construye los args del RPC record y revalida al exito', async () => {
    const res = await recordIntakeAction({ payload: basePayload(), revalidatePath: REVALIDATE })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(rpc).toHaveBeenCalledTimes(1)
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
    expect(revalidate).toHaveBeenCalledWith(REVALIDATE)
  })

  it('rechaza payload invalido (cantidad no positiva) sin tocar el RPC', async () => {
    const bad = { ...basePayload(), quantity: -5 }
    const res = await recordIntakeAction({ payload: bad, revalidatePath: REVALIDATE })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('rechaza revalidatePath fuera del scope del alumno', async () => {
    const res = await recordIntakeAction({ payload: basePayload(), revalidatePath: '/coach/dashboard' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('falla cerrado si el clientId no es el usuario autenticado', async () => {
    getUser.mockResolvedValue({ user: { id: 'someone-else' }, hasClientRow: true })
    const res = await recordIntakeAction({ payload: basePayload(), revalidatePath: REVALIDATE })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('CLIENT_SCOPE_MISMATCH')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('falla cerrado si el gate de rollout esta apagado', async () => {
    isEnabled.mockResolvedValue(false)
    const res = await recordIntakeAction({ payload: basePayload(), revalidatePath: REVALIDATE })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('ROLLOUT_DISABLED')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('mapea el 42501 del RPC a SCOPE_DENIED sin revalidar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'denied', code: '42501' } })
    const res = await recordIntakeAction({ payload: basePayload(), revalidatePath: REVALIDATE })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('SCOPE_DENIED')
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('rechaza un source fuera del contrato con INVALID_PAYLOAD sin tocar el RPC', async () => {
    // Regresion (perdida silenciosa QA): un source invalido debe ser un fallo HONESTO con shape
    // { ok:false, code, error }, nunca un ok:true fantasma que la UI presente como guardado.
    const bad = { ...basePayload(), source: 'quien-sabe' }
    const res = await recordIntakeAction({ payload: bad, revalidatePath: REVALIDATE })

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
    const res = await recordIntakeAction({ payload: basePayload(), revalidatePath: REVALIDATE })

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
    const res = await correctIntakeAction({ payload, revalidatePath: REVALIDATE })

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
    const res = await correctIntakeAction({ payload, revalidatePath: REVALIDATE })
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('voidIntakeAction', () => {
  // "Retirar" = correccion de contribucion CERO via correct_nutrition_intake_v2
  // (paridad 1:1 con RN buildVoidIntakeCorrection); no existe un RPC de void dedicado.
  function voidPayload() {
    return {
      ...basePayload(),
      source: 'manual',
      captureMethod: 'manual',
      note: 'Registro retirado',
      snapshot: { ...basePayload().snapshot, calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 },
      correctsEntryId: ENTRY_ID,
      correctionReason: 'lo registre por error',
      idempotencyKey: 'void-abcdefgh12',
    }
  }

  it('retira via correct_nutrition_intake_v2 con macros en 0 y revalida', async () => {
    const res = await voidIntakeAction({ payload: voidPayload(), revalidatePath: REVALIDATE })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'correct_nutrition_intake_v2',
      expect.objectContaining({
        p_corrects_entry_id: ENTRY_ID,
        p_correction_reason: 'lo registre por error',
        p_client_id: CLIENT_ID,
        p_source: 'manual',
        p_capture_method: 'manual',
        p_idempotency_key: 'void-abcdefgh12',
        p_snapshot: expect.objectContaining({ calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 }),
      }),
    )
    expect(revalidate).toHaveBeenCalledWith(REVALIDATE)
  })

  it('rechaza correctsEntryId no-uuid sin tocar el RPC', async () => {
    const res = await voidIntakeAction({
      payload: { ...voidPayload(), correctsEntryId: 'nope' },
      revalidatePath: REVALIDATE,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('closeDayAction', () => {
  it('asegura el snapshot del dia via ensure_nutrition_day_snapshot_v2', async () => {
    const res = await closeDayAction({
      clientId: CLIENT_ID,
      localDate: '2026-07-15',
      timezone: 'America/Santiago',
      revalidatePath: REVALIDATE,
    })

    expect(res).toEqual({ ok: true, id: NEW_ID })
    expect(rpc).toHaveBeenCalledWith('ensure_nutrition_day_snapshot_v2', {
      p_client_id: CLIENT_ID,
      p_local_date: '2026-07-15',
      p_timezone: 'America/Santiago',
    })
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
