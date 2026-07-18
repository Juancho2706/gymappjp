import { beforeEach, describe, expect, it, vi } from 'vitest'

const isNutritionV2Enabled = vi.fn()
const getPreferredWorkspaceForRender = vi.fn()

vi.mock('@/services/nutrition-v2-rollout.service', () => ({
  isNutritionV2Enabled: (ctx: unknown) => isNutritionV2Enabled(ctx),
}))
vi.mock('@/services/auth/workspace-render-cache', () => ({
  getPreferredWorkspaceForRender: (coachId: string) => getPreferredWorkspaceForRender(coachId),
}))

import { shouldSwapCockpitToNutritionV2 } from './nutrition-v2-swap'

const COACH = '11111111-1111-4111-8111-111111111111'

describe('shouldSwapCockpitToNutritionV2 — decisión del swap del cockpit (canary, reversible)', () => {
  beforeEach(() => {
    isNutritionV2Enabled.mockReset()
    getPreferredWorkspaceForRender.mockReset()
  })

  it('gate ON ⇒ true (la page redirige a /coach/nutrition-v2)', async () => {
    getPreferredWorkspaceForRender.mockResolvedValue(null)
    isNutritionV2Enabled.mockResolvedValue(true)
    await expect(shouldSwapCockpitToNutritionV2(COACH)).resolves.toBe(true)
  })

  it('gate OFF ⇒ false (la page V1 queda intacta, sin redirect ⇒ render V1)', async () => {
    getPreferredWorkspaceForRender.mockResolvedValue(null)
    isNutritionV2Enabled.mockResolvedValue(false)
    await expect(shouldSwapCockpitToNutritionV2(COACH)).resolves.toBe(false)
  })

  it('standalone / sin workspace ⇒ contexto webCoach con teamId y orgId null (mismo shape que el hub V2 ⇒ sin loop)', async () => {
    getPreferredWorkspaceForRender.mockResolvedValue(null)
    isNutritionV2Enabled.mockResolvedValue(false)
    await shouldSwapCockpitToNutritionV2(COACH)
    expect(isNutritionV2Enabled).toHaveBeenCalledWith({
      surface: 'webCoach',
      userId: COACH,
      coachId: COACH,
      teamId: null,
      orgId: null,
    })
  })

  it('coach_team ⇒ propaga teamId (orgId null)', async () => {
    getPreferredWorkspaceForRender.mockResolvedValue({ type: 'coach_team', teamId: 'team-9' })
    isNutritionV2Enabled.mockResolvedValue(true)
    await shouldSwapCockpitToNutritionV2(COACH)
    expect(isNutritionV2Enabled).toHaveBeenCalledWith({
      surface: 'webCoach',
      userId: COACH,
      coachId: COACH,
      teamId: 'team-9',
      orgId: null,
    })
  })

  it('enterprise_coach ⇒ propaga orgId (teamId null)', async () => {
    getPreferredWorkspaceForRender.mockResolvedValue({ type: 'enterprise_coach', orgId: 'org-3' })
    isNutritionV2Enabled.mockResolvedValue(false)
    await shouldSwapCockpitToNutritionV2(COACH)
    expect(isNutritionV2Enabled).toHaveBeenCalledWith({
      surface: 'webCoach',
      userId: COACH,
      coachId: COACH,
      teamId: null,
      orgId: 'org-3',
    })
  })
})
