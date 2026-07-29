// Raiz unica de plan (NUT-004) + frescura de la fuente al asignar (NUT-012) en el coach RN.
//
// - `resolveReusableUnpublishedPlanIdRN` / `persistAndPublishDraft`: sin `draft.planId`, publicar
//   debe REUSAR la raiz activa huerfana del alumno (sin version publicada) en vez de insertar otra
//   raiz activa. Paridad con el web `resolveReusableUnpublishedPlanId` (plan-persistence.ts), que
//   RN nunca habia portado.
// - `assignNutritionPlanToClients`: relee la fuente y corta con SOURCE_VERSION_MISMATCH si la
//   version vigente ya no es la que el coach vio (antes copiaba el read-model de pantalla, que en
//   RN puede venir de la cache stale).
//
// `apps/mobile/lib/nutrition-v2.api` solo depende de `./api` (apiFetch) fuera del repo puro, asi
// que se mockea ese modulo con el `vi.mock` hoisteado normal (mismo patron que
// mobile-nutrition-v2-offline.test.ts) y el resto corre real.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'
import {
  persistAndPublishDraft,
  resolveReusableUnpublishedPlanIdRN,
  type NutritionV2WriteClient,
} from '../apps/mobile/lib/nutrition-v2-builder'

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('../apps/mobile/lib/api', () => ({ apiFetch: apiFetchMock }))

const { assignNutritionPlanToClients } = await import('../apps/mobile/lib/nutrition-v2.api')

const SOURCE = '11111111-1111-4111-8111-111111111111'
const TARGET = '22222222-2222-4222-8222-222222222222'
const PLAN_ROOT = '33333333-3333-4333-8333-333333333333'
const VERSION_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_VERSION_ID = '55555555-5555-4555-8555-555555555555'
const SLOT_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'
const VARIANT_ID = '88888888-8888-4888-8888-888888888888'
const PUBLISHED_ID = '99999999-9999-4999-8999-999999999999'

const SCOPE = { scopeType: 'standalone', teamId: null, orgId: null } as const

// ---------------------------------------------------------------------------
// Fake write client: registra inserts y responde los lookups por tabla.
// ---------------------------------------------------------------------------
function makeClient(opts: {
  /** Fila devuelta por el lookup de `nutrition_plans_v2` (raiz activa del alumno). */
  activePlanRow?: { id: string; current_published_version_id: string | null; client_id?: string } | null
  maxVersion?: number | null
} = {}) {
  const inserts: Array<{ table: string; rows: unknown }> = []
  const rpcCalls: Array<{ name: string; args?: Record<string, unknown> }> = []
  let counter = 0
  const client = {
    from(table: string) {
      return {
        select() {
          const eqs: string[] = []
          const chain: Record<string, unknown> = {
            eq(col: string) {
              eqs.push(col)
              return chain
            },
            order() {
              return chain
            },
            limit() {
              return chain
            },
            async maybeSingle() {
              if (table === 'nutrition_plan_versions_v2') {
                if (eqs.includes('publish_idempotency_key')) return { data: null, error: null }
                return {
                  data: opts.maxVersion != null ? { version_number: opts.maxVersion } : null,
                  error: null,
                }
              }
              if (table === 'clients') {
                return { data: { coach_id: 'coach-1', org_id: null, team_id: null }, error: null }
              }
              if (table === 'nutrition_plans_v2') return { data: opts.activePlanRow ?? null, error: null }
              return { data: null, error: null }
            },
            then(resolve: (v: unknown) => void) {
              resolve({ data: [], error: null })
            },
          }
          return chain
        },
        insert(rows: unknown) {
          inserts.push({ table, rows })
          return {
            select() {
              return {
                async single() {
                  counter += 1
                  return { data: { id: `${table}-${counter}` }, error: null }
                },
              }
            },
            then(resolve: (v: unknown) => void) {
              resolve({ data: null, error: null })
            },
          }
        },
      }
    },
    async rpc(name: string, args?: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      return { data: PUBLISHED_ID, error: null }
    },
  }
  return { client: client as unknown as NutritionV2WriteClient, inserts, rpcCalls }
}

function draftFor(clientId: string, planId: string | null = null): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    ...(planId ? { planId } : {}),
    clientId,
    name: 'Plan fuente',
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
  })
}

describe('NUT-004 — raiz unica de plan (RN)', () => {
  it('reusa la raiz activa HUERFANA (sin version publicada) en vez de insertar otra', async () => {
    const { client, inserts } = makeClient({
      activePlanRow: { id: PLAN_ROOT, current_published_version_id: null },
      maxVersion: 3,
    })
    const reusable = await resolveReusableUnpublishedPlanIdRN(client, SOURCE)
    expect(reusable).toEqual({ ok: true, planId: PLAN_ROOT })

    const res = await persistAndPublishDraft({
      db: client,
      userId: 'coach-1',
      draft: draftFor(SOURCE),
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
    })
    expect(res.ok).toBe(true)
    // Cero raices nuevas: nunca se inserta en nutrition_plans_v2.
    expect(inserts.map((i) => i.table)).not.toContain('nutrition_plans_v2')
    const version = inserts.find((i) => i.table === 'nutrition_plan_versions_v2')
    expect((version?.rows as { plan_id: string; version_number: number }).plan_id).toBe(PLAN_ROOT)
    // El versionado continua la linea de la raiz reusada (max+1), no reinicia en 1.
    expect((version?.rows as { version_number: number }).version_number).toBe(4)
  })

  it('NO reusa una raiz que ya tiene version publicada (esa ruta va por draft.planId)', async () => {
    const { client, inserts } = makeClient({
      activePlanRow: { id: PLAN_ROOT, current_published_version_id: VERSION_ID },
    })
    expect(await resolveReusableUnpublishedPlanIdRN(client, SOURCE)).toEqual({ ok: true, planId: null })

    const res = await persistAndPublishDraft({
      db: client,
      userId: 'coach-1',
      draft: draftFor(SOURCE),
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
    })
    expect(res.ok).toBe(true)
    expect(inserts.map((i) => i.table)).toContain('nutrition_plans_v2')
  })

  it('sin raiz activa crea la primera (comportamiento intacto)', async () => {
    const { client, inserts } = makeClient({ activePlanRow: null })
    expect(await resolveReusableUnpublishedPlanIdRN(client, SOURCE)).toEqual({ ok: true, planId: null })
    await persistAndPublishDraft({
      db: client,
      userId: 'coach-1',
      draft: draftFor(SOURCE),
      idempotencyKey: 'publish:key:abcdef',
      effectiveFrom: '2026-07-28',
    })
    expect(inserts.map((i) => i.table)).toContain('nutrition_plans_v2')
  })
})

// ---------------------------------------------------------------------------
// Fixture del read model del detalle (fuente de la asignacion).
// ---------------------------------------------------------------------------
function detailPayload(input: { versionId?: string; planName?: string } = {}) {
  const summary = {
    id: PLAN_ROOT,
    name: input.planName ?? 'Plan fuente',
    strategy: 'structured',
    versionId: input.versionId ?? VERSION_ID,
    versionNumber: 2,
    status: 'published',
    effectiveFrom: '2026-07-20',
    effectiveTo: null,
  }
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-28T12:00:00+00:00',
    client: { id: SOURCE, fullName: 'Alumno Fuente' },
    today: {
      schemaVersion: 1,
      generatedAt: '2026-07-28T12:00:00+00:00',
      localDate: '2026-07-28',
      timezone: 'America/Santiago',
      snapshotId: null,
      plan: summary,
      targets: {},
      consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0 },
      remaining: {},
      permissions: {},
      mealSlots: [],
      unassignedIntake: [],
      syncToken: 'sync-today-1',
    },
    plan: {
      schemaVersion: 1,
      generatedAt: '2026-07-28T12:00:00+00:00',
      asOfDate: '2026-07-28',
      timezone: 'America/Santiago',
      plan: summary,
      visibleNotes: null,
      protocolNotes: null,
      permissions: {},
      dayVariants: [
        {
          id: VARIANT_ID,
          key: 'default',
          label: 'Todos los dias',
          dayOfWeek: null,
          isDefault: true,
          targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60 },
          mealSlots: [
            {
              id: SLOT_ID,
              code: 'slot-1',
              name: 'Desayuno',
              startTime: '08:00',
              endTime: null,
              mode: 'anchor',
              required: false,
              instructions: null,
              targets: {},
              prescriptionItems: [
                {
                  id: ITEM_ID,
                  foodId: null,
                  recipeId: null,
                  name: 'Avena',
                  brand: null,
                  quantity: 80,
                  unit: 'g',
                  minimumQuantity: null,
                  maximumQuantity: null,
                  optional: false,
                  substitutionGroupId: null,
                  notes: null,
                  macros: { calories: 300, proteinG: 10, carbsG: 55, fatsG: 5, fiberG: null },
                },
              ],
            },
          ],
        },
      ],
      syncToken: 'sync-1',
    },
    recentDays: [],
    privateNote: null,
  }
}

function assignInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'coach-1',
    sourceClientId: SOURCE,
    sourceScope: SCOPE,
    expectedVersionId: VERSION_ID,
    today: '2026-07-28',
    targetClientIds: [TARGET],
    effectiveFrom: '2026-07-28',
    operationId: 'op-1234567890',
    hasNutritionPro: true,
    ...overrides,
  }
}

describe('NUT-012 — asignar copia la version FRESCA de la fuente', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('corta con SOURCE_VERSION_MISMATCH si la version vigente cambio (cache stale)', async () => {
    apiFetchMock.mockResolvedValue(detailPayload({ versionId: OTHER_VERSION_ID }))
    const { client, inserts, rpcCalls } = makeClient()
    const res = await assignNutritionPlanToClients({ db: client, ...assignInput() } as never)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('SOURCE_VERSION_MISMATCH')
      expect(res.error).toContain('El plan de origen cambió')
    }
    // Fail-closed: no se escribio NADA en ningun destino.
    expect(inserts).toHaveLength(0)
    expect(rpcCalls).toHaveLength(0)
  })

  it('si la relectura falla no copia nada (error ruidoso en vez de plan viejo)', async () => {
    apiFetchMock.mockRejectedValue(new Error('network'))
    const { client, inserts } = makeClient()
    const res = await assignNutritionPlanToClients({ db: client, ...assignInput() } as never)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('SOURCE_READ_FAILED')
    expect(inserts).toHaveLength(0)
  })

  it('con la version esperada publica en el destino usando la fuente RELEIDA', async () => {
    apiFetchMock.mockResolvedValue(detailPayload({ planName: 'Plan renombrado en el servidor' }))
    const { client, inserts, rpcCalls } = makeClient()
    const res = await assignNutritionPlanToClients({ db: client, ...assignInput() } as never)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.summary.succeeded).toBe(1)
      expect(res.results[0]).toMatchObject({ clientId: TARGET, ok: true })
    }
    // La relectura ocurrio (y no se uso ninguna copia de pantalla).
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
    const planInsert = inserts.find((i) => i.table === 'nutrition_plans_v2')
    expect((planInsert?.rows as { name: string; client_id: string }).name).toBe('Plan renombrado en el servidor')
    expect((planInsert?.rows as { client_id: string }).client_id).toBe(TARGET)
    expect(rpcCalls[0]?.name).toBe('publish_nutrition_plan_v2')
  })

  it('sin plan vigente en la fuente devuelve SOURCE_NO_PLAN', async () => {
    const payload = detailPayload()
    payload.plan.plan = null as never
    payload.today.plan = null as never
    apiFetchMock.mockResolvedValue(payload)
    const { client } = makeClient()
    const res = await assignNutritionPlanToClients({ db: client, ...assignInput() } as never)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('SOURCE_NO_PLAN')
  })
})
