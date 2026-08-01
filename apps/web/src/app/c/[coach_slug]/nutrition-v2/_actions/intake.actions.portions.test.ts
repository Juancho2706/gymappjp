import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNutritionPortionIntakeKey } from '@eva/nutrition-v2'

const { rpc, getUser, getScope, domainEnabled, revalidate, rateIntake, rateSearch } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  getScope: vi.fn(),
  domainEnabled: vi.fn(),
  revalidate: vi.fn(),
  rateIntake: vi.fn(),
  rateSearch: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidate }))
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

import { markPortionIntakeAction, undoPortionIntakeAction, type MarkPortionInput } from './intake.actions'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const NEW_ID = '55555555-5555-4555-8555-555555555555'
const ENTRY_ID = '66666666-6666-4666-8666-666666666666'
const DEVICE_ID = 'device-abc'

// Ref POR PORCIÓN del grupo C (cereales) — valores tipo INTA/UDD.
const REF = { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0.5 }

function markInput(overrides: Partial<MarkPortionInput> = {}): MarkPortionInput {
  return {
    clientId: CLIENT_ID,
    localDate: '2026-07-18',
    timezone: 'America/Santiago',
    slotCode: 'lunch',
    groupCode: 'C',
    groupName: 'Cereales',
    portions: 1,
    ordinal: 0,
    attempt: 1,
    deviceId: DEVICE_ID,
    ref: REF,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ user: { id: CLIENT_ID }, hasClientRow: true })
  getScope.mockResolvedValue({ coachId: null, teamId: null, orgId: null })
  domainEnabled.mockResolvedValue(true)
  rpc.mockResolvedValue({ data: NEW_ID, error: null })
  rateIntake.mockResolvedValue({ ok: true })
  rateSearch.mockResolvedValue({ ok: true })
})

describe('markPortionIntakeAction', () => {
  it('registra un intake sintético de porción completa vía record_nutrition_intake_v2', async () => {
    const res = await markPortionIntakeAction(markInput())

    expect(res).toEqual({ ok: true, data: { entryId: NEW_ID } })
    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('record_nutrition_intake_v2')
    expect(args).toMatchObject({
      p_client_id: CLIENT_ID,
      p_local_date: '2026-07-18',
      p_food_id: null,
      p_custom_name: 'Cereales',
      p_meal_slot: 'lunch',
      p_source: 'prescription',
      p_capture_method: 'prescription',
    })
    // Snapshot de macros = ref POR PORCIÓN (SIN escalar); el total = ref × p_quantity lo
    // materializa el servidor (nutrition_v2_entry_factor). Con 1 porción coincide con ref.
    expect(args.p_snapshot).toMatchObject({
      name: 'Cereales',
      calories: 70,
      proteinG: 2,
      carbsG: 15,
      fatsG: 0.5,
      exchangeGroupCode: 'C',
      exchangePortions: 1,
    })
    expect(args.p_quantity).toBe(1)
    // La key la emite el helper canónico (ordinal + attempt).
    expect(args.p_idempotency_key).toBe(
      buildNutritionPortionIntakeKey({
        clientId: CLIENT_ID,
        deviceId: DEVICE_ID,
        localDate: '2026-07-18',
        slotCode: 'lunch',
        groupCode: 'C',
        ordinal: 0,
        attempt: 1,
      }),
    )
  })

  it('Q4: media porción (0,5) => snapshot = ref POR PORCIÓN + p_quantity=0,5 (el aporte ref×0,5 lo materializa el factor server-side)', async () => {
    const res = await markPortionIntakeAction(markInput({ portions: 0.5 }))

    expect(res).toEqual({ ok: true, data: { entryId: NEW_ID } })
    const snapshot = rpc.mock.calls[0][1].p_snapshot
    // El snapshot NO se escala en el cliente: guarda la ref POR PORCIÓN tal cual. El
    // total del día = snapshot × p_quantity = ref × 0,5 lo produce el servidor
    // (private.nutrition_v2_entry_factor devuelve quantity para unidad 'porción').
    expect(snapshot).toMatchObject({
      calories: REF.calories, // 70 (ref por porción, SIN ×0,5)
      proteinG: REF.proteinG, // 2
      carbsG: REF.carbsG, // 15
      fatsG: REF.fatsG, // 0.5
      exchangePortions: 0.5,
      exchangeGroupCode: 'C',
    })
    expect(rpc.mock.calls[0][1].p_quantity).toBe(0.5)
  })

  it('Q5: deshacer→re-marcar (attempt+1) genera una key DISTINTA a la del intake anulado', async () => {
    await markPortionIntakeAction(markInput({ ordinal: 0, attempt: 1 }))
    const keyAttempt1 = rpc.mock.calls[0][1].p_idempotency_key

    // Tras un deshacer, el cliente re-marca el MISMO ordinal con attempt incrementado.
    await markPortionIntakeAction(markInput({ ordinal: 0, attempt: 2 }))
    const keyAttempt2 = rpc.mock.calls[1][1].p_idempotency_key

    expect(keyAttempt1).not.toBe(keyAttempt2)
    // Y cada una calza con el helper real para su attempt (no colisión posible).
    expect(keyAttempt2).toBe(
      buildNutritionPortionIntakeKey({
        clientId: CLIENT_ID,
        deviceId: DEVICE_ID,
        localDate: '2026-07-18',
        slotCode: 'lunch',
        groupCode: 'C',
        ordinal: 0,
        attempt: 2,
      }),
    )
  })

  it('Q2: NO exige canRegisterFreely — una franja solo-porciones marca igual', async () => {
    // La action no consulta permisos del plan: el target habilita por sí mismo (SPEC R1,
    // docs/archive/specs/nutrition-portions/SPEC.md:118-124). Esta EXENCIÓN sobrevivió a NUT-009,
    // que sí puso a gobernar canRegisterFreely en el registro libre: la garantía ya no es "no
    // existe ningún guard", sino que marcar-porción NO llama a resolveStudentIntakePermissions
    // (cero llamadas a get_nutrition_student_permissions_v2) y que el sintético viaja con
    // source='prescription', que el guard del RPC tampoco alcanza.
    const res = await markPortionIntakeAction(markInput())
    expect(res.ok).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('record_nutrition_intake_v2')
    expect(rpc).not.toHaveBeenCalledWith('get_nutrition_student_permissions_v2', expect.anything())
  })

  it('rechaza porciones fuera del literal {0,5; 1} sin tocar el RPC', async () => {
    const res = await markPortionIntakeAction(markInput({ portions: 0.25 as unknown as 0.5 }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza attempt < 1 (no entero válido) sin tocar el RPC', async () => {
    const res = await markPortionIntakeAction(markInput({ attempt: 0 }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza ref no finito (NaN) sin tocar el RPC', async () => {
    const res = await markPortionIntakeAction(markInput({ ref: { ...REF, calories: Number.NaN } }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('propaga RATE_LIMITED sin escribir (ráfaga excedida)', async () => {
    rateIntake.mockResolvedValue({ ok: false, retryAfter: 3 })
    const res = await markPortionIntakeAction(markInput())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('RATE_LIMITED')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('falla cerrado si el clientId no es el usuario autenticado', async () => {
    getUser.mockResolvedValue({ user: { id: 'someone-else' }, hasClientRow: true })
    const res = await markPortionIntakeAction(markInput())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('CLIENT_SCOPE_MISMATCH')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('mapea coach_account_paused del RPC a error tipado', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'coach_account_paused', code: '42501' } })
    const res = await markPortionIntakeAction(markInput())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).not.toBe('SCOPE_DENIED')
  })
})

describe('undoPortionIntakeAction', () => {
  it('anula vía correct_nutrition_intake_v2 (nunca delete) y devuelve el id de la correctora', async () => {
    const res = await undoPortionIntakeAction({ clientId: CLIENT_ID, entryId: ENTRY_ID })

    expect(res).toEqual({ ok: true, data: { correctionEntryId: NEW_ID } })
    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('correct_nutrition_intake_v2')
    expect(args).toMatchObject({
      p_corrects_entry_id: ENTRY_ID,
      p_client_id: CLIENT_ID,
      p_source: 'manual',
      p_capture_method: 'manual',
    })
    // Contribución CERO (macros 0); el RPC además fuerza exchange_portions=null (belt B3).
    expect(args.p_snapshot).toMatchObject({ calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 })
    expect(typeof args.p_correction_reason).toBe('string')
    expect(args.p_correction_reason.length).toBeGreaterThanOrEqual(3)
  })

  it('re-deshacer la misma entry usa una key estable (idempotente)', async () => {
    await undoPortionIntakeAction({ clientId: CLIENT_ID, entryId: ENTRY_ID })
    const key1 = rpc.mock.calls[0][1].p_idempotency_key
    await undoPortionIntakeAction({ clientId: CLIENT_ID, entryId: ENTRY_ID })
    const key2 = rpc.mock.calls[1][1].p_idempotency_key
    expect(key1).toBe(key2)
  })

  it('rechaza entryId no-uuid sin tocar el RPC', async () => {
    const res = await undoPortionIntakeAction({ clientId: CLIENT_ID, entryId: 'nope' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(rpc).not.toHaveBeenCalled()
  })

  /**
   * NUT-031 (migración 20260728122000): el RPC gana un short-circuit de idempotencia — si la MISMA
   * idempotency key ya produjo una corrección sobre ESE original, devuelve el id previo en vez de
   * levantar `nutrition_v2_only_active_entries_can_correct`.
   *
   * Por eso la expectativa vieja de este bloque ("re-deshacer devuelve un fallo honesto") quedó
   * INVÁLIDA: el deshacer usa una key ESTABLE por entry, así que el segundo intento es exactamente
   * el caso que el short-circuit resuelve. El 22023 solo puede aparecer con una key DISTINTA sobre
   * una entry ya corregida — y ese camino sí sigue siendo un fallo honesto.
   */
  it('re-deshacer la MISMA entry es idempotente: el RPC devuelve el id previo (NUT-031)', async () => {
    const PREVIOUS_CORRECTION_ID = '88888888-8888-4888-8888-888888888888'
    rpc.mockResolvedValue({ data: PREVIOUS_CORRECTION_ID, error: null })

    const res = await undoPortionIntakeAction({ clientId: CLIENT_ID, entryId: ENTRY_ID })

    expect(res).toEqual({ ok: true, data: { correctionEntryId: PREVIOUS_CORRECTION_ID } })
  })

  it('un 22023 real (key distinta sobre una entry ya corregida) sigue siendo un fallo honesto', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'nutrition_v2_only_active_entries_can_correct', code: '22023' },
    })
    const res = await undoPortionIntakeAction({ clientId: CLIENT_ID, entryId: ENTRY_ID })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_INTAKE')
  })
})
