import { describe, expect, it } from 'vitest'
import { foodWorkspaceFilter } from '../apps/mobile/lib/foods-scope'

const COACH = '11111111-1111-4111-8111-111111111111'
const ORG = '33333333-3333-4333-8333-333333333333'

describe('mobile foods · scope de workspace (4B-02)', () => {
  it('enterprise (org activa): sistema + alimentos de la org, sin los propios del coach', () => {
    // Espejo del web: enterprise ignora el catálogo personal del coach.
    expect(foodWorkspaceFilter(COACH, ORG)).toBe(
      `and(coach_id.is.null,org_id.is.null),org_id.eq.${ORG}`,
    )
    // El org filter no depende del coachId: mismo resultado sin coach.
    expect(foodWorkspaceFilter(null, ORG)).toBe(
      `and(coach_id.is.null,org_id.is.null),org_id.eq.${ORG}`,
    )
  })

  it('standalone (coach sin org): sistema + alimentos propios del coach', () => {
    expect(foodWorkspaceFilter(COACH, null)).toBe(
      `and(coach_id.is.null,org_id.is.null),and(coach_id.eq.${COACH},org_id.is.null)`,
    )
  })

  it('sin coach ni org (fail-closed): solo alimentos del sistema', () => {
    expect(foodWorkspaceFilter(null, null)).toBe('and(coach_id.is.null,org_id.is.null)')
  })
})
