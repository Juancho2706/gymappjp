import { DURATION, EASING, SPRING } from '@eva/brand-kit'

export type NutritionMacroKey = 'protein' | 'carbs' | 'fats'
export type NutritionStrategy = 'structured' | 'flexible' | 'hybrid'
export type NutritionSyncState = 'synced' | 'pending' | 'syncing' | 'error' | 'offline'
export type NutritionSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export type NutritionTone = 'neutral' | 'brand' | 'nutrition' | 'success' | 'warning' | 'danger' | 'info'

/**
 * Paleta de macros: TRIO FIJO (decision owner 2026-08-07, opcion 2; ejecutada en T2.7 F1).
 * P #5E9FD6 · C #FFB74D · G #81C784 — los tokens canonicos `--color-macro-*` que las superficies
 * V1 usan desde el overhaul, ahora tambien en V2 y RN. Es data-viz categorical: JAMAS sigue la
 * marca del coach (antes carbos montaba la rampa sport white-label) y es identica en claro y
 * oscuro (practica de prod de V1; las variantes `-dark` de globals.css siguen sin usarse).
 * Web: tokens dentro de `@theme` ⇒ `text-macro-*` / `bg-macro-*` se generan solos.
 * RN: mismos nombres, canales en `apps/mobile/global.css` + `macro.*` en tailwind.config.js.
 */
export const NUTRITION_MACROS = {
  protein: {
    label: 'Proteína',
    shortLabel: 'P',
    webColor: 'var(--color-macro-protein)',
    webTextClass: 'text-macro-protein',
    webBarClass: 'bg-macro-protein',
    nativeClass: 'bg-macro-protein',
  },
  carbs: {
    label: 'Carbohidratos',
    shortLabel: 'C',
    webColor: 'var(--color-macro-carbs)',
    webTextClass: 'text-macro-carbs',
    webBarClass: 'bg-macro-carbs',
    nativeClass: 'bg-macro-carbs',
  },
  fats: {
    label: 'Grasas',
    shortLabel: 'G',
    webColor: 'var(--color-macro-fats)',
    webTextClass: 'text-macro-fats',
    webBarClass: 'bg-macro-fats',
    nativeClass: 'bg-macro-fats',
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
  // white-label: acento nutricion = primary del coach (antes ember/naranja fijo)
  nutrition: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  warning: 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200',
  danger: 'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300',
  info: 'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-300',
}

export const NUTRITION_NATIVE_TONE_CLASSES: Record<NutritionTone, string> = {
  neutral: 'border-border-subtle bg-surface-card',
  brand: 'border-sport-300 bg-sport-100',
  // white-label: acento nutricion = primary del coach (antes ember/naranja fijo)
  nutrition: 'border-primary/30 bg-primary/10',
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
