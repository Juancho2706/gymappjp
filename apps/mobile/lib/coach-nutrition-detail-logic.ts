import { isoDateAddDays } from './date-utils'

export type NutritionSemanticTone = 'muted' | 'success' | 'warning' | 'danger'
export type NutritionWeekTrend = 'up' | 'down' | 'flat'
export type NutritionMacroKind = 'protein' | 'carbs' | 'fats'

export type CoachNutritionTimelineLike = {
  date: string
  mealsDone?: number | null
  mealsTotal?: number | null
  compliancePct?: number | null
  consumedCalories?: number | null
  targetCalories?: number | null
}

export type NutritionMacroValues = {
  protein?: number | null
  carbs?: number | null
  fats?: number | null
}

export const COACH_NUTRITION_DETAIL_COPY = {
  zoneA: {
    title: 'Progreso',
    subtitle: 'Adherencia, consumo y tendencia reciente',
  },
  todayTitle: 'Hoy (Santiago)',
  todayNoLog: 'No ha registrado comidas hoy (sin log diario).',
  adherenceTitle: 'Adherencia · 30 días',
  adherenceAverageCaption: 'Promedio de 30 días; incluye los días sin registro como 0%.',
  adherenceColorCaption: 'Color según % de comidas del plan completadas ese día.',
  monthlyAverageLabel: 'Prom. mensual',
  streakLabel: 'Racha de nutrición ≥80%',
  weekDeltaLabel: 'Sem vs ant.',
  chart7dTitle: 'Últimos 7 días · kcal vs meta',
  chart7dCaption: 'Consumo estimado según comidas del plan marcadas como hechas.',
  progressEmpty: 'Asigna un plan de nutrición con meta calórica para ver el progreso del alumno.',
  zoneB: {
    title: 'Plan y comidas',
    subtitle: 'Plan activo, edición y lista de comidas',
  },
  favoritesTitle: 'Alimentos favoritos del alumno',
  favoritesCaption:
    'Marcados desde la app del alumno; se aplican a todos sus planes con esos alimentos del catálogo.',
  editPlan: 'Editar plan',
  copyPlan: 'Copiar',
  viewAsStudent: 'Ver como alumno',
  duplicateTitle: 'Copiar plan a otro alumno',
  duplicateDescription:
    'El plan se copiará como CUSTOM al alumno destino. El historial de este alumno y el plan origen no se modifican.',
  duplicateSelectPlaceholder: 'Seleccionar alumno…',
  duplicateLoadingClients: 'Cargando alumnos…',
  duplicateConfirm: 'Confirmar copia',
  duplicateConfirmLoading: 'Copiando…',
  duplicateSuccess: 'Plan copiado correctamente.',
  duplicateError: 'Error al duplicar el plan.',
  mealWithoutFoods: 'Sin alimentos enlazados',
} as const

const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const

function isValidIsoYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function rounded(value: number | null | undefined): number {
  return Math.round(finiteOrZero(value))
}

export function formatNutritionInteger(value: number | null | undefined): string {
  return rounded(value).toLocaleString('es-CL')
}

/** La card "Hoy" nunca cae a la primera fila de la timeline. */
export function findTodayNutritionRow<T extends CoachNutritionTimelineLike>(
  todayIso: string,
  timeline: readonly T[],
): T | null {
  return timeline.find((row) => row.date === todayIso) ?? null
}

export function nutritionTodayMealsLabel(done: number | null | undefined, total: number | null | undefined): string {
  return `${rounded(done)}/${rounded(total)} comidas`
}

export function nutritionKcalPerDayLabel(kcal: number | null | undefined): string | null {
  const value = finiteOrZero(kcal)
  return value > 0 ? `${formatNutritionInteger(value)} kcal / día` : null
}

export function nutritionPlanTitle(name: unknown): string {
  return `Plan · ${String(name ?? '')}`
}

export function nutritionHeatmapTone(
  hasLog: boolean,
  compliancePct: number | null | undefined,
): NutritionSemanticTone {
  if (!hasLog || compliancePct == null || !Number.isFinite(compliancePct)) return 'muted'
  if (compliancePct >= 80) return 'success'
  if (compliancePct >= 60) return 'warning'
  return 'danger'
}

export type NutritionHeatmapDay = {
  dateKey: string
  dayLabel: string
  hasLog: boolean
  compliancePct: number | null
  mealsDone: number
  mealsTotal: number
  tone: NutritionSemanticTone
  accessibilityLabel: string
}

/** 30 días CALENDARIO de Santiago, incluyendo días sin daily log. */
export function buildNutritionHeatmap30d(
  todayIso: string,
  timeline: readonly CoachNutritionTimelineLike[],
): NutritionHeatmapDay[] {
  if (!isValidIsoYmd(todayIso)) return []
  const byDate = new Map<string, CoachNutritionTimelineLike>()
  for (const row of timeline) byDate.set(row.date, row)

  return Array.from({ length: 30 }, (_, index) => {
    const dateKey = isoDateAddDays(todayIso, index - 29)
    const row = byDate.get(dateKey)
    const hasLog = row != null
    const compliancePct = hasLog && row.compliancePct != null && Number.isFinite(row.compliancePct)
      ? row.compliancePct
      : null
    const mealsDone = rounded(row?.mealsDone)
    const mealsTotal = rounded(row?.mealsTotal)
    return {
      dateKey,
      dayLabel: String(Number(dateKey.slice(8, 10))),
      hasLog,
      compliancePct,
      mealsDone,
      mealsTotal,
      tone: nutritionHeatmapTone(hasLog, compliancePct),
      accessibilityLabel: hasLog
        ? `${dateKey}: ${mealsDone}/${mealsTotal} comidas · ${compliancePct ?? 0}%`
        : `${dateKey}: sin registro`,
    }
  })
}

export function deriveNutritionHeadlineAdherence(
  allDays30d: number | null | undefined,
  monthlyAverage: number | null | undefined,
  weeklyAverage: number | null | undefined,
): number {
  if (allDays30d != null && Number.isFinite(allDays30d)) return allDays30d
  if (monthlyAverage != null && Number.isFinite(monthlyAverage)) return monthlyAverage
  return finiteOrZero(weeklyAverage)
}

export function nutritionRiskLabel(headlineAdherencePct: number): string {
  return `Adherencia nutricional en riesgo (${Math.round(headlineAdherencePct)}%)`
}

export function deriveNutritionRisk(input: {
  hasActivePlan: boolean
  kcalTarget: number | null | undefined
  headlineAdherencePct: number
}): { atRisk: boolean; tone: 'danger'; label: string | null } {
  const atRisk = input.hasActivePlan && finiteOrZero(input.kcalTarget) > 0 && input.headlineAdherencePct < 60
  return {
    atRisk,
    tone: 'danger',
    label: atRisk ? nutritionRiskLabel(input.headlineAdherencePct) : null,
  }
}

export function nutritionMonthlyAverageValue(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `${value}%` : '—'
}

export function nutritionStreakValue(days: number | null | undefined): string {
  return `${rounded(days)} d`
}

export function deriveNutritionWeekDelta(
  currentWeeklyAverage: number | null | undefined,
  previousWeeklyAverage: number | null | undefined,
): {
  delta: number
  roundedDelta: number
  trend: NutritionWeekTrend
  tone: 'success' | 'danger'
  valueLabel: string
} {
  const delta = finiteOrZero(currentWeeklyAverage) - finiteOrZero(previousWeeklyAverage)
  const roundedDelta = Math.round(delta)
  return {
    delta,
    roundedDelta,
    trend: delta > 1 ? 'up' : delta < -1 ? 'down' : 'flat',
    tone: delta >= 0 ? 'success' : 'danger',
    valueLabel: `${delta >= 0 ? '+' : ''}${roundedDelta}%`,
  }
}

export type NutritionChart7dDay = {
  dateKey: string
  dayLetter: string
  consumed: number
  target: number
  barHeightPct: number
  accessibilityLabel: string
}

export type NutritionChart7d = {
  days: NutritionChart7dDay[]
  scale: number
  targetLineTopPct: number | null
  targetLegendLabel: string | null
}

/** Siete días calendario (hoy incluido), con la misma escala + headroom 1.12 del web. */
export function buildNutritionKcalChart7d(
  todayIso: string,
  timeline: readonly CoachNutritionTimelineLike[],
  kcalTarget: number | null | undefined,
): NutritionChart7d {
  const target = finiteOrZero(kcalTarget)
  if (!isValidIsoYmd(todayIso)) {
    return { days: [], scale: Math.max(target, 1) * 1.12, targetLineTopPct: null, targetLegendLabel: null }
  }

  const byDate = new Map(timeline.map((row) => [row.date, row]))
  const baseDays = Array.from({ length: 7 }, (_, index) => {
    const dateKey = isoDateAddDays(todayIso, index - 6)
    const row = byDate.get(dateKey)
    const consumed = finiteOrZero(row?.consumedCalories)
    return {
      dateKey,
      dayLetter: DAY_LETTERS[new Date(`${dateKey}T12:00:00Z`).getUTCDay()] ?? '',
      consumed,
      target: finiteOrZero(row?.targetCalories) || target || 0,
    }
  })
  const scale = Math.max(target, ...baseDays.map((day) => day.consumed), 1) * 1.12
  const days = baseDays.map((day) => ({
    ...day,
    barHeightPct: (day.consumed / scale) * 100,
    accessibilityLabel: `${day.dateKey}: ${Math.round(day.consumed)} kcal`,
  }))

  return {
    days,
    scale,
    targetLineTopPct: target > 0 ? Math.max(0, 100 - (target / scale) * 100) : null,
    targetLegendLabel: target > 0 ? `Meta ${formatNutritionInteger(target)} kcal` : null,
  }
}

export type NutritionMacroShare = {
  kind: NutritionMacroKind
  name: 'Proteína' | 'Carbos' | 'Grasas'
  grams: number
  kcal: number
  kcalSharePct: number
  valueLabel: string
  caption: string
}

export function buildNutritionMacroShares(macros: NutritionMacroValues): NutritionMacroShare[] {
  const protein = finiteOrZero(macros.protein)
  const carbs = finiteOrZero(macros.carbs)
  const fats = finiteOrZero(macros.fats)
  const rows = [
    { kind: 'protein' as const, name: 'Proteína' as const, grams: Math.round(protein), kcal: protein * 4 },
    { kind: 'carbs' as const, name: 'Carbos' as const, grams: Math.round(carbs), kcal: carbs * 4 },
    { kind: 'fats' as const, name: 'Grasas' as const, grams: Math.round(fats), kcal: fats * 9 },
  ]
  const macroKcalTotal = rows.reduce((sum, row) => sum + row.kcal, 0) || 1
  return rows.map((row) => {
    const kcalSharePct = Math.round((row.kcal / macroKcalTotal) * 100)
    return {
      ...row,
      kcalSharePct,
      valueLabel: `${row.grams}g`,
      caption: `${row.name} · ${kcalSharePct}%`,
    }
  })
}

export type NutritionMacroProgress = {
  kind: NutritionMacroKind
  label: 'Proteína' | 'Carbohidratos' | 'Grasas'
  value: number
  target: number
  progressPct: number
  metaLabel: string
}

export function buildTodayNutritionMacroProgress(
  consumed: NutritionMacroValues,
  targets: NutritionMacroValues,
): NutritionMacroProgress[] {
  const rows = [
    { kind: 'protein' as const, label: 'Proteína' as const, value: finiteOrZero(consumed.protein), target: finiteOrZero(targets.protein) },
    { kind: 'carbs' as const, label: 'Carbohidratos' as const, value: finiteOrZero(consumed.carbs), target: finiteOrZero(targets.carbs) },
    { kind: 'fats' as const, label: 'Grasas' as const, value: finiteOrZero(consumed.fats), target: finiteOrZero(targets.fats) },
  ]
  return rows.map((row) => ({
    ...row,
    progressPct: row.target > 0 ? Math.min(100, Math.round((row.value / row.target) * 100)) : 0,
    metaLabel: `${Math.round(row.value)} / ${Math.round(row.target)} g`,
  }))
}

export function deriveTodayKcalProgress(
  consumedCalories: number | null | undefined,
  targetCalories: number | null | undefined,
): { consumed: number; target: number; progressPct: number; valueLabel: string; targetLabel: string } {
  const consumed = finiteOrZero(consumedCalories)
  const target = finiteOrZero(targetCalories)
  return {
    consumed,
    target,
    progressPct: target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0,
    valueLabel: formatNutritionInteger(consumed),
    targetLabel: `/ ${formatNutritionInteger(target)} kcal`,
  }
}

export type NutritionPlanFoodLike = {
  name?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fats_g?: number | null
}

export type NutritionPlanFoodItemLike = {
  id?: string | null
  quantity?: number | string | null
  unit?: string | null
  foods?: NutritionPlanFoodLike | null
}

export type NutritionPlanMealLike = {
  id: string
  name?: string | null
  description?: string | null
  food_items?: readonly NutritionPlanFoodItemLike[] | null
}

export type DerivedNutritionPlanMeal = {
  id: string
  name: string
  description: string | null
  protein: number
  carbs: number
  fats: number
  calories: number
  hasMacros: boolean
  macroLabel: string | null
  kcalLabel: string | null
  foods: Array<{
    key: string
    name: string
    detailLabel: string
  }>
  emptyFoodsLabel: string | null
}

/**
 * Espejo observable de B5: los totales de la fila multiplican cada macro del
 * alimento por `quantity` y usan 1 cuando la cantidad es 0/null/NaN.
 */
export function buildNutritionPlanMealRows(
  meals: readonly NutritionPlanMealLike[],
): DerivedNutritionPlanMeal[] {
  return meals.map((meal) => {
    const items = meal.food_items ?? []
    let protein = 0
    let carbs = 0
    let fats = 0
    let calories = 0

    for (const item of items) {
      const food = item.foods
      if (!food) continue
      const quantity = Number(item.quantity) || 1
      protein += finiteOrZero(food.protein_g) * quantity
      carbs += finiteOrZero(food.carbs_g) * quantity
      fats += finiteOrZero(food.fats_g) * quantity
      calories += finiteOrZero(food.calories) * quantity
    }

    const hasMacros = protein + carbs + fats > 0
    const description = String(meal.description ?? '').trim()
    return {
      id: String(meal.id),
      name: String(meal.name ?? ''),
      description: description ? String(meal.description) : null,
      protein,
      carbs,
      fats,
      calories,
      hasMacros,
      macroLabel: hasMacros
        ? `P ${Math.round(protein)}g · C ${Math.round(carbs)}g · G ${Math.round(fats)}g`
        : null,
      kcalLabel: calories > 0 ? `${Math.round(calories)} kcal` : null,
      foods: items.map((item, index) => {
        const food = item.foods
        const quantityLabel = item.quantity != null
          ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
          : ''
        const kcalLabel = food?.calories != null && Number.isFinite(food.calories)
          ? ` · ${Math.round(food.calories)} kcal`
          : ''
        return {
          key: item.id ?? `${food?.name ?? 'Alimento'}-${index}`,
          name: food?.name ?? 'Alimento',
          detailLabel: `${quantityLabel}${kcalLabel}`,
        }
      }),
      emptyFoodsLabel: items.length === 0 ? COACH_NUTRITION_DETAIL_COPY.mealWithoutFoods : null,
    }
  })
}
