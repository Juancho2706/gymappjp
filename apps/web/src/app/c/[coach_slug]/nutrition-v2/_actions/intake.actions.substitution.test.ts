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

import { recordSubstitutionIntakeAction } from './intake.actions'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'
const SUB_ID = '88888888-8888-4888-8888-888888888888'
const SUB_FOOD_ID = '99999999-9999-4999-8999-999999999999'
const OTHER_FOOD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const VERSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ENTRY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NEW_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const LOCAL_DATE = '2026-08-09'

const OPTIONS_RPC = 'get_nutrition_substitution_options_v2'
const PERMISSIONS_RPC = 'get_nutrition_student_permissions_v2'
const TODAY_RPC = 'get_nutrition_today_v2'

/**
 * Par REAL de produccion: "Palta 45 g / 72 kcal" con reemplazo autorizado "Pechuga de Pollo
 * cocida" (165 kcal por porcion de 100 g). La equivalencia calorica da 43,6 g ⇒ 45 g redondeado.
 */
function optionsPayload(over: { quantity?: number | null; unit?: string | null } = {}) {
  return {
    schemaVersion: 1,
    localDate: LOCAL_DATE,
    versionId: VERSION_ID,
    items: [
      {
        prescriptionItemId: ITEM_ID,
        mealSlotCode: 'slot-1',
        item: { quantity: 45, unit: 'g', name: 'Palta', calories: 72 },
        options: [
          {
            substitutionId: SUB_ID,
            foodId: SUB_FOOD_ID,
            recipeId: null,
            customName: null,
            quantity: over.quantity ?? null,
            unit: over.unit ?? null,
            food: {
              name: 'Pechuga de Pollo cocida',
              brand: null,
              calories: 165,
              proteinG: 31,
              carbsG: 0,
              fatsG: 3.6,
              fiberG: null,
              macrosBasis: 'per_serving',
              servingSize: 100,
              servingUnit: 'g',
              hasOverride: false,
            },
            frozen: { name: 'Pechuga de Pollo cocida', brand: null, calories: 165 },
          },
        ],
      },
    ],
  }
}

function todayPayload(entries: Array<Record<string, unknown>> = []) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-09T12:00:00.000Z',
    localDate: LOCAL_DATE,
    timezone: 'America/Santiago',
    snapshotId: null,
    plan: null,
    targets: {},
    consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0 },
    remaining: {},
    permissions: {},
    mealSlots: [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        code: 'slot-1',
        name: 'Desayuno',
        startTime: null,
        endTime: null,
        mode: 'anchor',
        required: true,
        instructions: null,
        targets: {},
        prescriptionItems: [],
        intakeItems: entries,
      },
    ],
    unassignedIntake: [],
    syncToken: 'token',
  }
}

function activeEntry() {
  return {
    id: ENTRY_ID,
    foodId: OTHER_FOOD_ID,
    customName: null,
    quantity: 45,
    unit: 'g',
    mealSlot: 'slot-1',
    source: 'prescription',
    captureMethod: 'prescription',
    occurredAt: '2026-08-09T11:00:00.000Z',
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: ITEM_ID,
    snapshot: {
      name: 'Palta',
      brand: null,
      calories: 72,
      proteinG: null,
      carbsG: null,
      fatsG: null,
      fiberG: null,
      servingSize: 1,
      servingUnit: 'g',
    },
    totals: { calories: 72, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 },
  }
}

type Fixture = {
  options?: unknown
  today?: unknown
  permissions?: Record<string, unknown>
}
let fixture: Fixture = {}

function request(over: Record<string, unknown> = {}) {
  return {
    payload: {
      clientId: CLIENT_ID,
      localDate: LOCAL_DATE,
      occurredAt: '2026-08-09T12:00:00.000Z',
      timezone: 'America/Santiago',
      prescriptionItemId: ITEM_ID,
      substitutionId: SUB_ID,
      attempt: 0,
      ...over,
    },
  }
}

/** Llamadas de ESCRITURA (las tres lecturas del flujo no cuentan). */
function writeCalls() {
  return rpc.mock.calls.filter(
    ([name]) => name !== OPTIONS_RPC && name !== PERMISSIONS_RPC && name !== TODAY_RPC,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  requestHeaders.clear()
  requestHeaders.set('x-coach-slug', 'josefit')
  fixture = {}
  getUser.mockResolvedValue({ user: { id: CLIENT_ID }, hasClientRow: true })
  getScope.mockResolvedValue({ coachId: 'coach-1', teamId: null, orgId: null })
  domainEnabled.mockResolvedValue(true)
  rateIntake.mockResolvedValue({ ok: true })
  rateSearch.mockResolvedValue({ ok: true })

  rpc.mockImplementation(async (name: string) => {
    if (name === OPTIONS_RPC) return { data: fixture.options ?? optionsPayload(), error: null }
    if (name === TODAY_RPC) return { data: fixture.today ?? todayPayload(), error: null }
    if (name === PERMISSIONS_RPC) {
      return {
        data: {
          permissions: fixture.permissions ?? {
            canRegisterFreely: false,
            canAdjustPrescribedQuantity: true,
            quantityAdjustmentPercent: null,
          },
          prescribed: null,
        },
        error: null,
      }
    }
    return { data: NEW_ID, error: null }
  })
})

vi.mock('@/lib/student-access.server', () => ({
  resolveStudentAccessForCoach: vi.fn(async () => ({ state: 'active' })),
}))

describe('recordSubstitutionIntakeAction', () => {
  it('registra el reemplazo autorizado aunque el alumno no pueda registrar libremente', async () => {
    const result = await recordSubstitutionIntakeAction(request())

    expect(result).toMatchObject({ ok: true, mode: 'record', quantity: 45, unit: 'g' })
    const [name, args] = writeCalls()[0]
    expect(name).toBe('record_nutrition_intake_v2')
    expect(args).toMatchObject({
      p_source: 'substitution',
      p_capture_method: 'prescription',
      p_food_id: SUB_FOOD_ID,
      p_prescription_item_id: ITEM_ID,
      p_meal_slot: 'slot-1',
      p_plan_version_id: VERSION_ID,
      p_quantity: 45,
      p_unit: 'g',
    })
  })

  it('la clave de idempotencia es determinista por intencion y cambia con el intento', async () => {
    await recordSubstitutionIntakeAction(request())
    const first = writeCalls()[0][1].p_idempotency_key
    expect(first).toBe(`subst-${LOCAL_DATE}-${ITEM_ID}-${SUB_ID}-a0`)

    vi.clearAllMocks()
    await recordSubstitutionIntakeAction(request({ attempt: 2 }))
    expect(writeCalls()[0][1].p_idempotency_key).toBe(`subst-${LOCAL_DATE}-${ITEM_ID}-${SUB_ID}-a2`)
  })

  it('el cliente NO puede elegir el alimento: un foodId colado se ignora', async () => {
    await recordSubstitutionIntakeAction(request({ foodId: OTHER_FOOD_ID, snapshot: { calories: 9999 } }))

    const [, args] = writeCalls()[0]
    expect(args.p_food_id).toBe(SUB_FOOD_ID)
    expect(args.p_snapshot).toMatchObject({ name: 'Pechuga de Pollo cocida', calories: 165 })
  })

  it('un substitutionId que ya no esta autorizado no llega a escribir', async () => {
    const result = await recordSubstitutionIntakeAction(
      request({ substitutionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
    )

    expect(result).toMatchObject({ ok: false, code: 'SUBSTITUTION_NOT_AUTHORIZED' })
    expect(writeCalls()).toHaveLength(0)
  })

  it('un item sin reemplazos tampoco llega a escribir', async () => {
    fixture.options = { schemaVersion: 1, localDate: LOCAL_DATE, versionId: VERSION_ID, items: [] }

    const result = await recordSubstitutionIntakeAction(request())

    expect(result).toMatchObject({ ok: false, code: 'SUBSTITUTION_NOT_AUTHORIZED' })
    expect(writeCalls()).toHaveLength(0)
  })

  it('sobre un item YA registrado corrige en vez de duplicar (D3)', async () => {
    fixture.today = todayPayload([activeEntry()])

    const result = await recordSubstitutionIntakeAction(request({ attempt: 1 }))

    expect(result).toMatchObject({ ok: true, mode: 'correct' })
    const [name, args] = writeCalls()[0]
    expect(name).toBe('correct_nutrition_intake_v2')
    expect(args).toMatchObject({
      p_corrects_entry_id: ENTRY_ID,
      p_source: 'substitution',
      p_food_id: SUB_FOOD_ID,
    })
    expect(String(args.p_correction_reason).length).toBeGreaterThanOrEqual(3)
  })

  it('una entry RETIRADA no cuenta como registro vigente: vuelve a registrar', async () => {
    fixture.today = todayPayload([{ ...activeEntry(), status: 'voided' }])

    const result = await recordSubstitutionIntakeAction(request({ attempt: 1 }))

    expect(result).toMatchObject({ ok: true, mode: 'record' })
    expect(writeCalls()[0][0]).toBe('record_nutrition_intake_v2')
  })

  it('la cantidad del alumno se descarta cuando el plan no permite ajustarla', async () => {
    fixture.permissions = {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: false,
      quantityAdjustmentPercent: null,
    }

    const result = await recordSubstitutionIntakeAction(request({ quantity: 300 }))

    expect(result).toMatchObject({ ok: true, quantity: 45, quantityOverridden: true })
    expect(writeCalls()[0][1].p_quantity).toBe(45)
  })

  it('la cantidad del alumno se honra dentro del tope, medida contra la EQUIVALENTE', async () => {
    fixture.permissions = {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: 20,
    }

    const dentro = await recordSubstitutionIntakeAction(request({ quantity: 50 }))
    expect(dentro).toMatchObject({ ok: true, quantity: 50, quantityOverridden: false })

    vi.clearAllMocks()
    const fuera = await recordSubstitutionIntakeAction(request({ quantity: 300 }))
    expect(fuera).toMatchObject({ ok: true, quantity: 45, quantityOverridden: true })
  })

  it('la cantidad explicita del coach gana sobre la equivalencia', async () => {
    fixture.options = optionsPayload({ quantity: 200, unit: 'g' })

    const result = await recordSubstitutionIntakeAction(request())

    expect(result).toMatchObject({ ok: true, quantity: 200 })
    expect(writeCalls()[0][1].p_quantity).toBe(200)
  })

  it('sin sesion de alumno no se resuelve nada', async () => {
    getUser.mockResolvedValue({ user: null, hasClientRow: false })

    const result = await recordSubstitutionIntakeAction(request())

    expect(result).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('un clientId ajeno se rechaza antes de tocar la base', async () => {
    const result = await recordSubstitutionIntakeAction(
      request({ clientId: 'ffffffff-ffff-4fff-8fff-fffffffffff0' }),
    )

    expect(result).toMatchObject({ ok: false, code: 'CLIENT_SCOPE_MISMATCH' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

// QA 2026-08-09: el diálogo de los casos degradados SIEMPRE manda una cantidad, aunque el alumno
// no la toque. Con `canAdjustPrescribedQuantity=false` eso marcaba `quantityOverridden` y la UI
// avisaba "tu coach fijó la cantidad" cuando el alumno solo había apretado Registrar.
describe('recordSubstitutionIntakeAction — confirmar no es ajustar', () => {
  beforeEach(() => {
    fixture.permissions = {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: false,
      quantityAdjustmentPercent: null,
    }
  })

  it('mandar exactamente la cantidad calculada no cuenta como override', async () => {
    const result = await recordSubstitutionIntakeAction(request({ quantity: 45 }))

    expect(result).toMatchObject({ ok: true, quantity: 45, quantityOverridden: false })
  })

  it('mandar una cantidad distinta sí cuenta como override', async () => {
    const result = await recordSubstitutionIntakeAction(request({ quantity: 50 }))

    expect(result).toMatchObject({ ok: true, quantity: 45, quantityOverridden: true })
  })
})
