import { describe, expect, it } from 'vitest'
import { deriveNutritionCoachAlerts } from './nutrition-coach-alerts'

const mkRow = (log_date: string, mealsDone: number, mealsTotal = 3) => ({ log_date, mealsDone, mealsTotal })

describe('deriveNutritionCoachAlerts', () => {
  it('returns empty without plan', () => {
    expect(
      deriveNutritionCoachAlerts({
        hasActivePlan: false,
        kcalTarget: 2000,
        weeklyAvgPct: 10,
        prevWeeklyAvgPct: 70,
        monthlyAvgPct: 40,
        nutritionTimeline: [],
        santiagoTodayIso: '2026-04-30',
      })
    ).toEqual([])
  })

  it('flags very low kcal', () => {
    const a = deriveNutritionCoachAlerts({
      hasActivePlan: true,
      kcalTarget: 900,
      weeklyAvgPct: 80,
      prevWeeklyAvgPct: 80,
      monthlyAvgPct: 80,
      nutritionTimeline: [mkRow('2026-04-30', 2)],
      santiagoTodayIso: '2026-04-30',
    })
    expect(a.some((x) => x.id === 'over_restriction')).toBe(true)
  })

  it('flags adherence drop', () => {
    const a = deriveNutritionCoachAlerts({
      hasActivePlan: true,
      kcalTarget: 2000,
      weeklyAvgPct: 20,
      prevWeeklyAvgPct: 70,
      monthlyAvgPct: 50,
      nutritionTimeline: [],
      santiagoTodayIso: '2026-04-30',
    })
    expect(a.some((x) => x.id === 'adherence_drop')).toBe(true)
  })

  it('flags stagnation when enough history', () => {
    const timeline = Array.from({ length: 16 }, (_, i) =>
      mkRow(`2026-04-${String(15 + i).padStart(2, '0')}`, 1)
    )
    const a = deriveNutritionCoachAlerts({
      hasActivePlan: true,
      kcalTarget: 2000,
      weeklyAvgPct: 50,
      prevWeeklyAvgPct: 50,
      monthlyAvgPct: 40,
      nutritionTimeline: timeline,
      santiagoTodayIso: '2026-04-30',
    })
    expect(a.some((x) => x.id === 'stagnation')).toBe(true)
  })

  it('flags silent recent when had history but last 5 empty', () => {
    const a = deriveNutritionCoachAlerts({
      hasActivePlan: true,
      kcalTarget: 2000,
      weeklyAvgPct: 10,
      prevWeeklyAvgPct: 10,
      monthlyAvgPct: 30,
      nutritionTimeline: [mkRow('2026-04-10', 2), mkRow('2026-04-11', 1), mkRow('2026-04-12', 1)],
      santiagoTodayIso: '2026-04-30',
    })
    expect(a.some((x) => x.id === 'silent_recent')).toBe(true)
  })

  // W4.2 «Cantidades honestas»: el bloque V2 es OPCIONAL y va al final; sin él el motor V1 tiene
  // que devolver exactamente lo mismo que antes.
  describe('bloque V2 (W4.2)', () => {
    const V1_INPUT = {
      hasActivePlan: true,
      kcalTarget: 2000,
      weeklyAvgPct: 80,
      prevWeeklyAvgPct: 80,
      monthlyAvgPct: 80,
      nutritionTimeline: [mkRow('2026-04-30', 2)],
      santiagoTodayIso: '2026-04-30',
    }

    it('sin `v2` el resultado es idéntico al de antes', () => {
      expect(deriveNutritionCoachAlerts(V1_INPUT)).toEqual([])
      expect(deriveNutritionCoachAlerts({ ...V1_INPUT, v2: null })).toEqual([])
    })

    it('concatena sobreconsumo y registros de una versión anterior, después de las V1', () => {
      const a = deriveNutritionCoachAlerts({
        ...V1_INPUT,
        kcalTarget: 900,
        v2: { todayConsumedCalories: 5637, todayTargetCalories: 1556, priorVersionEntryCount: 5 },
      })
      expect(a.map((x) => x.id)).toEqual([
        'over_restriction',
        'overconsumption',
        'prior_version_entries',
      ])
    })

    it('un día V2 limpio no agrega nada', () => {
      expect(
        deriveNutritionCoachAlerts({
          ...V1_INPUT,
          v2: { todayConsumedCalories: 1400, todayTargetCalories: 1556, priorVersionEntryCount: 0 },
        }),
      ).toEqual([])
    })

    it('sin plan activo el corte temprano manda: ni siquiera se miran las V2', () => {
      expect(
        deriveNutritionCoachAlerts({
          ...V1_INPUT,
          hasActivePlan: false,
          v2: { todayConsumedCalories: 5637, todayTargetCalories: 1556, priorVersionEntryCount: 5 },
        }),
      ).toEqual([])
    })
  })
})
