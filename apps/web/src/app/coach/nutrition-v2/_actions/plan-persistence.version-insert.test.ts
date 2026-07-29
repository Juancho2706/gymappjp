import { describe, expect, it, vi } from 'vitest'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

// Mocks de modulos server-only cargados por plan-persistence (mismo patron que
// plan-persistence.orphan-reuse.test.ts). La rutina bajo prueba solo usa el `db` inyectado.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({ nutritionV2CoachScopeFromWorkspace: vi.fn() }))
vi.mock('@/app/coach/nutrition-plans/_data/nutrition-page.queries', () => ({
  getNutritionPlansPageCoach: vi.fn(),
}))

import { persistAndPublishDraft, type NutritionV2Db } from './plan-persistence'

const CLIENT = '6a8adf41-f971-45ca-9e62-69aa2d9638c4'
const COACH = '22222222-2222-4222-8222-222222222222'
const PLAN = '44444444-4444-4444-8444-444444444444'
const VERSION = '55555555-5555-4555-8555-555555555555'

function flexibleDraft(): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    planId: PLAN,
    clientId: CLIENT,
    name: 'Plan',
    strategy: 'flexible',
    effectiveFrom: '2026-07-28',
    permissions: {},
    visibleNotes: 'Toma agua',
    // El contrato ADMITE privateNotes (un cliente forjado podria mandarlas); la persistencia
    // no debe reenviarlas a la columna deprecada.
    privateNotes: 'nota clinica que nadie puede leer',
    protocolNotes: null,
    dayVariants: [
      { key: 'default', label: 'Todos los dias', default: true, targets: { calories: 2000 }, mealSlots: [] },
    ],
  })
}

interface Captured {
  table: string
  rows: Record<string, unknown> | Record<string, unknown>[]
}

/** DB fake minima: captura los inserts y responde los lookups del camino feliz. */
function makeDb(captured: Captured[]): NutritionV2Db {
  return {
    from(table: string) {
      let selectCols = ''
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: (cols: string) => {
          selectCols = cols
          return chain
        },
        eq: self,
        order: self,
        limit: self,
        maybeSingle: async () => {
          if (table === 'nutrition_plan_versions_v2') {
            // 1) lookup de idempotencia (id, plan_id) => sin version previa.
            if (selectCols.includes('plan_id')) return { data: null, error: null }
            // 2) max(version_number) del plan.
            return { data: { version_number: 3 }, error: null }
          }
          if (table === 'clients') {
            return { data: { coach_id: COACH, org_id: null, team_id: null }, error: null }
          }
          if (table === 'nutrition_plans_v2') {
            return { data: { id: PLAN, client_id: CLIENT }, error: null }
          }
          return { data: null, error: null }
        },
        insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          captured.push({ table, rows })
          return {
            select: () => ({
              single: async () => ({
                data: { id: table === 'nutrition_plan_versions_v2' ? VERSION : 'row-1' },
                error: null,
              }),
            }),
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }
        },
      })
      return chain
    },
    rpc: vi.fn(async () => ({ data: VERSION, error: null })),
  } as unknown as NutritionV2Db
}

describe('persistAndPublishDraft — insert de la version', () => {
  it('NUT-007: el payload NO incluye private_notes (columna deprecada e ilegible)', async () => {
    const captured: Captured[] = []
    const db = makeDb(captured)

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: flexibleDraft(),
      idempotencyKey: 'idem-key-0001',
      effectiveFrom: '2026-07-28',
    })

    expect(res.ok).toBe(true)
    const versionInsert = captured.find((c) => c.table === 'nutrition_plan_versions_v2')
    expect(versionInsert).toBeDefined()
    const row = versionInsert!.rows as Record<string, unknown>
    expect(Object.keys(row)).not.toContain('private_notes')
    // El resto de las notas sigue viajando igual (no es una poda a ciegas).
    expect(row.visible_notes).toBe('Toma agua')
    expect(row.protocol_notes).toBeNull()
    expect(row.version_number).toBe(4)
  })

  it('propaga el compare-and-swap al RPC cuando el caller manda expectedCurrentVersionId', async () => {
    const captured: Captured[] = []
    const db = makeDb(captured)
    const base = '77777777-7777-4777-8777-777777777777'

    await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: flexibleDraft(),
      idempotencyKey: 'idem-key-0002',
      effectiveFrom: '2026-07-28',
      expectedCurrentVersionId: base,
    })

    const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
    expect(rpc).toHaveBeenCalledWith(
      'publish_nutrition_plan_v2',
      expect.objectContaining({ p_expected_current_version_id: base }),
    )
  })

  it('sin CAS el RPC no recibe la clave (builder de plan nuevo: comportamiento intacto)', async () => {
    const captured: Captured[] = []
    const db = makeDb(captured)

    await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: flexibleDraft(),
      idempotencyKey: 'idem-key-0003',
      effectiveFrom: '2026-07-28',
    })

    const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>
    const args = rpc.mock.calls[0][1] as Record<string, unknown>
    expect(args).not.toHaveProperty('p_expected_current_version_id')
  })
})
