import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPreferredWorkspaceForRender = vi.fn()

vi.mock('@/services/auth/workspace-render-cache', () => ({
  getPreferredWorkspaceForRender: (coachId: string) => getPreferredWorkspaceForRender(coachId),
}))

import { nutritionV2ClientPath, shouldSwapCockpitToNutritionV2 } from './nutrition-v2-swap'

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

describe('nutritionV2ClientPath — destino del editor por alumno', () => {
  it('interpola el id cuando parece uuid', () => {
    expect(nutritionV2ClientPath('22222222-2222-4222-8222-222222222222')).toBe(
      '/coach/nutrition-v2/22222222-2222-4222-8222-222222222222',
    )
  })

  it('acepta uuids de seed fuera de RFC (nibble de versión libre)', () => {
    expect(nutritionV2ClientPath('00000000-0000-0000-0000-000000000001')).toBe(
      '/coach/nutrition-v2/00000000-0000-0000-0000-000000000001',
    )
  })

  it('cae al Centro V2 con segmentos que no son uuid', () => {
    for (const bad of ['', 'null', 'undefined', 'nuevo', '../../admin', '22222222-2222-4222-8222']) {
      expect(nutritionV2ClientPath(bad)).toBe('/coach/nutrition-v2')
    }
    expect(nutritionV2ClientPath(null)).toBe('/coach/nutrition-v2')
    expect(nutritionV2ClientPath(undefined)).toBe('/coach/nutrition-v2')
  })
})
