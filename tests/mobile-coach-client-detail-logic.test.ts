import { describe, expect, it } from 'vitest'
import {
  activePlanNutritionComplianceForDay,
  averageNutritionTimelineCompliance,
  buildNutritionTimeline,
  checkInRegularityPercentAsOfSantiago,
  effectiveWorkoutTarget,
  filterTrainingStrengthSeries,
  filterTimelineForActivePlan,
  isValidIsoYmd,
  resolveNutritionSignal,
  selectTrainingRadarRows,
  trainingProgressionLabel,
} from '../apps/mobile/lib/coach-client-detail-logic'
import { deriveNutritionCoachAlerts } from '../apps/mobile/lib/nutrition-coach-alerts'

const goals = { calories: 2000, protein: 150, carbs: 220, fats: 60 }
const meals = [
  { id: 'meal-1', day_of_week: 7, food_items: [] },
  { id: 'meal-2', day_of_week: 7, food_items: [] },
  { id: 'meal-3', day_of_week: 7, food_items: [] },
  { id: 'meal-4', day_of_week: 7, food_items: [] },
]

describe('coach client detail pure parity', () => {
  it('no fabrica timeline ni alertas si no existe daily log', () => {
    const timeline = buildNutritionTimeline('2026-07-12', [], [], goals, 'active')
    expect(timeline).toEqual([])
    expect(deriveNutritionCoachAlerts({
      hasActivePlan: true,
      kcalTarget: 2000,
      weeklyAvgPct: 0,
      prevWeeklyAvgPct: 0,
      monthlyAvgPct: null,
      nutritionTimeline: [],
      santiagoTodayIso: '2026-07-12',
    })).toEqual([])
  })

  it('timeline contiene solo logs reales y conserva plan_id', () => {
    const timeline = buildNutritionTimeline('2026-07-12', [
      { log_date: '2026-07-12', plan_id: 'active', nutrition_meal_logs: [] },
      { log_date: '2026-06-01', plan_id: 'old', nutrition_meal_logs: [] },
    ], meals, goals, 'active')

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({ date: '2026-07-12', planId: 'active', matchesActivePlan: true })
  })

  it('timeline y mensual usan denominador crudo; HOY usa comidas aplicables', () => {
    const rows = [{
      log_date: '2026-07-12',
      plan_id: 'active',
      nutrition_meal_logs: [{ meal_id: 'meal-1', is_completed: true }],
    }]
    const timeline = buildNutritionTimeline('2026-07-12', rows, meals, goals, 'active')
    const activeTimeline = filterTimelineForActivePlan(timeline, 'active')

    expect(timeline[0]).toMatchObject({ mealsDone: 1, mealsTotal: 1, compliancePct: 100 })
    expect(averageNutritionTimelineCompliance(activeTimeline)).toBe(100)
    expect(activePlanNutritionComplianceForDay('2026-07-12', rows, meals, 'active')).toBe(25)
  })

  it('timeline historico de otro plan no inventa macros consumidos', () => {
    const timeline = buildNutritionTimeline('2026-07-12', [{
      log_date: '2026-07-11',
      plan_id: 'old',
      target_calories_at_log: 1800,
      target_protein_at_log: 120,
      target_carbs_at_log: 190,
      target_fats_at_log: 50,
      nutrition_meal_logs: [{ meal_id: 'old-meal', is_completed: true }],
    }], meals, goals, 'active')

    expect(timeline[0]).toMatchObject({
      compliancePct: 100,
      consumedCalories: 0,
      consumedProtein: 0,
      consumedCarbs: 0,
      consumedFats: 0,
    })
  })

  it('regularidad usa created_at en Santiago y cae linealmente a cero en 7 dias', () => {
    // 2026-07-10 02:30Z = 2026-07-09 22:30 en Santiago (invierno).
    const checkIns = [{ created_at: '2026-07-10T02:30:00.000Z', date: '2026-07-10' }]
    expect(checkInRegularityPercentAsOfSantiago('2026-07-12', checkIns)).toBe(57)
    expect(checkInRegularityPercentAsOfSantiago('2026-07-16', checkIns)).toBe(0)
  })

  it('compliance de hoy ignora logs de otro plan y comidas de otro dia', () => {
    const rows = [{
      log_date: '2026-07-12',
      plan_id: 'old',
      nutrition_meal_logs: [{ meal_id: 'meal-1', is_completed: true }],
    }]
    const mixedMeals = [...meals, { id: 'monday-only', day_of_week: 1, food_items: [] }]
    expect(activePlanNutritionComplianceForDay('2026-07-12', rows, mixedMeals, 'active')).toBe(0)
  })

  it('compliance de hoy es null sin plan y null sin comidas aplicables, pero un 0 real sigue siendo 0', () => {
    const rows = [{
      log_date: '2026-07-12',
      plan_id: 'active',
      nutrition_meal_logs: [{ meal_id: 'meal-1', is_completed: false }],
    }]
    // Sin plan activo no hay dato: antes valia 0 y la ficha lo pintaba como "0 % de cumplimiento".
    expect(activePlanNutritionComplianceForDay('2026-07-12', rows, meals, null)).toBeNull()
    // Plan activo pero ninguna comida aplicable HOY (todas son de otro dia) ⇒ tampoco hay dato.
    const mondayOnly = [{ id: 'monday-only', day_of_week: 1, food_items: [] }]
    expect(activePlanNutritionComplianceForDay('2026-07-12', rows, mondayOnly, 'active')).toBeNull()
    // 0 REAL: plan activo, 4 comidas aplicables, ninguna completada.
    expect(activePlanNutritionComplianceForDay('2026-07-12', rows, meals, 'active')).toBe(0)
  })

  it('resolveNutritionSignal cubre los 4 cuadrantes (dominio on/off × con/sin plan)', () => {
    // ON · con plan: anillo con valor real, sin hint, banner con el pct de hoy, pildora visible.
    expect(resolveNutritionSignal({ nutritionEnabled: true, weeklyAvgPct: 72, prevWeeklyAvgPct: 60, todayPct: 80 })).toEqual({
      showRing: true,
      ringValue: 72,
      ringHint: undefined,
      alertInput: 80,
      atRisk: false,
    })
    // La píldora se decide con el pct de HOY (misma ventana que antes), no con el semanal.
    expect(resolveNutritionSignal({ nutritionEnabled: true, weeklyAvgPct: 90, prevWeeklyAvgPct: 90, todayPct: 40 }))
      .toMatchObject({ ringValue: 90, alertInput: 40, atRisk: true })
    expect(resolveNutritionSignal({ nutritionEnabled: true, weeklyAvgPct: 45, prevWeeklyAvgPct: 60, todayPct: 0 }))
      .toMatchObject({ ringValue: 45, alertInput: 0, atRisk: true })

    // ON · sin plan: anillo gris con hint, sin banner (undefined) y sin pildora (null).
    expect(resolveNutritionSignal({ nutritionEnabled: true, weeklyAvgPct: null, prevWeeklyAvgPct: null, todayPct: null })).toEqual({
      showRing: true,
      ringValue: null,
      ringHint: 'Sin plan vigente',
      alertInput: undefined,
      atRisk: null,
    })

    // OFF · con plan: el anillo desaparece; ni banner ni pildora, aunque haya numeros.
    expect(resolveNutritionSignal({ nutritionEnabled: false, weeklyAvgPct: 72, prevWeeklyAvgPct: 60, todayPct: 40 }))
      .toMatchObject({ showRing: false, ringHint: undefined, alertInput: undefined, atRisk: null })

    // OFF · sin plan (caso Movens): cero rastro de nutricion.
    expect(resolveNutritionSignal({ nutritionEnabled: false, weeklyAvgPct: null, prevWeeklyAvgPct: null, todayPct: null })).toEqual({
      showRing: false,
      ringValue: null,
      ringHint: undefined,
      alertInput: undefined,
      atRisk: null,
    })
  })

  it('target semanal usa variante A/B efectiva y solo planes con bloques', () => {
    const program = {
      ab_mode: true,
      start_date: '2026-07-06',
      weeks_to_repeat: 8,
      workoutPlans: [
        { week_variant: 'A', blocks: [{}] },
        { week_variant: 'A', blocks: [] },
        { week_variant: 'A', blocks: [{}] },
        { week_variant: 'B', blocks: [{}] },
      ],
    }
    expect(effectiveWorkoutTarget(program, new Date('2026-07-13T12:00:00Z'))).toBe(1)
  })

  it('target A/B cae a la variante poblada cuando la programada no existe', () => {
    const program = {
      ab_mode: true,
      start_date: '2026-07-06',
      weeks_to_repeat: 8,
      workoutPlans: [
        { week_variant: 'A', blocks: [{}] },
        { week_variant: 'A', blocks: [] },
      ],
    }
    expect(effectiveWorkoutTarget(program, new Date('2026-07-13T12:00:00Z'))).toBe(1)
  })

  it('Entreno filtra fuerza y radar como web', () => {
    const strength = [
      { id: 'a', muscleGroup: 'Pecho', totalVolume: 10 },
      { id: 'b', muscleGroup: 'Pecho', totalVolume: 30 },
      { id: 'c', muscleGroup: 'Piernas', totalVolume: 100 },
      { id: 'd', muscleGroup: 'Espalda', totalVolume: 90 },
      { id: 'e', muscleGroup: 'Brazos', totalVolume: 80 },
    ]
    expect(filterTrainingStrengthSeries(strength, null).map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(filterTrainingStrengthSeries(strength, 'Pecho').map((row) => row.id)).toEqual(['b', 'a'])
    const radar = selectTrainingRadarRows([
      { muscleGroup: 'Cero', volume: 0 },
      { muscleGroup: 'B', volume: 20 },
      { muscleGroup: 'A', volume: 40 },
    ])
    expect(radar.map((row) => row.muscleGroup)).toEqual(['A', 'B'])
  })

  it('Entreno valida fecha y copy de progresión', () => {
    expect(isValidIsoYmd('2026-02-29')).toBe(false)
    expect(isValidIsoYmd('2026-07-12')).toBe(true)
    expect(trainingProgressionLabel('weekly_linear', 2.5)).toBe('Lineal +2.5/sem')
    expect(trainingProgressionLabel('double', null)).toBe('Doble progresión')
    expect(trainingProgressionLabel('adaptive', null)).toBeNull()
  })
})
