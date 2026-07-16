import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/services/entitlements.service', () => ({ hasModule: vi.fn(), assertModule: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: vi.fn() }))
vi.mock('@/lib/date-utils', () => ({ getTodayInSantiago: vi.fn(() => ({ iso: '2026-07-16' })) }))
vi.mock('@/services/nutrition-v2-read.service', () => ({
  nutritionV2CoachScopeFromWorkspace: vi.fn(),
  getNutritionClientDetailV2ForWeb: vi.fn(),
  getNutritionCoachHubV2ForWeb: vi.fn(),
}))
vi.mock('@/app/coach/nutrition-plans/_data/nutrition-page.queries', () => ({
  getNutritionPlansPageCoach: vi.fn(),
}))

import { hasModule } from '@/services/entitlements.service'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { getNutritionPlansPageCoach } from '@/app/coach/nutrition-plans/_data/nutrition-page.queries'
import { assignPlanToClientsAction } from './nutrition-assign.actions'

const COACH = '22222222-2222-4222-8222-222222222222'
const SOURCE = '11111111-1111-4111-8111-111111111111'
const A = '33333333-3333-4333-8333-333333333333'
const B = '44444444-4444-4444-8444-444444444444'

function makeDb() {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: vi.fn(self),
      eq: vi.fn(self),
      order: vi.fn(self),
      limit: vi.fn(self),
      insert: vi.fn(self),
      single: vi.fn(async () => ({ data: { id: 'x' }, error: null })),
      maybeSingle: vi.fn(async () =>
        table === 'nutrition_plan_versions_v2'
          ? { data: { id: 'ver-x', plan_id: 'plan-x' }, error: null }
          : { data: null, error: null },
      ),
    })
    return chain
  })
  return { from, rpc: vi.fn(async () => ({ data: null, error: null })) }
}

let dbMock: ReturnType<typeof makeDb>

function detail(strategy: 'structured' | 'hybrid') {
  return {
    plan: {
      plan: { name: 'Plan', strategy, versionNumber: 3 },
      timezone: 'America/Santiago',
      visibleNotes: null,
      permissions: {
        canRegisterFreely: true,
        canAdjustPrescribedQuantity: true,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
      },
      dayVariants: [
        {
          key: 'default',
          label: 'Todos los dias',
          dayOfWeek: null,
          isDefault: true,
          targets: { calories: 2000, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null },
          mealSlots: strategy === 'structured'
            ? [{ code: 'slot-1', name: 'Desayuno', startTime: null, endTime: null, mode: 'anchor', required: false, instructions: null, targets: {}, prescriptionItems: [{ foodId: null, recipeId: null, name: 'Avena', quantity: 80, unit: 'g', minimumQuantity: null, maximumQuantity: null, optional: false, notes: null }] }]
            : [],
        },
      ],
    },
  }
}

function input(overrides: Record<string, unknown> = {}) {
  return { sourceClientId: SOURCE, targetClientIds: [A, B], effectiveFrom: '2026-07-20', operationId: 'op-1234567', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  dbMock = makeDb()
  vi.mocked(getNutritionPlansPageCoach).mockResolvedValue({ user: { id: COACH } } as never)
  vi.mocked(getPreferredWorkspaceForRender).mockResolvedValue({ type: 'coach_standalone' } as never)
  vi.mocked(isNutritionV2Enabled).mockResolvedValue(true)
  vi.mocked(nutritionV2CoachScopeFromWorkspace).mockReturnValue({ scopeType: 'standalone', teamId: null, orgId: null } as never)
  vi.mocked(createClient).mockResolvedValue(dbMock as never)
})

describe('assignPlanToClientsAction — validacion y gate Pro', () => {
  it('rechaza si la fuente esta en los destinos (antes de auth)', async () => {
    const res = await assignPlanToClientsAction(input({ targetClientIds: [A, SOURCE] }))
    expect(res).toMatchObject({ ok: false, code: 'SOURCE_IN_TARGETS' })
    expect(getNutritionPlansPageCoach).not.toHaveBeenCalled()
  })

  it('SIN addon: plan fuente hibrido => UPGRADE_REQUIRED, sin escribir', async () => {
    vi.mocked(getNutritionClientDetailV2ForWeb).mockResolvedValue(detail('hybrid') as never)
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await assignPlanToClientsAction(input())
    expect(res).toMatchObject({ ok: false, code: 'UPGRADE_REQUIRED', feature: 'hybrid_strategy' })
    expect(dbMock.from).not.toHaveBeenCalled()
  })

  it('CON addon: hibrido pasa el gate y asigna a cada alumno', async () => {
    vi.mocked(getNutritionClientDetailV2ForWeb).mockResolvedValue(detail('hybrid') as never)
    vi.mocked(hasModule).mockResolvedValue(true)
    const res = await assignPlanToClientsAction(input())
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.summary).toEqual({ total: 2, succeeded: 2, failed: 0 })
    }
  })

  it('BASE sin addon: structured con 1 variante asigna sin consultar el entitlement', async () => {
    vi.mocked(getNutritionClientDetailV2ForWeb).mockResolvedValue(detail('structured') as never)
    vi.mocked(hasModule).mockResolvedValue(false)
    const res = await assignPlanToClientsAction(input())
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.summary.succeeded).toBe(2)
    expect(hasModule).not.toHaveBeenCalled()
  })
})
