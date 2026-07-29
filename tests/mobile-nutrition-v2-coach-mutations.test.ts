// NUT-005 — el camino de ESCRITURA del coach en RN pasa SIEMPRE por la API movil.
//
// Antes `publishDraftRN`, `publishQuickEditRN`, `assignNutritionPlanToClients` y
// `archiveNutritionPlan` escribian directo contra PostgREST/RPC con el JWT de la sesion: ni la RLS
// ni `publish_nutrition_plan_v2` miran rollout ni entitlement, asi que el kill-switch de Edge Config
// y el addon Nutricion Pro no tenian barrera server-side en ese camino.
//
// Estos tests fijan el invariante: las cuatro operaciones POSTean a
// /api/mobile/nutrition-v2/coach/mutate con la accion y el workspace correctos, y el modulo no
// expone ya ninguna rutina de escritura directa (`persistAndPublishDraft` / `db.rpc('publish_…')`).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

const apiFetchMock = vi.hoisted(() => vi.fn())
class FakeApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}
vi.mock('../apps/mobile/lib/api', () => ({ apiFetch: apiFetchMock, ApiError: FakeApiError }))

const api = await import('../apps/mobile/lib/nutrition-v2.api')
const builderLib = await import('../apps/mobile/lib/nutrition-v2-builder')
const quickEditLib = await import('../apps/mobile/lib/nutrition-v2-quick-edit')

const CLIENT = '11111111-1111-4111-8111-111111111111'
const TARGET = '22222222-2222-4222-8222-222222222222'
const PLAN_ROOT = '33333333-3333-4333-8333-333333333333'
const VERSION_ID = '44444444-4444-4444-8444-444444444444'
const NEW_VERSION_ID = '55555555-5555-4555-8555-555555555555'

const SCOPE = { scopeType: 'standalone', teamId: null, orgId: null } as const
const MUTATE_PATH = '/api/mobile/nutrition-v2/coach/mutate'

function draftFor(planId: string | null, overrides: Partial<NutritionPlanDraft> = {}): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    ...(planId ? { planId } : {}),
    clientId: CLIENT,
    name: 'Plan base',
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
          {
            code: 'slot-1',
            name: 'Desayuno',
            startTime: '08:00',
            items: [{ customName: 'Avena', quantity: 80, unit: 'g' }],
          },
        ],
      },
    ],
    ...overrides,
  })
}

function hybridDraft(): NutritionPlanDraft {
  return draftFor(null, { strategy: 'hybrid' } as Partial<NutritionPlanDraft>)
}

function lastBody(): Record<string, unknown> {
  const call = apiFetchMock.mock.calls.at(-1)
  return (call?.[1] as { body: Record<string, unknown> }).body
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('frontera: la lib del coach RN ya no expone escrituras directas', () => {
  it('nutrition-v2-builder no exporta rutinas de persistencia', () => {
    expect('persistAndPublishDraft' in builderLib).toBe(false)
    expect('resolveReusableUnpublishedPlanIdRN' in builderLib).toBe(false)
    expect('publishDraftRN' in builderLib).toBe(false)
  })

  it('nutrition-v2-quick-edit solo arma el draft (sin publicar)', () => {
    expect('persistAndPublishQuickEdit' in quickEditLib).toBe(false)
    expect(typeof quickEditLib.buildQuickEditPublishDraft).toBe('function')
  })
})

describe('publishDraftRN', () => {
  it('POSTea al endpoint con accion publish, workspace y clave de idempotencia', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, versionId: NEW_VERSION_ID, planId: PLAN_ROOT })
    const res = await api.publishDraftRN({
      scope: SCOPE,
      draft: draftFor(PLAN_ROOT),
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
      hasNutritionPro: true,
      expectedCurrentVersionId: VERSION_ID,
    })
    expect(res).toEqual({ ok: true, versionId: NEW_VERSION_ID, planId: PLAN_ROOT })
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    expect(apiFetchMock.mock.calls[0][0]).toBe(MUTATE_PATH)
    expect(apiFetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', authenticated: true })
    expect(lastBody()).toMatchObject({
      action: 'publish',
      workspace: SCOPE,
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
      expectedCurrentVersionId: VERSION_ID,
    })
  })

  it('reintentar con la MISMA clave manda la misma clave (idempotencia en el payload)', async () => {
    apiFetchMock.mockRejectedValueOnce(new FakeApiError('boom', 500, 'WRITE_FAILED'))
    apiFetchMock.mockResolvedValueOnce({ ok: true, versionId: NEW_VERSION_ID, planId: PLAN_ROOT })
    const input = {
      scope: SCOPE,
      draft: draftFor(PLAN_ROOT),
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
      hasNutritionPro: true,
    }
    const first = await api.publishDraftRN(input)
    expect(first.ok).toBe(false)
    const second = await api.publishDraftRN(input)
    expect(second.ok).toBe(true)
    const keys = apiFetchMock.mock.calls.map((c) => (c[1] as { body: { idempotencyKey: string } }).body.idempotencyKey)
    expect(keys).toEqual(['publish:key:abcdef', 'publish:key:abcdef'])
  })

  it('gate Pro cliente: hybrid sin addon corta ANTES de la red (upsell sin round-trip)', async () => {
    const res = await api.publishDraftRN({
      scope: SCOPE,
      draft: hybridDraft(),
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
      hasNutritionPro: false,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('UPGRADE_REQUIRED')
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('draft invalido => INVALID_PAYLOAD sin tocar la red', async () => {
    const res = await api.publishDraftRN({
      scope: SCOPE,
      draft: { nope: true },
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
      hasNutritionPro: true,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('propaga el codigo del servidor (rollout OFF => NUTRITION_V2_DISABLED)', async () => {
    apiFetchMock.mockRejectedValue(
      new FakeApiError('Nutrition V2 is not enabled for this scope.', 404, 'NUTRITION_V2_DISABLED'),
    )
    const res = await api.publishDraftRN({
      scope: SCOPE,
      draft: draftFor(PLAN_ROOT),
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
      hasNutritionPro: true,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NUTRITION_V2_DISABLED')
  })
})

describe('publishQuickEditDraftRN', () => {
  it('POSTea quickEditPublish con la version base (CAS server-side)', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, versionId: NEW_VERSION_ID, planId: PLAN_ROOT })
    const res = await api.publishQuickEditDraftRN({
      scope: SCOPE,
      draft: draftFor(PLAN_ROOT),
      baseVersionId: VERSION_ID,
      idempotencyKey: 'quick:key:abcdef',
      effectiveFrom: '2026-07-28',
    })
    expect(res.ok).toBe(true)
    expect(lastBody()).toMatchObject({
      action: 'quickEditPublish',
      workspace: SCOPE,
      baseVersionId: VERSION_ID,
      idempotencyKey: 'quick:key:abcdef',
    })
  })
})

describe('assignNutritionPlanToClients', () => {
  it('POSTea assign con la version esperada y los destinos validados', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      results: [{ clientId: TARGET, ok: true, versionId: NEW_VERSION_ID }],
      summary: { total: 1, succeeded: 1, failed: 0 },
    })
    const res = await api.assignNutritionPlanToClients({
      sourceClientId: CLIENT,
      sourceScope: SCOPE,
      expectedVersionId: VERSION_ID,
      targetClientIds: [TARGET],
      effectiveFrom: '2026-07-28',
      operationId: 'assign-op-123456',
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.summary.succeeded).toBe(1)
    expect(lastBody()).toMatchObject({
      action: 'assign',
      workspace: SCOPE,
      sourceClientId: CLIENT,
      expectedVersionId: VERSION_ID,
      targetClientIds: [TARGET],
      operationId: 'assign-op-123456',
    })
  })

  it('seleccion invalida (la fuente entre los destinos) corta sin red', async () => {
    const res = await api.assignNutritionPlanToClients({
      sourceClientId: CLIENT,
      sourceScope: SCOPE,
      expectedVersionId: VERSION_ID,
      targetClientIds: [CLIENT],
      effectiveFrom: '2026-07-28',
      operationId: 'assign-op-123456',
    })
    expect(res.ok).toBe(false)
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('fuente cambiada => SOURCE_VERSION_MISMATCH del servidor (nunca copia un plan viejo)', async () => {
    apiFetchMock.mockRejectedValue(
      new FakeApiError('El plan de origen cambió. Vuelve a abrir el diálogo e intenta de nuevo.', 400, 'SOURCE_VERSION_MISMATCH'),
    )
    const res = await api.assignNutritionPlanToClients({
      sourceClientId: CLIENT,
      sourceScope: SCOPE,
      expectedVersionId: VERSION_ID,
      targetClientIds: [TARGET],
      effectiveFrom: '2026-07-28',
      operationId: 'assign-op-123456',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('SOURCE_VERSION_MISMATCH')
  })
})

describe('archiveNutritionPlan', () => {
  it('POSTea archive y mapea el OK', async () => {
    apiFetchMock.mockResolvedValue({ ok: true })
    const res = await api.archiveNutritionPlan({ scope: SCOPE, clientId: CLIENT, planId: PLAN_ROOT })
    expect(res).toEqual({ code: 'OK' })
    expect(lastBody()).toMatchObject({ action: 'archive', workspace: SCOPE, clientId: CLIENT, planId: PLAN_ROOT })
  })

  it('archivar dos veces: el servidor responde PLAN_NOT_FOUND (idempotente, no es un error duro)', async () => {
    apiFetchMock.mockRejectedValue(
      new FakeApiError('No se encontro un plan vigente para archivar.', 404, 'PLAN_NOT_FOUND'),
    )
    const res = await api.archiveNutritionPlan({ scope: SCOPE, clientId: CLIENT, planId: PLAN_ROOT })
    expect(res.code).toBe('PLAN_NOT_FOUND')
  })

  it('ids invalidos => WRITE_FAILED sin tocar la red', async () => {
    const res = await api.archiveNutritionPlan({ scope: SCOPE, clientId: 'no-uuid', planId: PLAN_ROOT })
    expect(res.code).toBe('WRITE_FAILED')
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})
