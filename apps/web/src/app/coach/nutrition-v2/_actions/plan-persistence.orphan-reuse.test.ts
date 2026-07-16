import { describe, expect, it, vi } from 'vitest'

// Mocks de modulos server-only cargados por plan-persistence (mismo patron que
// nutrition-assign.actions.gating.test.ts). El helper bajo prueba solo usa el `db` inyectado.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({
  nutritionV2CoachScopeFromWorkspace: vi.fn(),
}))
vi.mock('@/app/coach/nutrition-plans/_data/nutrition-page.queries', () => ({
  getNutritionPlansPageCoach: vi.fn(),
}))

import { resolveReusableUnpublishedPlanId, type NutritionV2Db } from './plan-persistence'

const CLIENT = '6a8adf41-f971-45ca-9e62-69aa2d9638c4'

function dbReturning(row: unknown, error: unknown = null): NutritionV2Db {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: vi.fn(self),
    eq: vi.fn(self),
    order: vi.fn(self),
    limit: vi.fn(self),
    maybeSingle: vi.fn(async () => ({ data: row, error })),
  })
  return { from: vi.fn(() => chain), rpc: vi.fn() } as unknown as NutritionV2Db
}

describe('resolveReusableUnpublishedPlanId', () => {
  it('reutiliza el plan activo huerfano (sin version publicada)', async () => {
    const db = dbReturning({ id: 'orphan-1', current_published_version_id: null })
    const res = await resolveReusableUnpublishedPlanId(db, CLIENT)
    expect(res).toEqual({ ok: true, planId: 'orphan-1' })
  })

  it('NO reutiliza un plan que ya tiene version publicada', async () => {
    const db = dbReturning({ id: 'good-1', current_published_version_id: 'ver-1' })
    const res = await resolveReusableUnpublishedPlanId(db, CLIENT)
    expect(res).toEqual({ ok: true, planId: null })
  })

  it('devuelve planId null cuando el alumno no tiene plan activo', async () => {
    const db = dbReturning(null)
    const res = await resolveReusableUnpublishedPlanId(db, CLIENT)
    expect(res).toEqual({ ok: true, planId: null })
  })

  it('propaga un error de DB como ActionFailure (no crea plan)', async () => {
    const db = dbReturning(null, { message: 'boom', code: 'XX000' })
    const res = await resolveReusableUnpublishedPlanId(db, CLIENT)
    expect(res.ok).toBe(false)
  })
})
