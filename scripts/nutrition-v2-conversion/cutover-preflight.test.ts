import { describe, expect, it } from 'vitest'
import { evaluateNutritionV2Cutover } from './cutover-preflight'

const V1 = {
  id: 'v1-a',
  clientId: 'client-a',
  coachId: 'coach-a',
  updatedAt: '2026-07-31T10:00:00.000Z',
  workspace: 'standalone' as const,
}

const LINK = {
  v1PlanId: 'v1-a',
  v2PlanId: 'v2-a',
  v2VersionId: 'version-a',
  clientId: 'client-a',
  coachId: 'coach-a',
  lastSyncedV1UpdatedAt: '2026-07-31T10:00:00.000Z',
}

const V2_PLAN = {
  id: 'v2-a',
  clientId: 'client-a',
  coachId: 'coach-a',
  lifecycleStatus: 'active',
  currentPublishedVersionId: 'version-a',
}

const V2_VERSION = { id: 'version-a', planId: 'v2-a', status: 'published' }

describe('evaluateNutritionV2Cutover', () => {
  it('verifica una conversión trazable, vigente y sin drift de V1', () => {
    const report = evaluateNutritionV2Cutover({
      activeV1Plans: [V1],
      links: [LINK],
      v2Plans: [V2_PLAN],
      v2Versions: [V2_VERSION],
    })
    expect(report.blockerCount).toBe(0)
    expect(report.verifiedPlanIds).toEqual(['v1-a'])
  })

  it('bloquea un V2 nativo que aún no tiene enlace de conversión', () => {
    const report = evaluateNutritionV2Cutover({
      activeV1Plans: [V1],
      links: [],
      v2Plans: [V2_PLAN],
      v2Versions: [V2_VERSION],
    })
    expect(report.assessments[0]?.blocker).toBe('missing_conversion_link')
  })

  it('acepta una versión de conversión superseded cuando el plan tiene una vigente posterior', () => {
    const report = evaluateNutritionV2Cutover({
      activeV1Plans: [V1],
      links: [LINK],
      v2Plans: [{ ...V2_PLAN, currentPublishedVersionId: 'version-new' }],
      v2Versions: [{ ...V2_VERSION, status: 'superseded' }, { id: 'version-new', planId: 'v2-a', status: 'published' }],
    })
    expect(report.blockerCount).toBe(0)
  })

  it('bloquea drift posterior a la conversión y V1 activo de alumno archivado', () => {
    const report = evaluateNutritionV2Cutover({
      activeV1Plans: [
        { ...V1, updatedAt: '2026-08-01T10:00:00.000Z' },
        { ...V1, id: 'v1-archived', workspace: 'archived' },
      ],
      links: [LINK],
      v2Plans: [V2_PLAN],
      v2Versions: [V2_VERSION],
    })
    expect(report.assessments.map((assessment) => assessment.blocker)).toEqual([
      'v1_changed_after_conversion',
      'archived_client_has_active_v1',
    ])
  })

  it('deja Enterprise fuera de este corte sin presentarlo como conversión V2 válida', () => {
    const report = evaluateNutritionV2Cutover({
      activeV1Plans: [{ ...V1, workspace: 'enterprise' }],
      links: [],
      v2Plans: [],
      v2Versions: [],
    })
    expect(report.blockerCount).toBe(0)
    expect(report.outOfScopeCount).toBe(1)
  })
})
