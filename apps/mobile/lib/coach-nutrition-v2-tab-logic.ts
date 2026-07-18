/**
 * coach-nutrition-v2-tab-logic — helper PURO (sin react-native / supabase) que colapsa el read model
 * profesional de Nutricion V2 (`NutritionClientDetailReadModel`) al view model que consume el resumen
 * V2 del tab de nutricion de la ficha de alumno del coach (paralelo del tab web de Tanda 8).
 *
 * Vive fuera de los V2_ROOTS del boundary guard a proposito: es logica neutral y testeable que la UI
 * (NutricionTab / NutritionV2Summary) importa. No renderiza nada.
 */
import {
  NUTRITION_STRATEGIES,
  type NutritionClientDetailReadModel,
  type NutritionStrategy,
} from '@eva/nutrition-v2'

export type NutritionV2MacroKey = 'protein' | 'carbs' | 'fats'

export type NutritionV2MacroLine = {
  key: NutritionV2MacroKey
  label: string
  consumed: number
  target: number
  /** 0..100, capeado (nunca sobre 100 aunque el consumo exceda la meta). */
  progressPct: number
  /** "X / Y g" con enteros redondeados. */
  metaLabel: string
}

export type NutritionV2CaloriesLine = {
  consumed: number
  target: number
  progressPct: number
  remaining: number
}

export type NutritionV2TabViewModel = {
  clientName: string
  localDate: string
  /** Hay un plan vigente para hoy (today.plan != null). */
  hasPlan: boolean
  strategy: NutritionStrategy | null
  strategyLabel: string | null
  planName: string | null
  versionNumber: number | null
  status: 'published' | 'superseded' | null
  calories: NutritionV2CaloriesLine
  macros: NutritionV2MacroLine[]
  /** Hay al menos un registro de consumo hoy (entryCount > 0). */
  hasIntakeToday: boolean
}

const MACRO_LABELS: Record<NutritionV2MacroKey, string> = {
  protein: 'Proteína',
  carbs: 'Carbohidratos',
  fats: 'Grasas',
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function progressPct(consumed: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0
}

/**
 * Colapsa el read model del dia al view model del resumen. `null` solo cuando NO hay detail (el caller
 * cae a V1). Con detail pero sin plan vigente devuelve un view model con `hasPlan=false` para que la UI
 * muestre el estado "sin plan V2" + CTA a la ficha completa.
 */
export function buildNutritionV2TabViewModel(
  detail: NutritionClientDetailReadModel | null | undefined,
): NutritionV2TabViewModel | null {
  if (!detail) return null

  const { today } = detail
  const plan = today.plan
  const consumed = today.consumed
  const targets = today.targets

  const caloriesConsumed = finiteOrZero(consumed.calories)
  const caloriesTarget = finiteOrZero(targets.calories)

  const macroDefs: Array<{ key: NutritionV2MacroKey; consumed: number; target: number }> = [
    { key: 'protein', consumed: finiteOrZero(consumed.proteinG), target: finiteOrZero(targets.proteinG) },
    { key: 'carbs', consumed: finiteOrZero(consumed.carbsG), target: finiteOrZero(targets.carbsG) },
    { key: 'fats', consumed: finiteOrZero(consumed.fatsG), target: finiteOrZero(targets.fatsG) },
  ]

  return {
    clientName: detail.client.fullName,
    localDate: today.localDate,
    hasPlan: plan != null,
    strategy: plan?.strategy ?? null,
    strategyLabel: plan ? NUTRITION_STRATEGIES[plan.strategy].label : null,
    planName: plan?.name ?? null,
    versionNumber: plan?.versionNumber ?? null,
    status: plan?.status ?? null,
    calories: {
      consumed: caloriesConsumed,
      target: caloriesTarget,
      progressPct: progressPct(caloriesConsumed, caloriesTarget),
      remaining: Math.max(caloriesTarget - caloriesConsumed, 0),
    },
    macros: macroDefs.map((macro) => ({
      key: macro.key,
      label: MACRO_LABELS[macro.key],
      consumed: macro.consumed,
      target: macro.target,
      progressPct: progressPct(macro.consumed, macro.target),
      metaLabel: `${Math.round(macro.consumed)} / ${Math.round(macro.target)} g`,
    })),
    hasIntakeToday: finiteOrZero(consumed.entryCount) > 0,
  }
}
