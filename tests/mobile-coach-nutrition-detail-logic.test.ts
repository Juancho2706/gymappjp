import { describe, expect, it } from 'vitest'
import {
  COACH_NUTRITION_DETAIL_COPY,
  buildNutritionHeatmap30d,
  buildNutritionKcalChart7d,
  buildNutritionMacroShares,
  buildNutritionPlanMealRows,
  buildTodayNutritionMacroProgress,
  deriveNutritionHeadlineAdherence,
  deriveNutritionRisk,
  deriveNutritionWeekDelta,
  deriveTodayKcalProgress,
  findTodayNutritionRow,
  nutritionHeatmapTone,
  nutritionKcalPerDayLabel,
  nutritionMonthlyAverageValue,
  nutritionPlanTitle,
  nutritionStreakValue,
  nutritionTodayMealsLabel,
} from '../apps/mobile/lib/coach-nutrition-detail-logic'

describe('coach nutrition detail · Zona A', () => {
  it('busca HOY exacto y nunca cae a una fila de otro día', () => {
    const yesterdayOnly = [{ date: '2026-07-12', mealsDone: 3, mealsTotal: 4, compliancePct: 75 }]
    expect(findTodayNutritionRow('2026-07-13', yesterdayOnly)).toBeNull()
    expect(COACH_NUTRITION_DETAIL_COPY.todayNoLog).toBe(
      'No ha registrado comidas hoy (sin log diario).',
    )

    const today = { date: '2026-07-13', mealsDone: 4, mealsTotal: 4, compliancePct: 100 }
    expect(findTodayNutritionRow('2026-07-13', [yesterdayOnly[0]!, today])).toBe(today)
  })

  it('construye 30 días calendario, incluso días sin log, cruzando mes y año', () => {
    const days = buildNutritionHeatmap30d('2026-01-02', [
      { date: '2025-12-04', mealsDone: 4, mealsTotal: 4, compliancePct: 80 },
      { date: '2025-12-31', mealsDone: 3, mealsTotal: 5, compliancePct: 60 },
      { date: '2026-01-01', mealsDone: 2, mealsTotal: 5, compliancePct: 59 },
    ])

    expect(days).toHaveLength(30)
    expect(days[0]).toMatchObject({ dateKey: '2025-12-04', dayLabel: '4', tone: 'success' })
    expect(days.at(-3)).toMatchObject({ dateKey: '2025-12-31', tone: 'warning' })
    expect(days.at(-2)).toMatchObject({ dateKey: '2026-01-01', tone: 'danger' })
    expect(days.at(-1)).toMatchObject({
      dateKey: '2026-01-02',
      hasLog: false,
      compliancePct: null,
      tone: 'muted',
      accessibilityLabel: '2026-01-02: sin registro',
    })
  })

  it('aplica exactamente los cortes 80/60 y deja null/no-log como muted', () => {
    expect(nutritionHeatmapTone(true, 100)).toBe('success')
    expect(nutritionHeatmapTone(true, 80)).toBe('success')
    expect(nutritionHeatmapTone(true, 79.99)).toBe('warning')
    expect(nutritionHeatmapTone(true, 60)).toBe('warning')
    expect(nutritionHeatmapTone(true, 59.99)).toBe('danger')
    expect(nutritionHeatmapTone(true, null)).toBe('muted')
    expect(nutritionHeatmapTone(false, 100)).toBe('muted')
  })

  it('prioriza adherencia 30d all-days, conserva cero y cae a mensual/semanal', () => {
    expect(deriveNutritionHeadlineAdherence(0, 88, 77)).toBe(0)
    expect(deriveNutritionHeadlineAdherence(null, 88, 77)).toBe(88)
    expect(deriveNutritionHeadlineAdherence(undefined, null, 77)).toBe(77)
    expect(deriveNutritionHeadlineAdherence(undefined, undefined, null)).toBe(0)
  })

  it('marca riesgo solo con plan, meta calórica y adherencia menor a 60', () => {
    expect(deriveNutritionRisk({
      hasActivePlan: true,
      kcalTarget: 2000,
      headlineAdherencePct: 59.5,
    })).toEqual({
      atRisk: true,
      tone: 'danger',
      label: 'Adherencia nutricional en riesgo (60%)',
    })
    expect(deriveNutritionRisk({ hasActivePlan: true, kcalTarget: 2000, headlineAdherencePct: 60 }).atRisk)
      .toBe(false)
    expect(deriveNutritionRisk({ hasActivePlan: false, kcalTarget: 2000, headlineAdherencePct: 10 }).atRisk)
      .toBe(false)
    expect(deriveNutritionRisk({ hasActivePlan: true, kcalTarget: 0, headlineAdherencePct: 10 }).atRisk)
      .toBe(false)
  })

  it('deriva delta semanal con umbral visual ±1 y null como cero', () => {
    expect(deriveNutritionWeekDelta(81, 80)).toMatchObject({
      delta: 1,
      roundedDelta: 1,
      trend: 'flat',
      tone: 'success',
      valueLabel: '+1%',
    })
    expect(deriveNutritionWeekDelta(81.1, 80).trend).toBe('up')
    expect(deriveNutritionWeekDelta(78.9, 80).trend).toBe('down')
    expect(deriveNutritionWeekDelta(79, 80)).toMatchObject({
      delta: -1,
      trend: 'flat',
      tone: 'danger',
      valueLabel: '-1%',
    })
    expect(deriveNutritionWeekDelta(null, undefined).valueLabel).toBe('+0%')
  })

  it('arma chart de siete días calendario con letras D-L-M-X-J-V-S y ceros sin log', () => {
    const chart = buildNutritionKcalChart7d('2026-07-13', [
      { date: '2026-07-07', consumedCalories: 1000, targetCalories: 1800 },
      { date: '2026-07-13', consumedCalories: 2500, targetCalories: 0 },
      { date: '2026-06-01', consumedCalories: 9999, targetCalories: 9999 },
    ], 2000)

    expect(chart.days).toHaveLength(7)
    expect(chart.days.map((day) => day.dateKey)).toEqual([
      '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
      '2026-07-11', '2026-07-12', '2026-07-13',
    ])
    expect(chart.days.map((day) => day.dayLetter)).toEqual(['M', 'X', 'J', 'V', 'S', 'D', 'L'])
    expect(chart.days[1]).toMatchObject({ consumed: 0, target: 2000 })
    expect(chart.days.at(-1)).toMatchObject({ consumed: 2500, target: 2000 })
    expect(chart.scale).toBeCloseTo(2800)
    expect(chart.targetLegendLabel).toBe('Meta 2.000 kcal')
    expect(chart.targetLineTopPct).toBeCloseTo(28.5714, 3)
  })

  it('chart sin logs sigue mostrando siete días y meta; fecha inválida falla cerrada', () => {
    const empty = buildNutritionKcalChart7d('2026-07-13', [], 0)
    expect(empty.days).toHaveLength(7)
    expect(empty.days.every((day) => day.consumed === 0 && day.target === 0)).toBe(true)
    expect(empty.scale).toBe(1.12)
    expect(empty.targetLineTopPct).toBeNull()
    expect(empty.targetLegendLabel).toBeNull()

    expect(buildNutritionHeatmap30d('2026-02-30', [])).toEqual([])
    expect(buildNutritionKcalChart7d('not-a-day', [], 2000).days).toEqual([])
  })

  it('deriva barras de hoy, capea progreso en 100 y preserva copy exacto', () => {
    expect(buildTodayNutritionMacroProgress(
      { protein: 180, carbs: 100, fats: null },
      { protein: 150, carbs: 200, fats: 60 },
    )).toEqual([
      { kind: 'protein', label: 'Proteína', value: 180, target: 150, progressPct: 100, metaLabel: '180 / 150 g' },
      { kind: 'carbs', label: 'Carbohidratos', value: 100, target: 200, progressPct: 50, metaLabel: '100 / 200 g' },
      { kind: 'fats', label: 'Grasas', value: 0, target: 60, progressPct: 0, metaLabel: '0 / 60 g' },
    ])
    expect(deriveTodayKcalProgress(2150, 2000)).toEqual({
      consumed: 2150,
      target: 2000,
      progressPct: 100,
      valueLabel: '2.150',
      targetLabel: '/ 2.000 kcal',
    })
  })

  it('formatea valores/copy nulos sin mostrar null%', () => {
    expect(nutritionMonthlyAverageValue(null)).toBe('—')
    expect(nutritionMonthlyAverageValue(0)).toBe('0%')
    expect(nutritionStreakValue(null)).toBe('0 d')
    expect(nutritionTodayMealsLabel(null, undefined)).toBe('0/0 comidas')
    expect(nutritionKcalPerDayLabel(2000)).toBe('2.000 kcal / día')
    expect(nutritionKcalPerDayLabel(null)).toBeNull()
  })
})

describe('coach nutrition detail · Zona B', () => {
  it('calcula kcal-share P/C/G con factores 4/4/9', () => {
    expect(buildNutritionMacroShares({ protein: 150, carbs: 200, fats: 50 })).toEqual([
      {
        kind: 'protein', name: 'Proteína', grams: 150, kcal: 600,
        kcalSharePct: 32, valueLabel: '150g', caption: 'Proteína · 32%',
      },
      {
        kind: 'carbs', name: 'Carbos', grams: 200, kcal: 800,
        kcalSharePct: 43, valueLabel: '200g', caption: 'Carbos · 43%',
      },
      {
        kind: 'fats', name: 'Grasas', grams: 50, kcal: 450,
        kcalSharePct: 24, valueLabel: '50g', caption: 'Grasas · 24%',
      },
    ])
    expect(buildNutritionMacroShares({ protein: null, carbs: undefined, fats: 0 })
      .map((row) => row.kcalSharePct)).toEqual([0, 0, 0])
  })

  it('suma macros por comida igual que B5 y deriva labels observables', () => {
    const [meal] = buildNutritionPlanMealRows([{
      id: 'meal-1',
      name: 'Desayuno',
      description: 'Antes de entrenar',
      food_items: [
        {
          id: 'fi-1', quantity: 2, unit: 'un',
          foods: { name: 'Huevo', calories: 70, protein_g: 6, carbs_g: 1, fats_g: 5 },
        },
        {
          id: 'fi-2', quantity: 0, unit: 'g',
          foods: { name: 'Avena', calories: 100, protein_g: 4, carbs_g: 20, fats_g: 2 },
        },
        { id: 'fi-3', quantity: 3, unit: 'g', foods: null },
      ],
    }])

    expect(meal).toMatchObject({
      id: 'meal-1',
      name: 'Desayuno',
      description: 'Antes de entrenar',
      protein: 16,
      carbs: 22,
      fats: 12,
      calories: 240,
      hasMacros: true,
      macroLabel: 'P 16g · C 22g · G 12g',
      kcalLabel: '240 kcal',
      emptyFoodsLabel: null,
    })
    expect(meal?.foods).toEqual([
      { key: 'fi-1', name: 'Huevo', detailLabel: '2 un · 70 kcal' },
      { key: 'fi-2', name: 'Avena', detailLabel: '0 g · 100 kcal' },
      { key: 'fi-3', name: 'Alimento', detailLabel: '3 g' },
    ])
  })

  it('maneja comida vacía y valores nulos sin inventar macros', () => {
    const [meal] = buildNutritionPlanMealRows([{
      id: 'empty',
      name: null,
      description: '   ',
      food_items: [],
    }])
    expect(meal).toEqual({
      id: 'empty',
      name: '',
      description: null,
      protein: 0,
      carbs: 0,
      fats: 0,
      calories: 0,
      hasMacros: false,
      macroLabel: null,
      kcalLabel: null,
      foods: [],
      emptyFoodsLabel: 'Sin alimentos enlazados',
    })
  })

  it('conserva títulos y copy 1:1 del plan', () => {
    expect(nutritionPlanTitle('Plan rendimiento')).toBe('Plan · Plan rendimiento')
    expect(COACH_NUTRITION_DETAIL_COPY.zoneB).toEqual({
      title: 'Plan y comidas',
      subtitle: 'Plan activo, edición y lista de comidas',
    })
    expect(COACH_NUTRITION_DETAIL_COPY.favoritesTitle).toBe('Alimentos favoritos del alumno')
    expect(COACH_NUTRITION_DETAIL_COPY.duplicateConfirmLoading).toBe('Copiando…')
  })
})
