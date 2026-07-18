import { describe, expect, it } from 'vitest'
import type { NutritionClientDetailReadModel } from '@eva/nutrition-v2'
import { buildNutritionV2TabViewModel } from '../apps/mobile/lib/coach-nutrition-v2-tab-logic'

type PlanOverride = {
  strategy: 'structured' | 'flexible' | 'hybrid'
  name: string
  versionNumber: number
  status: 'published' | 'superseded'
}

/**
 * Fixture minimo del read model V2: el helper solo lee client.fullName + today.{plan,consumed,targets}
 * + today.localDate, asi que construimos exactamente esos campos y casteamos al contrato.
 */
function makeDetail(input: {
  fullName?: string
  localDate?: string
  plan?: PlanOverride | null
  consumed?: Partial<{ calories: number; proteinG: number; carbsG: number; fatsG: number; entryCount: number }>
  targets?: Partial<{ calories: number; proteinG: number; carbsG: number; fatsG: number }>
}): NutritionClientDetailReadModel {
  const consumed = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0, ...input.consumed }
  const targets = {
    calories: null,
    proteinG: null,
    carbsG: null,
    fatsG: null,
    fiberG: null,
    sodiumMg: null,
    waterMl: null,
    ...input.targets,
  }
  return {
    client: { id: '00000000-0000-4000-8000-000000000001', fullName: input.fullName ?? 'Alumno QA' },
    today: {
      localDate: input.localDate ?? '2026-07-16',
      plan:
        input.plan === undefined || input.plan === null
          ? null
          : {
              id: '00000000-0000-4000-8000-000000000002',
              name: input.plan.name,
              strategy: input.plan.strategy,
              versionId: '00000000-0000-4000-8000-000000000003',
              versionNumber: input.plan.versionNumber,
              status: input.plan.status,
              effectiveFrom: '2026-07-01',
              effectiveTo: null,
            },
      consumed,
      targets,
    },
  } as unknown as NutritionClientDetailReadModel
}

describe('buildNutritionV2TabViewModel', () => {
  it('devuelve null cuando no hay detail (el caller cae a V1)', () => {
    expect(buildNutritionV2TabViewModel(null)).toBeNull()
    expect(buildNutritionV2TabViewModel(undefined)).toBeNull()
  })

  it('con plan vigente expone estrategia/version/estado + progreso capeado y restante', () => {
    const vm = buildNutritionV2TabViewModel(
      makeDetail({
        fullName: 'Ana Perez',
        plan: { strategy: 'structured', name: 'Corte 8 sem', versionNumber: 3, status: 'published' },
        targets: { calories: 2000, proteinG: 160, carbsG: 200, fatsG: 60 },
        consumed: { calories: 2400, proteinG: 80, carbsG: 200, fatsG: 30, entryCount: 4 },
      }),
    )

    expect(vm).not.toBeNull()
    expect(vm!.hasPlan).toBe(true)
    expect(vm!.clientName).toBe('Ana Perez')
    expect(vm!.strategy).toBe('structured')
    expect(vm!.strategyLabel).toBe('Plan estructurado')
    expect(vm!.planName).toBe('Corte 8 sem')
    expect(vm!.versionNumber).toBe(3)
    expect(vm!.status).toBe('published')
    expect(vm!.hasIntakeToday).toBe(true)

    // calorias: 2400/2000 => 120% capeado a 100; restante nunca negativo.
    expect(vm!.calories).toEqual({ consumed: 2400, target: 2000, progressPct: 100, remaining: 0 })

    const protein = vm!.macros.find((m) => m.key === 'protein')!
    expect(protein.label).toBe('Proteína')
    expect(protein.progressPct).toBe(50) // 80/160
    expect(protein.metaLabel).toBe('80 / 160 g')

    const carbs = vm!.macros.find((m) => m.key === 'carbs')!
    expect(carbs.progressPct).toBe(100) // 200/200
  })

  it('sin plan vigente devuelve view model con hasPlan=false y progreso en 0 (target ausente)', () => {
    const vm = buildNutritionV2TabViewModel(
      makeDetail({ plan: null, consumed: { calories: 0, entryCount: 0 } }),
    )

    expect(vm).not.toBeNull()
    expect(vm!.hasPlan).toBe(false)
    expect(vm!.strategy).toBeNull()
    expect(vm!.strategyLabel).toBeNull()
    expect(vm!.versionNumber).toBeNull()
    expect(vm!.status).toBeNull()
    expect(vm!.hasIntakeToday).toBe(false)
    expect(vm!.calories).toEqual({ consumed: 0, target: 0, progressPct: 0, remaining: 0 })
    for (const macro of vm!.macros) {
      expect(macro.progressPct).toBe(0)
      expect(macro.metaLabel).toBe('0 / 0 g')
    }
  })
})
