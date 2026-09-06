import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mocks de modulos server-only. `plan-persistence` se mockea entero para aislar la LOGICA del
// quick-edit (carry-over + delta-gate + effectiveFrom + guard); `entitlements.service` alimenta
// al gate Pro real (hasNutritionProV2 -> hasModule). requiredNutritionProFeature queda REAL.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/services/entitlements.service', () => ({ hasModule: vi.fn(), assertModule: vi.fn() }))
vi.mock('@/app/coach/nutrition-v2/_actions/plan-persistence', () => ({
  authorizeCoach: vi.fn(),
  persistAndPublishDraft: vi.fn(),
  zodFields: vi.fn(() => []),
}))

import { hasModule } from '@/services/entitlements.service'
import { authorizeCoach, persistAndPublishDraft } from '@/app/coach/nutrition-v2/_actions/plan-persistence'
import { quickEditPublishAction } from './quick-edit.actions'

const COACH = '22222222-2222-4222-8222-222222222222'
const CLIENT = '33333333-3333-4333-8333-333333333333'
const PLAN = '44444444-4444-4444-8444-444444444444'
const BASE_VERSION = '55555555-5555-4555-8555-555555555555'
const NEW_VERSION = '66666666-6666-4666-8666-666666666666'
const FOOD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function fullTargets(calories: number | null) {
  return { calories, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null }
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    planId: PLAN,
    clientId: CLIENT,
    name: 'Plan',
    strategy: 'structured',
    timezone: 'America/Santiago',
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    visibleNotes: null,
    privateNotes: null,
    protocolNotes: null,
    dayVariants: [
      {
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        default: true,
        targets: fullTargets(2000),
        orderIndex: 0,
        mealSlots: [
          {
            code: 'slot-1',
            name: 'Desayuno',
            startTime: null,
            endTime: null,
            mode: 'anchor',
            required: false,
            targets: {},
            instructions: null,
            orderIndex: 0,
            items: [
              {
                foodId: FOOD,
                recipeId: null,
                customName: null,
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                orderIndex: 0,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

interface DbOpts {
  baseVersion: Record<string, unknown> | null
  plan: Record<string, unknown> | null
  variants: Array<{ id: string }>
  versionNumber: number | null
}

function makeDb(opts: DbOpts) {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {}
    let selectCols = ''
    const self = () => chain
    Object.assign(chain, {
      select: (cols: string) => {
        selectCols = cols
        return chain
      },
      eq: vi.fn(self),
      order: vi.fn(self),
      limit: vi.fn(self),
      maybeSingle: async () => {
        if (table === 'nutrition_plans_v2') return { data: opts.plan, error: null }
        if (table === 'nutrition_plan_versions_v2') {
          if (selectCols.includes('version_number')) {
            return { data: opts.versionNumber == null ? null : { version_number: opts.versionNumber }, error: null }
          }
          return { data: opts.baseVersion, error: null }
        }
        return { data: null, error: null }
      },
      // La consulta de variantes se AWAITA directamente (sin maybeSingle) -> chain thenable.
      then: (resolve: (v: unknown) => void) => resolve({ data: opts.variants, error: null }),
    })
    return chain
  }
  return { from, rpc: vi.fn() }
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT,
    baseVersionId: BASE_VERSION,
    draft: draft(),
    idempotencyKey: 'quick-edit:op-1234567',
    ...overrides,
  }
}

function baseVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BASE_VERSION,
    plan_id: PLAN,
    strategy: 'structured',
    effective_from: '2026-07-10',
    visible_notes: 'Toma agua',
    private_notes: null,
    protocol_notes: null,
    ...overrides,
  }
}

function authOk(db: unknown) {
  vi.mocked(authorizeCoach).mockResolvedValue({
    ok: true,
    db,
    userId: COACH,
    proCtx: { coachId: COACH, teamId: null },
    workspace: null,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(persistAndPublishDraft).mockResolvedValue({ ok: true, versionId: NEW_VERSION, planId: PLAN } as never)
})

describe('quickEditPublishAction — validacion de entrada', () => {
  it('draft.clientId != clientId => VALIDATION, sin auth', async () => {
    const res = await quickEditPublishAction(input({ draft: draft({ clientId: PLAN }) }))
    expect(res).toEqual({ ok: false, code: 'VALIDATION' })
    expect(authorizeCoach).not.toHaveBeenCalled()
  })

  it('draft sin planId => VALIDATION (quick-edit nunca crea plan)', async () => {
    const res = await quickEditPublishAction(input({ draft: draft({ planId: undefined }) }))
    expect(res).toEqual({ ok: false, code: 'VALIDATION' })
    expect(authorizeCoach).not.toHaveBeenCalled()
  })

  it('payload invalido (idempotencyKey corta) => VALIDATION', async () => {
    const res = await quickEditPublishAction(input({ idempotencyKey: 'x' }))
    expect(res).toEqual({ ok: false, code: 'VALIDATION' })
  })
})

describe('quickEditPublishAction — anti-confusion de ids', () => {
  it('version base inexistente => VALIDATION, sin publicar', async () => {
    authOk(makeDb({ baseVersion: null, plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({ ok: false, code: 'VALIDATION' })
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })

  it('version base de otro plan => VALIDATION', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow({ plan_id: 'otro-plan' }), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({ ok: false, code: 'VALIDATION' })
  })

  it('plan de otro alumno => VALIDATION', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: 'otro-alumno' }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({ ok: false, code: 'VALIDATION' })
  })
})

describe('quickEditPublishAction — delta-gate Pro (grandfathering)', () => {
  it('BASE structured, 1 variante, sin addon => publica sin consultar entitlement', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({ ok: true, versionId: NEW_VERSION, versionNumber: 4 })
    expect(hasModule).not.toHaveBeenCalled()
    expect(persistAndPublishDraft).toHaveBeenCalledTimes(1)
  })

  it('feature GRANDFATHERED (base hybrid) sin addon => se PERMITE editar', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow({ strategy: 'hybrid' }), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await quickEditPublishAction(input({ draft: draft({ strategy: 'hybrid' }) }))
    expect(res).toEqual({ ok: true, versionId: NEW_VERSION, versionNumber: 4 })
    expect(persistAndPublishDraft).toHaveBeenCalledTimes(1)
  })

  it('feature NUEVA (base structured, draft hybrid) sin addon => UPGRADE_REQUIRED', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow({ strategy: 'structured' }), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await quickEditPublishAction(input({ draft: draft({ strategy: 'hybrid' }) }))
    expect(res).toEqual({ ok: false, code: 'UPGRADE_REQUIRED', feature: 'hybrid_strategy' })
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })
})

describe('quickEditPublishAction — notas', () => {
  it('visibleNotes EDITABLES viajan del cliente; protocol carry-over de la base; private_notes NUNCA (columna deprecada)', async () => {
    authOk(makeDb({
      baseVersion: baseVersionRow({ protocol_notes: 'protocolo' }),
      plan: { id: PLAN, client_id: CLIENT },
      variants: [{ id: 'v1' }],
      versionNumber: 4,
    }))
    vi.mocked(hasModule).mockResolvedValue(false)
    // El cliente manda privateNotes forjadas; el server las descarta. La columna same-row
    // private_notes esta deprecada e ilegible por `authenticated`, asi que NO se lee ni se
    // copia: el draft final siempre lleva privateNotes = null. visibleNotes en cambio es
    // editable: la del cliente PISA la de la base ('Toma agua').
    await quickEditPublishAction(
      input({ draft: draft({ privateNotes: 'FORJADA', visibleNotes: '  Nota nueva del coach  ' }) }),
    )
    expect(persistAndPublishDraft).toHaveBeenCalledTimes(1)
    const call = vi.mocked(persistAndPublishDraft).mock.calls[0][0]
    expect(call.draft.privateNotes).toBeNull()
    expect(call.draft.protocolNotes).toBe('protocolo')
    // El schema de entrada trimea; la base 'Toma agua' queda superada.
    expect(call.draft.visibleNotes).toBe('Nota nueva del coach')
    expect(call.expectedCurrentVersionId).toBe(BASE_VERSION)
  })

  it('visibleNotes vacias/en blanco del cliente => null (borrar la nota es una edicion valida)', async () => {
    authOk(makeDb({
      baseVersion: baseVersionRow(),
      plan: { id: PLAN, client_id: CLIENT },
      variants: [{ id: 'v1' }],
      versionNumber: 4,
    }))
    await quickEditPublishAction(input({ draft: draft({ visibleNotes: '   ' }) }))
    const call = vi.mocked(persistAndPublishDraft).mock.calls[0][0]
    expect(call.draft.visibleNotes).toBeNull()
  })

  it('visibleNotes sobre el tope del contrato (8000) => VALIDATION sin publicar', async () => {
    authOk(makeDb({
      baseVersion: baseVersionRow(),
      plan: { id: PLAN, client_id: CLIENT },
      variants: [{ id: 'v1' }],
      versionNumber: 4,
    }))
    const res = await quickEditPublishAction(input({ draft: draft({ visibleNotes: 'x'.repeat(8001) }) }))
    expect(res).toEqual({ ok: false, code: 'VALIDATION' })
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })
})

describe('quickEditPublishAction — effectiveFrom', () => {
  it('version base con vigencia FUTURA => effectiveFrom = fecha base (no adelanta)', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow({ effective_from: '2099-01-01' }), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    await quickEditPublishAction(input())
    const call = vi.mocked(persistAndPublishDraft).mock.calls[0][0]
    expect(call.effectiveFrom).toBe('2099-01-01')
  })

  it('version base con vigencia pasada => effectiveFrom = hoy (ISO valido)', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow({ effective_from: '2020-01-01' }), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    await quickEditPublishAction(input())
    const call = vi.mocked(persistAndPublishDraft).mock.calls[0][0]
    expect(call.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(call.effectiveFrom > '2020-01-01').toBe(true)
  })

  // W3.2 «Cantidades honestas» (SPEC §6.2). «Aplicar desde manana» es lo que hace que la opcion
  // valga: la version vigente queda intacta HOY, el snapshot del dia no se rearma y los registros
  // del alumno no pueden quedar huerfanos (cero fantasmas por construccion).
  it('effectiveFromChoice tomorrow => effectiveFrom = hoy + 1 dia en la tz del alumno', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow({ effective_from: '2020-01-01' }), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    await quickEditPublishAction(input())
    const hoy = vi.mocked(persistAndPublishDraft).mock.calls[0][0].effectiveFrom
    vi.mocked(persistAndPublishDraft).mockClear()

    authOk(makeDb({ baseVersion: baseVersionRow({ effective_from: '2020-01-01' }), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    await quickEditPublishAction(input({ effectiveFromChoice: 'tomorrow' }))
    const manana = vi.mocked(persistAndPublishDraft).mock.calls[0][0].effectiveFrom

    expect(manana).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(manana > hoy).toBe(true)
    // Un dia exacto de calendario (y no un salto de mes mal hecho ni un corrimiento por DST).
    expect(Date.parse(`${manana}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)).toBe(86400000)
  })

  it('sin effectiveFromChoice el comportamiento es el de siempre (default today)', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow({ effective_from: '2099-01-01' }), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    await quickEditPublishAction(input())
    expect(vi.mocked(persistAndPublishDraft).mock.calls[0][0].effectiveFrom).toBe('2099-01-01')
  })

  it('un choice invalido no publica (VALIDATION), jamas cae al default en silencio', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    const res = await quickEditPublishAction(input({ effectiveFromChoice: 'pasado' }))
    expect(res).toEqual({ ok: false, code: 'VALIDATION' })
    expect(persistAndPublishDraft).not.toHaveBeenCalled()
  })
})

describe('quickEditPublishAction — mapeo de fallos del RPC', () => {
  it('STALE_BASE del pipeline => STALE_BASE tipado', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    vi.mocked(persistAndPublishDraft).mockResolvedValue({ ok: false, code: 'STALE_BASE', error: 'x' } as never)
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({ ok: false, code: 'STALE_BASE' })
  })

  it('EFFECTIVE_DATE del pipeline => EFFECTIVE_DATE tipado', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    vi.mocked(persistAndPublishDraft).mockResolvedValue({ ok: false, code: 'EFFECTIVE_DATE', error: 'x' } as never)
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({ ok: false, code: 'EFFECTIVE_DATE' })
  })

  it('SCOPE_DENIED del pipeline => FORBIDDEN tipado', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    vi.mocked(persistAndPublishDraft).mockResolvedValue({ ok: false, code: 'SCOPE_DENIED', error: 'x' } as never)
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({ ok: false, code: 'FORBIDDEN' })
  })

  // Defecto reportado por el owner (2026-08-05): el plan tenia dias sin ninguna comida (5 en
  // LIVE), el guard server-side lo rechazaba y este mapeo lo colapsaba a UNKNOWN => la barra
  // decia "No se pudo publicar. Reintentar" sin decir QUE dia, y el plan quedaba imposible de
  // republicar. Ahora viaja con codigo propio y con el mensaje del servidor.
  it('EMPTY_DAY_VARIANT del pipeline => EMPTY_DAY con el mensaje del servidor', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    vi.mocked(persistAndPublishDraft).mockResolvedValue({
      ok: false,
      code: 'EMPTY_DAY_VARIANT',
      error: 'Hay un día del plan sin ninguna comida (Lunes).',
    } as never)
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({
      ok: false,
      code: 'EMPTY_DAY',
      message: 'Hay un día del plan sin ninguna comida (Lunes).',
    })
  })

  it('EXCHANGE_GROUP_NOT_FOUND => VALIDATION con mensaje accionable', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    vi.mocked(persistAndPublishDraft).mockResolvedValue({
      ok: false,
      code: 'EXCHANGE_GROUP_NOT_FOUND',
      error: 'Un grupo de porciones del plan ya no esta disponible.',
    } as never)
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Un grupo de porciones del plan ya no esta disponible.',
    })
  })

  it('un fallo sin mapeo conserva el copy del servidor en vez de perderlo', async () => {
    authOk(makeDb({ baseVersion: baseVersionRow(), plan: { id: PLAN, client_id: CLIENT }, variants: [{ id: 'v1' }], versionNumber: 4 }))
    vi.mocked(persistAndPublishDraft).mockResolvedValue({
      ok: false,
      code: 'WRITE_FAILED',
      error: 'No se pudo guardar el plan (publicacion). Intenta nuevamente.',
    } as never)
    const res = await quickEditPublishAction(input())
    expect(res).toEqual({
      ok: false,
      code: 'UNKNOWN',
      message: 'No se pudo guardar el plan (publicacion). Intenta nuevamente.',
    })
  })
})

describe('quickEditPublishAction — identificadores vacios (22P02)', () => {
  it('un uuid vacio en el draft corta ANTES del schema, con mensaje claro y sin tocar auth', async () => {
    const bad = draft() as Record<string, unknown>
    const variants = bad.dayVariants as Array<Record<string, unknown>>
    const slots = variants[0].mealSlots as Array<Record<string, unknown>>
    const items = slots[0].items as Array<Record<string, unknown>>
    items[0].foodId = ''

    const res = await quickEditPublishAction(input({ draft: bad }))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe('VALIDATION')
    expect(res.message).toContain('sin identificador')
    expect(authorizeCoach).not.toHaveBeenCalled()
  })
})
