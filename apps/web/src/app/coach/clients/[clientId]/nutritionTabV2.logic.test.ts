import { describe, expect, it } from 'vitest'
import type {
  NutritionClientDetailReadModel,
  NutritionHistoryDay,
} from '@eva/nutrition-v2'
import {
  buildNutritionTabV2ViewModel,
  computeNutritionStreakDays,
} from './nutritionTabV2.logic'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
// Miércoles: mismo día de semana que el mockup aprobado "flujos podados" sección 01 frame 3
// ("Miércoles 29 · en curso", "2 días cumplidos · 1 parcial · racha 4").
const TODAY_ISO = '2026-07-29'

function makeDay(
  localDate: string,
  opts: { calories: number; target?: number; entries?: number },
): NutritionHistoryDay {
  return {
    localDate,
    snapshotId: null,
    planVersionId: null,
    strategy: 'structured',
    targets: {
      calories: opts.target ?? 2400,
      proteinG: 180,
      carbsG: 250,
      fatsG: 70,
      fiberG: null,
      sodiumMg: null,
      waterMl: null,
    },
    consumed: {
      calories: opts.calories,
      proteinG: 100,
      carbsG: 150,
      fatsG: 40,
      fiberG: 10,
      entryCount: opts.entries ?? 1,
    },
    activeEntryCount: opts.entries ?? 1,
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
  todayCalories?: number
  todayTarget?: number
  todayEntryCount?: number
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
    generatedAt: '2026-07-29T12:00:00.000Z',
    client: { id: CLIENT_ID, fullName: 'Catalina Araya' },
    today: {
      plan: activePlan,
      targets: {
        calories: opts.todayTarget ?? 2400,
        proteinG: 180,
        carbsG: 250,
        fatsG: 70,
        fiberG: null,
        sodiumMg: null,
        waterMl: null,
      },
      consumed: {
        calories: opts.todayCalories ?? 0,
        proteinG: 90,
        carbsG: 130,
        fatsG: 35,
        fiberG: 12,
        entryCount: opts.todayEntryCount ?? 0,
      },
      remaining: {
        calories: 0,
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
      dayVariants: [],
      visibleNotes: 'Prioriza proteína en el desayuno.',
    },
    recentDays: [],
    privateNote: null,
  } as unknown as NutritionClientDetailReadModel
}

describe('buildNutritionTabV2ViewModel', () => {
  it('mapea semana + hoy + racha, reproduciendo el mockup aprobado (2 cumplidos · 1 parcial · racha 4)', () => {
    const detail = makeDetail({
      hasAnyPlan: true,
      hasActivePlan: true,
      todayCalories: 1780,
      todayTarget: 2400,
      todayEntryCount: 2,
    })
    const recentDaysForDisplay = [
      makeDay('2026-07-28', { calories: 2300 }), // martes: en rango -> cumplido
      makeDay('2026-07-27', { calories: 2350 }), // lunes: en rango -> cumplido
      makeDay('2026-07-26', { calories: 2200 }), // domingo (semana previa): en rango, solo racha
    ]

    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay,
    })

    expect(vm.clientName).toBe('Catalina Araya')
    expect(vm.hasPlan).toBe(true)
    expect(vm.hasActivePlan).toBe(true)
    expect(vm.strategy).toBe('structured')
    expect(vm.detailHref).toBe(`/coach/nutrition-v2/${CLIENT_ID}`)
    expect(vm.builderHref).toBe(`/coach/nutrition-v2/${CLIENT_ID}/builder`)
    expect(vm.builderCtaLabel).toBe('Nueva versión')

    expect(vm.week).toHaveLength(7)
    expect(vm.week.map((d) => [d.isoDate, d.status])).toEqual([
      ['2026-07-27', 'done'],
      ['2026-07-28', 'done'],
      ['2026-07-29', 'partial'],
      ['2026-07-30', 'future'],
      ['2026-07-31', 'future'],
      ['2026-08-01', 'future'],
      ['2026-08-02', 'future'],
    ])
    expect(vm.week.find((d) => d.isoDate === TODAY_ISO)?.isToday).toBe(true)

    expect(vm.today.calories).toEqual({ consumed: 1780, target: 2400 })
    expect(vm.completedCount).toBe(2)
    expect(vm.partialCount).toBe(1)
    // Mié(hoy, con registro) + Mar + Lun + Dom = 4, igual que el mockup.
    expect(vm.streakDays).toBe(4)
  })

  it('sin plan vigente hoy -> semana vacía, racha 0, CTA "Nueva versión" si hubo plan histórico', () => {
    const detail = makeDetail({ hasAnyPlan: true, hasActivePlan: false })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay: [],
    })
    expect(vm.hasPlan).toBe(true)
    expect(vm.hasActivePlan).toBe(false)
    expect(vm.strategy).toBeNull()
    expect(vm.week).toEqual([])
    expect(vm.streakDays).toBe(0)
    expect(vm.completedCount).toBe(0)
    expect(vm.partialCount).toBe(0)
    expect(vm.builderCtaLabel).toBe('Nueva versión')
  })

  it('sin ningún plan -> CTA "Crear plan"', () => {
    const detail = makeDetail({ hasAnyPlan: false, hasActivePlan: false })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay: [],
    })
    expect(vm.hasPlan).toBe(false)
    expect(vm.builderCtaLabel).toBe('Crear plan')
    expect(vm.week).toEqual([])
  })
})

describe('computeNutritionStreakDays', () => {
  it('cuenta hoy + días consecutivos hacia atrás', () => {
    const streak = computeNutritionStreakDays({
      recentDays: [
        makeDay('2026-07-28', { calories: 2000 }),
        makeDay('2026-07-27', { calories: 2000 }),
      ],
      todayIso: TODAY_ISO,
      todayHasIntake: true,
    })
    expect(streak).toBe(3)
  })

  it('un día sin registro corta la racha', () => {
    const streak = computeNutritionStreakDays({
      recentDays: [
        makeDay('2026-07-28', { calories: 0, entries: 0 }),
        makeDay('2026-07-27', { calories: 2000 }),
      ],
      todayIso: TODAY_ISO,
      todayHasIntake: true,
    })
    expect(streak).toBe(1)
  })

  it('hoy sin registro todavía NO corta la racha de días anteriores', () => {
    const streak = computeNutritionStreakDays({
      recentDays: [
        makeDay('2026-07-28', { calories: 2000 }),
        makeDay('2026-07-27', { calories: 2000 }),
      ],
      todayIso: TODAY_ISO,
      todayHasIntake: false,
    })
    expect(streak).toBe(2)
  })

  it('sin ningún día registrado -> racha 0', () => {
    expect(
      computeNutritionStreakDays({ recentDays: [], todayIso: TODAY_ISO, todayHasIntake: false }),
    ).toBe(0)
  })
})
