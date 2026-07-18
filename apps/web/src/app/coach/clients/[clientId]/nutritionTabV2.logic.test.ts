import { describe, expect, it } from 'vitest'
import type {
  NutritionClientDetailReadModel,
  NutritionHistoryDay,
} from '@eva/nutrition-v2'
import { buildNutritionTabV2ViewModel, formatLocalDateEsCl } from './nutritionTabV2.logic'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

function makeDay(localDate: string, calories: number, entries: number): NutritionHistoryDay {
  return {
    localDate,
    snapshotId: null,
    planVersionId: null,
    strategy: 'structured',
    targets: {
      calories: 2000,
      proteinG: 150,
      carbsG: 200,
      fatsG: 60,
      fiberG: null,
      sodiumMg: null,
      waterMl: null,
    },
    consumed: {
      calories,
      proteinG: 100,
      carbsG: 150,
      fatsG: 40,
      fiberG: 10,
      entryCount: entries,
    },
    activeEntryCount: entries,
    correctionCount: 0,
    legacyCompletionCount: 0,
    legacyDisclosure: null,
    lastRecordedAt: null,
  } as NutritionHistoryDay
}

/** Fixture mínimo del read model: el mapper solo lee un subconjunto; casteamos para no
 *  reconstruir cada campo del schema (la validez zod se prueba en el read service). */
function makeDetail(opts: {
  hasAnyPlan: boolean
  hasActivePlan: boolean
  remainingCalories?: number | null
}): NutritionClientDetailReadModel {
  const activePlan = opts.hasActivePlan
    ? {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Plan hipertrofia',
        strategy: 'structured' as const,
        versionId: '33333333-3333-4333-8333-333333333333',
        versionNumber: 3,
        status: 'published' as const,
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
      }
    : null
  const anyPlan = opts.hasAnyPlan
    ? {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Plan hipertrofia',
        strategy: 'structured' as const,
        versionId: '33333333-3333-4333-8333-333333333333',
        versionNumber: 3,
        status: 'published' as const,
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
      }
    : null

  return {
    schemaVersion: 1,
    generatedAt: '2026-07-15T12:00:00.000Z',
    client: { id: CLIENT_ID, fullName: 'Ana Coello' },
    today: {
      plan: activePlan,
      targets: {
        calories: 2000,
        proteinG: 150,
        carbsG: 200,
        fatsG: 60,
        fiberG: null,
        sodiumMg: null,
        waterMl: null,
      },
      consumed: {
        calories: 1200,
        proteinG: 90,
        carbsG: 130,
        fatsG: 35,
        fiberG: 12,
        entryCount: 4,
      },
      remaining: {
        calories: opts.remainingCalories === undefined ? 800 : opts.remainingCalories,
        proteinG: null,
        carbsG: null,
        fatsG: null,
        fiberG: null,
        sodiumMg: null,
        waterMl: null,
      },
      mealSlots: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    },
    plan: {
      plan: anyPlan,
      visibleNotes: 'Prioriza proteína en el desayuno.',
    },
    recentDays: [],
    privateNote: null,
  } as unknown as NutritionClientDetailReadModel
}

describe('buildNutritionTabV2ViewModel', () => {
  it('mapea plan vigente + hoy con addon Pro (sin CTA de upgrade)', () => {
    const detail = makeDetail({ hasAnyPlan: true, hasActivePlan: true })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      nutritionProEnabled: true,
      recentDaysForDisplay: [makeDay('2026-07-14', 1900, 5), makeDay('2026-07-13', 1750, 3)],
    })

    expect(vm.clientName).toBe('Ana Coello')
    expect(vm.hasPlan).toBe(true)
    expect(vm.hasActivePlan).toBe(true)
    expect(vm.builderCtaLabel).toBe('Nueva versión')
    expect(vm.detailHref).toBe(`/coach/nutrition-v2/${CLIENT_ID}`)
    expect(vm.builderHref).toBe(`/coach/nutrition-v2/${CLIENT_ID}/builder`)
    expect(vm.plan).toEqual({
      strategy: 'structured',
      versionNumber: 3,
      status: 'published',
      effectiveFrom: '2026-07-01',
      effectiveFromLabel: formatLocalDateEsCl('2026-07-01'),
      name: 'Plan hipertrofia',
      visibleNotes: 'Prioriza proteína en el desayuno.',
    })
    // La etiqueta visible NO es la fecha ISO cruda.
    expect(vm.plan?.effectiveFromLabel).not.toBe('2026-07-01')
    expect(vm.today.calories).toEqual({ consumed: 1200, target: 2000 })
    expect(vm.today.remainingCalories).toBe(800)
    expect(vm.today.entryCount).toBe(4)
    expect(vm.today.mealSlotCount).toBe(3)
    expect(vm.today.macros.map((m) => [m.macro, m.consumed, m.target])).toEqual([
      ['protein', 90, 150],
      ['carbs', 130, 200],
      ['fats', 35, 60],
    ])
    expect(vm.showHistoryUpgradeCta).toBe(false)
    expect(vm.recentDays).toEqual([
      {
        localDate: '2026-07-14',
        label: formatLocalDateEsCl('2026-07-14'),
        calories: 1900,
        entryCount: 5,
      },
      {
        localDate: '2026-07-13',
        label: formatLocalDateEsCl('2026-07-13'),
        calories: 1750,
        entryCount: 3,
      },
    ])
  })

  it('sin addon Pro -> muestra CTA de upgrade y respeta el set de días ya recortado', () => {
    const detail = makeDetail({ hasAnyPlan: true, hasActivePlan: true })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      nutritionProEnabled: false,
      recentDaysForDisplay: [makeDay('2026-07-14', 1900, 5)],
    })
    expect(vm.showHistoryUpgradeCta).toBe(true)
    expect(vm.recentDays).toHaveLength(1)
  })

  it('plan histórico pero sin vigente hoy -> hasActivePlan false y plan null, CTA "Nueva versión"', () => {
    const detail = makeDetail({ hasAnyPlan: true, hasActivePlan: false })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      nutritionProEnabled: true,
      recentDaysForDisplay: [],
    })
    expect(vm.hasPlan).toBe(true)
    expect(vm.hasActivePlan).toBe(false)
    expect(vm.plan).toBeNull()
    expect(vm.builderCtaLabel).toBe('Nueva versión')
    expect(vm.recentDays).toEqual([])
  })

  it('sin ningún plan -> estado vacío, CTA "Crear plan"', () => {
    const detail = makeDetail({ hasAnyPlan: false, hasActivePlan: false })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      nutritionProEnabled: false,
      recentDaysForDisplay: [],
    })
    expect(vm.hasPlan).toBe(false)
    expect(vm.hasActivePlan).toBe(false)
    expect(vm.plan).toBeNull()
    expect(vm.builderCtaLabel).toBe('Crear plan')
  })

  it('remaining.calories null -> fallback a max(target - consumed, 0)', () => {
    const detail = makeDetail({ hasAnyPlan: true, hasActivePlan: true, remainingCalories: null })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      nutritionProEnabled: true,
      recentDaysForDisplay: [],
    })
    // target 2000 - consumed 1200 = 800
    expect(vm.today.remainingCalories).toBe(800)
  })
})

describe('formatLocalDateEsCl', () => {
  it('formatea es-CL con día/mes/año legibles', () => {
    const out = formatLocalDateEsCl('2026-07-15')
    expect(out).toContain('15')
    expect(out).toContain('2026')
    expect(out.toLowerCase()).toContain('jul')
  })

  it('NO corre el día por timezone en fechas límite de año (sin shift a dic 31 2025)', () => {
    // `new Date('2026-01-01')` sería medianoche UTC -> en zonas negativas (Chile) mostraría
    // 2025-12-31. El formateo por componentes en UTC debe mantener el 1 de enero de 2026.
    const out = formatLocalDateEsCl('2026-01-01')
    expect(out).toContain('2026')
    expect(out).not.toContain('2025')
    expect(out).not.toContain('31')
    expect(out.toLowerCase()).not.toContain('dic')
  })

  it('devuelve el string tal cual si no calza el patrón YYYY-MM-DD', () => {
    expect(formatLocalDateEsCl('no-es-fecha')).toBe('no-es-fecha')
    expect(formatLocalDateEsCl('2026/07/15')).toBe('2026/07/15')
  })
})
