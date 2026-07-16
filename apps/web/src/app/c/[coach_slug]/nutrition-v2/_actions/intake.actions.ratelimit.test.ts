import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: vi.fn() }))
vi.mock('../../nutrition/_data/nutrition-auth.queries', () => ({ getClientNutritionUser: vi.fn() }))
vi.mock('../../nutrition/_data/client-scope.queries', () => ({ getClientScope: vi.fn() }))

const rateLimitNutritionCatalogSearch = vi.fn()
const rateLimitNutritionIntake = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  rateLimitNutritionCatalogSearch: (...a: unknown[]) => rateLimitNutritionCatalogSearch(...a),
  rateLimitNutritionIntake: (...a: unknown[]) => rateLimitNutritionIntake(...a),
}))

import { createClient } from '@/lib/supabase/server'
import { getClientNutritionUser } from '../../nutrition/_data/nutrition-auth.queries'
import { getClientScope } from '../../nutrition/_data/client-scope.queries'
import { searchFoodCatalogAction } from './intake.actions'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getClientNutritionUser).mockResolvedValue({ user: { id: CLIENT_ID }, hasClientRow: true } as never)
  rateLimitNutritionCatalogSearch.mockResolvedValue({ ok: true })
  rateLimitNutritionIntake.mockResolvedValue({ ok: true })
})

describe('searchFoodCatalogAction · rate limit', () => {
  it('propaga RATE_LIMITED (shape ActionFailure) sin tocar el scope ni la base', async () => {
    rateLimitNutritionCatalogSearch.mockResolvedValue({ ok: false, retryAfter: 45 })

    const res = await searchFoodCatalogAction({ clientId: CLIENT_ID, query: 'arroz' })

    expect(res).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
      error: 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.',
    })
    // Usa el cupo de catalogo (no el de registro) y corta antes de leer scope/base.
    expect(rateLimitNutritionCatalogSearch).toHaveBeenCalledWith(CLIENT_ID)
    expect(rateLimitNutritionIntake).not.toHaveBeenCalled()
    expect(getClientScope).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })
})
