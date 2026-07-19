import { describe, expect, it } from 'vitest'
import type { NutritionClientDetailReadModel } from '@eva/nutrition-v2'
import {
  buildNutritionTabV2ViewModel,
  formatLocalDateEsCl,
} from '../apps/mobile/lib/coach-nutrition-v2-tab-logic'

type PlanOverride = {
  strategy: 'structured' | 'flexible' | 'hybrid'
  name: string
  versionNumber: number
  status: 'published' | 'superseded'
}

/**
 * Fixture mínimo del read model V2: el view model lee client.fullName,
 * today.{plan,consumed,targets,remaining} y plan.{plan,visibleNotes}; construimos
 * exactamente esos campos y casteamos al contrato (patrón del test previo).
 * NOTA: el caso "detail null → cae a V1" vive en el CALLER (NutricionTab), no en el
 * builder — el input exige detail no-nulo por tipo (API nueva de la wave rn-parity-1).
 */
function makeDetail(input: {
  fullName?: string
  localDate?: string
  plan?: PlanOverride | null
  consumed?: Partial<{ calories: number; proteinG: number; carbsG: number; fatsG: number; entryCount: number }>
  targets?: Partial<{ calories: number; proteinG: number; carbsG: number; fatsG: number }>
  remaining?: Partial<{ calories: number }>
}): NutritionClientDetailReadModel {
  const consumed = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0, ...input.consumed }
  const targets = {
    calories: null as number | null,
    proteinG: null as number | null,
    carbsG: null as number | null,
    fatsG: null as number | null,
    ...input.targets,
  }
  const remaining = { calories: null as number | null, ...input.remaining }
  const activePlan = input.plan
    ? {
        id: '11111111-1111-4111-8111-111111111111',
        name: input.plan.name,
        strategy: input.plan.strategy,
        versionId: '22222222-2222-4222-8222-222222222222',
        versionNumber: input.plan.versionNumber,
        status: input.plan.status,
        effectiveFrom: '2026-07-15',
        effectiveTo: null,
      }
    : null
  return {
    client: { id: '33333333-3333-4333-8333-333333333333', fullName: input.fullName ?? 'Alumno Test' },
    today: {
      localDate: input.localDate ?? '2026-07-18',
      plan: activePlan,
      consumed,
      targets,
      remaining,
      mealSlots: [],
      unassignedIntake: [],
    },
    plan: {
      plan: activePlan,
      visibleNotes: null,
    },
    recentDays: [],
    privateNote: null,
  } as unknown as NutritionClientDetailReadModel
}

function build(detail: NutritionClientDetailReadModel) {
  return buildNutritionTabV2ViewModel({
    clientId: '33333333-3333-4333-8333-333333333333',
    detail,
    nutritionProEnabled: true,
    recentDaysForDisplay: [],
  })
}

describe('buildNutritionTabV2ViewModel', () => {
  it('con plan vigente expone estrategia/versión/estado + kcal consumidas vs meta', () => {
    const vm = build(
      makeDetail({
        fullName: 'Ana Perez',
        plan: { strategy: 'hybrid', name: 'Plan Ana', versionNumber: 3, status: 'published' },
        consumed: { calories: 1200, proteinG: 90 },
        targets: { calories: 2000, proteinG: 150 },
      }),
    )
    expect(vm.hasPlan).toBe(true)
    expect(vm.hasActivePlan).toBe(true)
    expect(vm.clientName).toBe('Ana Perez')
    expect(vm.plan).toMatchObject({ strategy: 'hybrid', versionNumber: 3, status: 'published', name: 'Plan Ana' })
    expect(vm.plan?.effectiveFromLabel).toBe(formatLocalDateEsCl('2026-07-15'))
    expect(vm.builderCtaLabel).toBe('Nueva versión')
    expect(vm.today.calories).toEqual({ consumed: 1200, target: 2000 })
    // remaining.calories null en el fixture → deriva target - consumido, capeado a >= 0
    expect(vm.today.remainingCalories).toBe(800)
  })

  it('sin plan vigente devuelve hasPlan=false, plan null y CTA "Crear plan" con progreso en 0', () => {
    const vm = build(makeDetail({ plan: null, consumed: { calories: 0 } }))
    expect(vm.hasPlan).toBe(false)
    expect(vm.hasActivePlan).toBe(false)
    expect(vm.plan).toBeNull()
    expect(vm.builderCtaLabel).toBe('Crear plan')
    expect(vm.today.calories).toEqual({ consumed: 0, target: 0 })
    expect(vm.today.remainingCalories).toBe(0)
  })

  it('formatLocalDateEsCl formatea sin desfase de zona y es defensivo ante basura', () => {
    expect(formatLocalDateEsCl('2026-07-15')).toMatch(/15/)
    expect(formatLocalDateEsCl('no-es-fecha')).toBe('no-es-fecha')
  })
})
