// Port 1:1 de la web (PlanBuilder/PlanBuilderSidebar.calcMacros) — Mifflin-St Jeor + actividad + objetivo.
// N-F3: el builder de nutrición RN no tenía calculadora de metas; esto la provee (lógica pura).

export type ActivityKey = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type GoalKey = 'cut' | 'maintain' | 'bulk'
export interface MacroGoals { calories: number; protein: number; carbs: number; fats: number }

export const ACTIVITY_MULTIPLIERS: Record<ActivityKey, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export const GOAL_ADJUSTMENTS: Record<GoalKey, { kcalDelta: number; proteinMultiplier: number; label: string }> = {
  cut: { kcalDelta: -400, proteinMultiplier: 2.2, label: 'Déficit (bajar grasa)' },
  maintain: { kcalDelta: 0, proteinMultiplier: 1.8, label: 'Mantención' },
  bulk: { kcalDelta: 300, proteinMultiplier: 2.0, label: 'Volumen (ganar músculo)' },
}

export const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  sedentary: 'Sedentario',
  light: 'Ligero (1–3 d/sem)',
  moderate: 'Moderado (3–5 d/sem)',
  active: 'Activo (6–7 d/sem)',
  very_active: 'Muy activo',
}

export function calcMacros(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  gender: 'M' | 'F',
  activity: ActivityKey,
  goal: GoalKey
): MacroGoals {
  const bmr =
    gender === 'M'
      ? 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activity]
  const adj = GOAL_ADJUSTMENTS[goal]
  const calories = Math.round(tdee + adj.kcalDelta)
  const protein = Math.round(weightKg * adj.proteinMultiplier)
  const fats = Math.round(weightKg * 0.9)
  const carbsKcal = calories - protein * 4 - fats * 9
  const carbs = Math.max(0, Math.round(carbsKcal / 4))
  return { calories, protein, carbs, fats }
}
