import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPreferredWorkspaceForRender = vi.fn()

vi.mock('@/services/auth/workspace-render-cache', () => ({
  getPreferredWorkspaceForRender: (coachId: string) => getPreferredWorkspaceForRender(coachId),
}))

import { shouldSwapCockpitToNutritionV2 } from './nutrition-v2-swap'

const COACH = '11111111-1111-4111-8111-111111111111'

describe('shouldSwapCockpitToNutritionV2 — redirección legacy', () => {
  beforeEach(() => {
    getPreferredWorkspaceForRender.mockReset()
  })

  it('standalone redirige al Centro V2', async () => {
    getPreferredWorkspaceForRender.mockResolvedValue({ type: 'coach_standalone' })
    await expect(shouldSwapCockpitToNutritionV2(COACH)).resolves.toBe(true)
  })

  it('Team redirige al Centro V2', async () => {
    getPreferredWorkspaceForRender.mockResolvedValue({ type: 'coach_team', teamId: 'team-9' })
    await expect(shouldSwapCockpitToNutritionV2(COACH)).resolves.toBe(true)
  })

  it('Enterprise o un workspace desconocido conservan la ruta aislada', async () => {
    getPreferredWorkspaceForRender.mockResolvedValue({ type: 'enterprise_coach', orgId: 'org-3' })
    await expect(shouldSwapCockpitToNutritionV2(COACH)).resolves.toBe(false)

    getPreferredWorkspaceForRender.mockResolvedValue(null)
    await expect(shouldSwapCockpitToNutritionV2(COACH)).resolves.toBe(false)
  })
})
