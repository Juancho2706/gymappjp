import type { NutritionMealSlot } from './catalog'
import { calculateFoodItemMacros } from './macros'

export const NUTRITION_MEAL_SLOT_IDS = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'other',
] as const satisfies readonly NutritionMealSlot[]

export const NUTRITION_MEAL_SLOT_LABELS: Record<NutritionMealSlot, string> = {
  breakfast: 'Desayuno',
  morning_snack: 'Colación mañana',
  lunch: 'Almuerzo',
  afternoon_snack: 'Colación tarde',
  dinner: 'Cena',
  other: 'Otro',
}

export type IntakeMacroEntry = {
  quantity: number
  unit: string
  snapshot_calories?: number | null
  snapshot_protein_g?: number | null
  snapshot_carbs_g?: number | null
  snapshot_fats_g?: number | null
  snapshot_fiber_g?: number | null
  snapshot_serving_size?: number | null
  snapshot_serving_unit?: string | null
  food?: {
    name?: string | null
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fats_g?: number | null
    fiber_g?: number | null
    serving_size?: number | null
    serving_unit?: string | null
  } | null
}

export type IntakeMacros = {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
}

const ZERO: IntakeMacros = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
  fiber: 0,
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function safeNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeNutritionMealSlot(value: unknown): NutritionMealSlot {
  return NUTRITION_MEAL_SLOT_IDS.includes(value as NutritionMealSlot)
    ? (value as NutritionMealSlot)
    : 'other'
}

export function calculateIntakeEntryMacros(entry: IntakeMacroEntry): IntakeMacros {
  const servingSize = safeNumber(entry.snapshot_serving_size)
    || safeNumber(entry.food?.serving_size)
    || 100
  const servingUnit = entry.snapshot_serving_unit
    ?? entry.food?.serving_unit
    ?? null

  const calories = entry.snapshot_calories ?? entry.food?.calories ?? 0
  const protein = entry.snapshot_protein_g ?? entry.food?.protein_g ?? 0
  const carbs = entry.snapshot_carbs_g ?? entry.food?.carbs_g ?? 0
  const fats = entry.snapshot_fats_g ?? entry.food?.fats_g ?? 0
  const fiberPer100 = entry.snapshot_fiber_g ?? entry.food?.fiber_g ?? 0

  const macros = calculateFoodItemMacros({
    quantity: safeNumber(entry.quantity),
    unit: entry.unit,
    foods: {
      name: entry.food?.name ?? '',
      calories: safeNumber(calories),
      protein_g: safeNumber(protein),
      carbs_g: safeNumber(carbs),
      fats_g: safeNumber(fats),
      serving_size: servingSize,
      serving_unit: servingUnit,
    },
  })

  const normalizedUnit = String(entry.unit ?? '').toLowerCase()
  const gramsEquivalent = normalizedUnit === 'g' || normalizedUnit === 'ml'
    ? safeNumber(entry.quantity)
    : safeNumber(entry.quantity) * servingSize

  return {
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fats: macros.fats,
    fiber: round1(safeNumber(fiberPer100) * gramsEquivalent / 100),
  }
}

export function calculateIntakeEntriesTotals(
  entries: readonly IntakeMacroEntry[],
): IntakeMacros {
  return entries.reduce<IntakeMacros>((acc, entry) => {
    const macros = calculateIntakeEntryMacros(entry)
    return {
      calories: round1(acc.calories + macros.calories),
      protein: round1(acc.protein + macros.protein),
      carbs: round1(acc.carbs + macros.carbs),
      fats: round1(acc.fats + macros.fats),
      fiber: round1(acc.fiber + macros.fiber),
    }
  }, { ...ZERO })
}

export function combineNutritionMacros(
  left: Pick<IntakeMacros, 'calories' | 'protein' | 'carbs' | 'fats'>,
  right: Pick<IntakeMacros, 'calories' | 'protein' | 'carbs' | 'fats'>,
): Omit<IntakeMacros, 'fiber'> {
  return {
    calories: round1(left.calories + right.calories),
    protein: round1(left.protein + right.protein),
    carbs: round1(left.carbs + right.carbs),
    fats: round1(left.fats + right.fats),
  }
}

export function nutritionTargetPercent(consumed: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0
  return Math.max(0, Math.round((consumed / target) * 100))
}
