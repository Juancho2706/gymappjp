import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W1.13.c (Ola de orden) — mitad «redirect liso» del gate de dominio, espejo del test de
 * `coach/workout-programs`. Protege el ORDEN: el gate corre ANTES del primer fetch del hub, así
 * un coach con Nutrición apagada no paga las queries de una pantalla que nunca se pinta.
 *
 * Recordá que esto es VISIBILIDAD, nunca autorización: RLS y los entitlements siguen intactos.
 */

const getCurrentCoachSession = vi.fn()
const getPreferredWorkspaceForRender = vi.fn()
const getNutritionCoachHubV2ForWeb = vi.fn()
const getNutritionCoachRosterV2ForWeb = vi.fn()
const getCoachOnboardingEmptyContext = vi.fn()
const assertDomainEnabled = vi.fn()

vi.mock('@/services/auth/current-coach.service', () => ({
  getCurrentCoachSession: (...args: unknown[]) => getCurrentCoachSession(...args),
}))

vi.mock('@/services/auth/workspace-render-cache', () => ({
  getPreferredWorkspaceForRender: (...args: unknown[]) => getPreferredWorkspaceForRender(...args),
}))

vi.mock('@/services/nutrition-v2-read.service', () => ({
  getNutritionCoachHubV2ForWeb: (...args: unknown[]) => getNutritionCoachHubV2ForWeb(...args),
  getNutritionCoachRosterV2ForWeb: (...args: unknown[]) => getNutritionCoachRosterV2ForWeb(...args),
  nutritionV2CoachScopeFromWorkspace: vi.fn(() => ({ kind: 'coach' })),
}))

vi.mock('@/components/nutrition-v2', () => ({
  NutritionPageShell: () => null,
}))

vi.mock('./_components/NutritionHubTabs', () => ({ NutritionHubTabs: () => null }))
vi.mock('./_components/NutritionFirstRunEmpty', () => ({ NutritionFirstRunEmpty: () => null }))
vi.mock('./_components/HubTourGuide', () => ({ HubTourGuide: () => null }))
vi.mock('./_components/HubRoster', () => ({ HubRoster: () => null }))
vi.mock('./_components/NewPlanPickerButton', () => ({ NewPlanPickerButton: () => null }))

vi.mock('./_lib/hub-roster', () => ({
  localDateOf: vi.fn(() => '2026-09-01'),
  mapHubMetrics: vi.fn(() => ({})),
  parseCursorScore: vi.fn(() => null),
  parseRosterFilters: vi.fn(() => ({ search: '', attention: 'all', sort: 'triage' })),
  serverSortFor: vi.fn(() => 'triage'),
}))

vi.mock('../_data/onboarding-empty.queries', () => ({
  getCoachOnboardingEmptyContext: (...args: unknown[]) => getCoachOnboardingEmptyContext(...args),
  templatesForSurface: vi.fn(() => []),
}))

vi.mock('@/services/feature-prefs.service', () => ({
  assertDomainEnabled: (...args: unknown[]) => assertDomainEnabled(...args),
}))

import CoachNutritionV2Page from './page'

describe('CoachNutritionV2Page — gate de dominio (W1.4a)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentCoachSession.mockResolvedValue({ user: { id: 'coach-1' } })
    getPreferredWorkspaceForRender.mockResolvedValue({ type: 'coach_team', teamId: 'team-1' })
    getNutritionCoachHubV2ForWeb.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })
    getNutritionCoachRosterV2ForWeb.mockResolvedValue({ items: [], hasMore: false })
    getCoachOnboardingEmptyContext.mockResolvedValue({
      persona: null,
      demoClientId: null,
      demoName: null,
      demoLabel: null,
      noun: 'alumno',
    })
    assertDomainEnabled.mockResolvedValue(undefined)
  })

  const searchParams = () => Promise.resolve({})

  it('con el dominio prendido: gatea con el contexto del workspace y sigue al fetch del hub', async () => {
    await CoachNutritionV2Page({ searchParams: searchParams() })

    expect(assertDomainEnabled).toHaveBeenCalledWith('nutrition', {
      coachId: 'coach-1',
      clientTeamId: 'team-1',
      // Enterprise ya salió por el redirect de arriba: acá el ctx nunca es de org.
      clientOrgId: null,
    })
    expect(getNutritionCoachHubV2ForWeb).toHaveBeenCalled()
  })

  it('con el dominio apagado: propaga el redirect y NO hace fetch de datos', async () => {
    // Sentinel que simula el throw de `redirect()` de Next (`NEXT_REDIRECT`).
    const nextRedirect = new Error('NEXT_REDIRECT')
    assertDomainEnabled.mockRejectedValue(nextRedirect)

    await expect(CoachNutritionV2Page({ searchParams: searchParams() })).rejects.toBe(nextRedirect)

    expect(getNutritionCoachHubV2ForWeb).not.toHaveBeenCalled()
    expect(getNutritionCoachRosterV2ForWeb).not.toHaveBeenCalled()
  })
})
