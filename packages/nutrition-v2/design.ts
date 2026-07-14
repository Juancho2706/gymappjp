import { DURATION, EASING, SPRING } from '@eva/brand-kit'

export type NutritionMacroKey = 'protein' | 'carbs' | 'fats'
export type NutritionStrategy = 'structured' | 'flexible' | 'hybrid'
export type NutritionSyncState = 'synced' | 'pending' | 'syncing' | 'error' | 'offline'
export type NutritionSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export type NutritionTone = 'neutral' | 'brand' | 'nutrition' | 'success' | 'warning' | 'danger' | 'info'

export const NUTRITION_MACROS = {
  protein: {
    label: 'Proteína',
    shortLabel: 'P',
    webColor: 'var(--ember-500)',
    webTextClass: 'text-ember-700 dark:text-ember-300',
    webBarClass: 'bg-ember-500',
    nativeClass: 'bg-ember-500',
  },
  carbs: {
    label: 'Carbohidratos',
    shortLabel: 'C',
    webColor: 'var(--sport-500)',
    webTextClass: 'text-sport-700 dark:text-sport-300',
    webBarClass: 'bg-sport-500',
    nativeClass: 'bg-sport-500',
  },
  fats: {
    label: 'Grasas',
    shortLabel: 'G',
    webColor: 'var(--aqua-500)',
    webTextClass: 'text-aqua-700 dark:text-aqua-300',
    webBarClass: 'bg-aqua-500',
    nativeClass: 'bg-aqua-500',
  },
} as const satisfies Record<
  NutritionMacroKey,
  {
    label: string
    shortLabel: string
    webColor: string
    webTextClass: string
    webBarClass: string
    nativeClass: string
  }
>

export const NUTRITION_STRATEGIES: Record<
  NutritionStrategy,
  { label: string; shortLabel: string; description: string }
> = {
  structured: {
    label: 'Plan estructurado',
    shortLabel: 'Estructurado',
    description: 'Comidas, alimentos y cantidades prescritas por el profesional.',
  },
  flexible: {
    label: 'Objetivos flexibles',
    shortLabel: 'Flexible',
    description: 'Metas diarias de energía y macros con elección libre de alimentos.',
  },
  hybrid: {
    label: 'Plan híbrido',
    shortLabel: 'Híbrido',
    description: 'Anclas prescritas combinadas con un presupuesto flexible restante.',
  },
}

export const NUTRITION_MOTION = {
  press: {
    duration: DURATION.instant,
    easing: EASING.out,
    scale: 0.98,
  },
  selection: {
    duration: DURATION.fast,
    easing: EASING.out,
    spring: SPRING.ui,
  },
  feedback: {
    duration: DURATION.base,
    easing: EASING.out,
  },
  layout: {
    duration: DURATION.base,
    easing: EASING.inOut,
  },
  emphasis: {
    duration: DURATION.slow,
    easing: EASING.emphasis,
  },
  celebration: {
    duration: DURATION.slower,
    easing: EASING.emphasis,
  },
} as const

export const NUTRITION_WEB_TONE_CLASSES: Record<NutritionTone, string> = {
  neutral: 'border-border-subtle bg-surface-card text-strong',
  brand: 'border-sport-300/50 bg-sport-100/70 text-sport-700 dark:border-sport-600/40 dark:bg-sport-100/20 dark:text-sport-300',
  nutrition: 'border-ember-300/50 bg-ember-100/70 text-ember-700 dark:border-ember-600/40 dark:bg-ember-100/20 dark:text-ember-300',
  success: 'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  warning: 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200',
  danger: 'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300',
  info: 'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-300',
}

export const NUTRITION_NATIVE_TONE_CLASSES: Record<NutritionTone, string> = {
  neutral: 'border-border-subtle bg-surface-card',
  brand: 'border-sport-300 bg-sport-100',
  nutrition: 'border-ember-300 bg-ember-100',
  success: 'border-success-500/30 bg-success-500/10',
  warning: 'border-warning-500/30 bg-warning-500/10',
  danger: 'border-danger-500/30 bg-danger-500/10',
  info: 'border-aqua-500/30 bg-aqua-500/10',
}

export type MacroProgressState = 'empty' | 'under' | 'in-range' | 'over'

export function clampNutritionProgress(consumed: number, target: number, cap = 1.15): number {
  if (!Number.isFinite(consumed) || !Number.isFinite(target) || target <= 0) return 0
  return Math.max(0, Math.min(consumed / target, cap))
}

export function nutritionProgressPercent(consumed: number, target: number): number {
  return Math.round(clampNutritionProgress(consumed, target, 1) * 100)
}

export function resolveMacroProgressState(
  consumed: number,
  target: number,
  tolerancePercent = 5,
): MacroProgressState {
  if (target <= 0 || consumed <= 0) return 'empty'
  const lower = target * (1 - tolerancePercent / 100)
  const upper = target * (1 + tolerancePercent / 100)
  if (consumed < lower) return 'under'
  if (consumed > upper) return 'over'
  return 'in-range'
}

export function formatNutritionAmount(value: number, unit = 'g', maximumFractionDigits = 0): string {
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits }).format(value)} ${unit}`
}

export function formatNutritionCalories(value: number): string {
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(value)} kcal`
}

export interface NutritionMacroValue {
  macro: NutritionMacroKey
  consumed: number
  target: number
  unit?: string
  tolerancePercent?: number
}

export function createNutritionMacroValue(
  macro: NutritionMacroKey,
  value: Omit<NutritionMacroValue, 'macro'>,
): NutritionMacroValue {
  return { macro, ...value }
}

export interface NutritionFoodRowModel {
  id: string
  name: string
  detail?: string | null
  thumbnailUrl?: string | null
  quantityLabel: string
  calories?: number | null
  proteinG?: number | null
  carbsG?: number | null
  fatsG?: number | null
  status?: 'default' | 'pending' | 'corrected' | 'offline' | 'error'
}

export interface NutritionMealSlotModel {
  id: string
  name: string
  timeLabel?: string | null
  prescriptionLabel?: string | null
  state: 'empty' | 'prescribed' | 'partial' | 'consumed' | 'different' | 'corrected' | 'offline'
  subtotalCalories?: number | null
  foods: NutritionFoodRowModel[]
}

export interface NutritionAttentionModel {
  id: string
  title: string
  description: string
  reason: string
  tone: Extract<NutritionTone, 'neutral' | 'warning' | 'danger' | 'info'>
  actionLabel: string
}

export interface NutritionBuilderStepModel {
  id: string
  label: string
  description?: string
  state: 'upcoming' | 'current' | 'complete' | 'error'
}
