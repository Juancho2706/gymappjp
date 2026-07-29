import { describe, expect, it, vi } from 'vitest'
import { resolveLegacyNutritionEntry } from './legacy-entry-order'

interface Scope {
  coachId: string | null
  teamId: string | null
  orgId: string | null
}

const SCOPE: Scope = { coachId: 'coach-1', teamId: null, orgId: null }

describe('resolveLegacyNutritionEntry (NUT-015 — orden del gate V2)', () => {
  it('redirige a V2 sin leer NUNCA el plan V1 (alumno nativo V2, sin fila V1)', async () => {
    const loadV1Plan = vi.fn(async () => null)
    const isV2Enabled = vi.fn(async () => true)

    const entry = await resolveLegacyNutritionEntry({
      loadScope: async () => SCOPE,
      isV2Enabled,
      loadV1Plan,
    })

    expect(entry).toEqual({ kind: 'redirect-v2', scope: SCOPE })
    // El bug original: el early-return por plan V1 ausente precedía al gate.
    expect(loadV1Plan).not.toHaveBeenCalled()
  })

  it('redirige a V2 aun cuando el alumno SÍ tiene plan V1 (migrado), sin pagar la query', async () => {
    const loadV1Plan = vi.fn(async () => ({ id: 'plan-v1' }))

    const entry = await resolveLegacyNutritionEntry({
      loadScope: async () => SCOPE,
      isV2Enabled: async () => true,
      loadV1Plan,
    })

    expect(entry.kind).toBe('redirect-v2')
    expect(loadV1Plan).not.toHaveBeenCalled()
  })

  it('con V2 OFF y sin plan V1 devuelve el empty-state legacy (fail-closed intacto)', async () => {
    const entry = await resolveLegacyNutritionEntry({
      loadScope: async () => SCOPE,
      isV2Enabled: async () => false,
      loadV1Plan: async () => null,
    })

    expect(entry).toEqual({ kind: 'no-v1-plan', scope: SCOPE })
  })

  it('con V2 OFF y plan V1 vigente devuelve la rama V1 con el plan', async () => {
    const plan = { id: 'plan-v1' }
    const entry = await resolveLegacyNutritionEntry({
      loadScope: async () => SCOPE,
      isV2Enabled: async () => false,
      loadV1Plan: async () => plan,
    })

    expect(entry).toEqual({ kind: 'v1', scope: SCOPE, plan })
  })

  it('el gate recibe el scope ya resuelto (coach/team/org del alumno)', async () => {
    const isV2Enabled = vi.fn(async () => false)
    await resolveLegacyNutritionEntry({
      loadScope: async () => ({ coachId: 'c', teamId: 't', orgId: 'o' }),
      isV2Enabled,
      loadV1Plan: async () => null,
    })
    expect(isV2Enabled).toHaveBeenCalledWith({ coachId: 'c', teamId: 't', orgId: 'o' })
  })
})
