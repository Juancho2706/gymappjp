import { describe, expect, it, vi } from 'vitest'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

// Mocks de modulos server-only cargados por plan-persistence (mismo patron que
// nutrition-assign.actions.gating.test.ts). El helper bajo prueba solo usa el `db` inyectado.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({
  nutritionV2CoachScopeFromWorkspace: vi.fn(),
}))
vi.mock('@/services/auth/current-coach.service', () => ({
  getCurrentCoachSession: vi.fn(),
}))

import { persistAndPublishDraft, type NutritionV2Db } from './plan-persistence'

const CLIENT = '6a8adf41-f971-45ca-9e62-69aa2d9638c4'
const COACH = '22222222-2222-4222-8222-222222222222'
const PLAN = '44444444-4444-4444-8444-444444444444'
const VERSION = '55555555-5555-4555-8555-555555555555'

// ============================================================================
// NUT-011 — la resolucion de la raiz dejo de vivir en TS.
//
// Este archivo probaba `resolveReusableUnpublishedPlanId`: un helper TS que decidia si
// reutilizar un plan activo sin version publicada. Esa decision AHORA la toma
// `public.persist_and_publish_nutrition_plan_v2` dentro de la transaccion y bajo el lock por
// alumno — la unica forma de que "resolver la raiz" y "escribir la version" no puedan
// separarse. Mantener ademas la copia TS era el patron exacto de drift que denuncia la
// auditoria (dos implementaciones de la misma regla, una por plataforma).
//
// Las CUATRO intenciones originales se conservan, movidas a la capa donde ahora viven:
//   1. reutiliza el plan activo huerfano (sin version publicada)   -> SQL, caso "raiz huerfana"
//   2. NO reutiliza un plan que ya tiene version publicada         -> SQL, caso "raiz viva"
//   3. planId null cuando el alumno no tiene plan activo           -> SQL, caso "sin plan"
//   4. un error no crea plan (sin efectos)                         -> SQL (rollback) + aqui
// Los tres primeros viven en `supabase/tests/nutrition_v2_persist_and_publish_rollback.sql`.
// Aqui se prueba lo que SIGUE siendo responsabilidad del thin caller: delegar la decision
// (no resolverla), pasar la raiz explicita cuando el draft la trae, y no dejar efectos.
// ============================================================================

function draftWithPlanId(planId: string | null): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    ...(planId ? { planId } : {}),
    clientId: CLIENT,
    name: 'Plan',
    strategy: 'flexible',
    effectiveFrom: '2026-07-28',
    permissions: {},
    dayVariants: [
      { key: 'default', label: 'Todos los dias', default: true, targets: { calories: 2000 }, mealSlots: [] },
    ],
  })
}

interface Touched {
  table: string
  op: 'select' | 'insert'
}

function makeDb(
  rpcImpl: () => Promise<{ data: unknown; error: unknown }>,
  touched: Touched[] = [],
): NutritionV2Db {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: () => {
          touched.push({ table, op: 'select' })
          return chain
        },
        eq: self,
        order: self,
        limit: self,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: () => {
          touched.push({ table, op: 'insert' })
          return {
            select: () => ({ single: async () => ({ data: { id: 'row-1' }, error: null }) }),
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }
        },
      })
      return chain
    },
    rpc: vi.fn(rpcImpl),
  } as unknown as NutritionV2Db
}

const okRpc = async () => ({ data: { versionId: VERSION, planId: PLAN }, error: null })

describe('persistAndPublishDraft — resolucion de la raiz delegada a la RPC', () => {
  it('sin planId en el draft NO resuelve la raiz en el cliente: delega en la RPC', async () => {
    const touched: Touched[] = []
    const db = makeDb(okRpc, touched)

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draftWithPlanId(null),
      idempotencyKey: 'idem-key-0001',
      effectiveFrom: '2026-07-28',
    })

    expect(res).toEqual({ ok: true, versionId: VERSION, planId: PLAN })
    // Ni una lectura de planes: la eleccion "reusar huerfano / crear" es server-side.
    expect(touched.filter((t) => t.table === 'nutrition_plans_v2')).toEqual([])
    const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
    const args = rpc.mock.calls[0][1] as Record<string, unknown>
    // Sin raiz declarada => la RPC decide (y limpia el draft parcial del huerfano).
    expect(args).not.toHaveProperty('p_plan_id')
  })

  it('con planId en el draft manda la raiz explicita (append sobre el plan vivo)', async () => {
    const db = makeDb(okRpc)

    await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draftWithPlanId(PLAN),
      idempotencyKey: 'idem-key-0002',
      effectiveFrom: '2026-07-28',
    })

    const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
    expect((rpc.mock.calls[0][1] as Record<string, unknown>).p_plan_id).toBe(PLAN)
  })

  it('raiz ajena al alumno => PLAN_NOT_FOUND tipado (mismo codigo que el camino anterior)', async () => {
    const db = makeDb(async () => ({
      data: null,
      error: { message: 'nutrition_v2_persist_plan_not_found', code: 'P0002' },
    }))

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draftWithPlanId(PLAN),
      idempotencyKey: 'idem-key-0003',
      effectiveFrom: '2026-07-28',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('PLAN_NOT_FOUND')
      expect(res.error).toBe('El plan indicado no pertenece a este alumno.')
    }
  })

  it('alumno fuera del pool => CLIENT_NOT_FOUND y ninguna escritura', async () => {
    const touched: Touched[] = []
    const db = makeDb(
      async () => ({ data: null, error: { message: 'nutrition_v2_persist_client_not_found', code: 'P0002' } }),
      touched,
    )

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draftWithPlanId(null),
      idempotencyKey: 'idem-key-0004',
      effectiveFrom: '2026-07-28',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('CLIENT_NOT_FOUND')
    expect(touched.filter((t) => t.op === 'insert')).toEqual([])
  })
})
