import { describe, expect, it, vi } from 'vitest'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

// Mocks de modulos server-only cargados por plan-persistence (mismo patron que
// plan-persistence.orphan-reuse.test.ts). El helper bajo prueba solo usa el `db` inyectado.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({ nutritionV2CoachScopeFromWorkspace: vi.fn() }))
vi.mock('@/app/coach/nutrition-plans/_data/nutrition-page.queries', () => ({
  getNutritionPlansPageCoach: vi.fn(),
}))

import { resolveExchangeGroupsForDraft, type NutritionV2Db } from './plan-persistence'

const CLIENT_ID = '6a8adf41-f971-45ca-9e62-69aa2d9638c4'
const LEG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const C_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const P_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

interface GroupRow {
  id: string
  code: string
  name: string
  ref_calories: number
  ref_protein_g: number
  ref_carbs_g: number
  ref_fats_g: number
  composed_of: Array<{ code: string; portions: number }> | null
  macros_confirmed: boolean
  is_system: boolean
}

const C_ROW: GroupRow = {
  id: C_ID, code: 'C', name: 'Cereales', ref_calories: 70, ref_protein_g: 2, ref_carbs_g: 15,
  ref_fats_g: 0, composed_of: null, macros_confirmed: true, is_system: true,
}
const P_ROW: GroupRow = {
  id: P_ID, code: 'P', name: 'Proteinas', ref_calories: 75, ref_protein_g: 7, ref_carbs_g: 0,
  ref_fats_g: 5, composed_of: null, macros_confirmed: true, is_system: true,
}
const LEG_ROW: GroupRow = {
  id: LEG_ID, code: 'LEG', name: 'Leguminosas', ref_calories: 145, ref_protein_g: 9, ref_carbs_g: 15,
  ref_fats_g: 5, composed_of: [{ code: 'P', portions: 1 }, { code: 'C', portions: 1 }],
  macros_confirmed: false, is_system: true,
}

/** DB mock que enruta cada maybeSingle por tabla + filtros `.eq` acumulados. */
function makeDb(resolve: (table: string, filters: Record<string, unknown>) => { data: unknown; error: unknown }): NutritionV2Db {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const chain: Record<string, unknown> = {}
      Object.assign(chain, {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val
          return chain
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => resolve(table, filters),
      })
      return chain
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  } as unknown as NutritionV2Db
}

function draftWith(exchangeTargets: Array<{ exchangeGroupId: string; portions: number }>): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    clientId: CLIENT_ID,
    name: 'Plan',
    strategy: 'structured',
    effectiveFrom: '2026-07-20',
    permissions: {},
    dayVariants: [
      {
        key: 'default',
        label: 'Todos los dias',
        default: true,
        targets: {},
        mealSlots: [{ code: 'slot-1', name: 'Almuerzo', items: [], exchangeTargets }],
      },
    ],
  })
}

describe('resolveExchangeGroupsForDraft', () => {
  it('draft sin porciones ⇒ mapas vacios (Q1: cero lecturas nuevas)', async () => {
    const db = makeDb(() => ({ data: null, error: null }))
    const draft = draftWith([])
    const res = await resolveExchangeGroupsForDraft(db, draft)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.groups.byId.size).toBe(0)
      expect(res.groups.byCode.size).toBe(0)
    }
  })

  it('resuelve grupo directo simple por id', async () => {
    const db = makeDb((table, f) => {
      if (table === 'exchange_groups' && f.id === C_ID) return { data: C_ROW, error: null }
      return { data: null, error: null }
    })
    const res = await resolveExchangeGroupsForDraft(db, draftWith([{ exchangeGroupId: C_ID, portions: 2 }]))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.groups.byId.get(C_ID)?.code).toBe('C')
      expect(res.groups.byId.get(C_ID)?.refCarbsG).toBe(15)
    }
  })

  it('resuelve LEG por id y sus bases P/C por codigo (system) para enriquecer', async () => {
    const db = makeDb((table, f) => {
      if (table !== 'exchange_groups') return { data: null, error: null }
      if (f.id === LEG_ID) return { data: LEG_ROW, error: null }
      if (f.code === 'P' && f.is_system === true) return { data: P_ROW, error: null }
      if (f.code === 'C' && f.is_system === true) return { data: C_ROW, error: null }
      return { data: null, error: null }
    })
    const res = await resolveExchangeGroupsForDraft(db, draftWith([{ exchangeGroupId: LEG_ID, portions: 1 }]))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.groups.byId.get(LEG_ID)?.composedOf).toEqual([
        { code: 'P', portions: 1 },
        { code: 'C', portions: 1 },
      ])
      expect(res.groups.byCode.get('P')?.refCalories).toBe(75)
      expect(res.groups.byCode.get('C')?.refCarbsG).toBe(15)
    }
  })

  it('no re-consulta un base que ya vino como grupo directo (LEG + C juntos)', async () => {
    const codeQueries: string[] = []
    const db = makeDb((table, f) => {
      if (table !== 'exchange_groups') return { data: null, error: null }
      if (f.id === LEG_ID) return { data: LEG_ROW, error: null }
      if (f.id === C_ID) return { data: C_ROW, error: null }
      if (typeof f.code === 'string') {
        codeQueries.push(f.code)
        if (f.code === 'P') return { data: P_ROW, error: null }
      }
      return { data: null, error: null }
    })
    const res = await resolveExchangeGroupsForDraft(
      db,
      draftWith([
        { exchangeGroupId: LEG_ID, portions: 1 },
        { exchangeGroupId: C_ID, portions: 2 },
      ]),
    )
    expect(res.ok).toBe(true)
    // C ya estaba resuelto por id ⇒ solo P se busca por codigo.
    expect(codeQueries).toEqual(['P'])
  })

  it('grupo directo inexistente/soft-borrado ⇒ ActionFailure explicito (nunca snapshot NULL)', async () => {
    const db = makeDb(() => ({ data: null, error: null }))
    const res = await resolveExchangeGroupsForDraft(db, draftWith([{ exchangeGroupId: C_ID, portions: 2 }]))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('EXCHANGE_GROUP_NOT_FOUND')
  })

  it('base de compuesto inexistente ⇒ EXCHANGE_BASE_GROUP_NOT_FOUND', async () => {
    const db = makeDb((table, f) => {
      if (table === 'exchange_groups' && f.id === LEG_ID) return { data: LEG_ROW, error: null }
      return { data: null, error: null }
    })
    const res = await resolveExchangeGroupsForDraft(db, draftWith([{ exchangeGroupId: LEG_ID, portions: 1 }]))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('EXCHANGE_BASE_GROUP_NOT_FOUND')
  })

  it('propaga error de DB como ActionFailure', async () => {
    const db = makeDb(() => ({ data: null, error: { message: 'boom', code: 'XX000' } }))
    const res = await resolveExchangeGroupsForDraft(db, draftWith([{ exchangeGroupId: C_ID, portions: 2 }]))
    expect(res.ok).toBe(false)
  })
})
