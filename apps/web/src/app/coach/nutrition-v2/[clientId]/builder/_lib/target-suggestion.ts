/**
 * "Sugerir metas" del paso 1 del creador V2 (BD1) — logica PURA, sin React/Next/Supabase.
 *
 * Es la regresion que dejo V2 al nacer: el creador V1 (`nutrition-plans/.../PlanBuilderSidebar`)
 * sugeria kcal y macros desde el perfil del alumno y aca el coach tenia que inventarlas a mano.
 *
 * NADA se calcula en este archivo: todo delega en el motor compartido
 * (`@eva/nutrition-engine/tdee`, el MISMO que usa V1) — Mifflin-St Jeor -> TDEE -> objetivo
 * calorico -> reparto protein-forward. Aca solo vive la traduccion "campos de texto de la UI ->
 * entrada del motor" y la LINEA DE SUPUESTOS, que es lo que convierte la sugerencia en algo
 * auditable en vez de una caja negra: la formula, el factor de actividad, el ajuste por objetivo
 * y los g/kg de proteina REALES (derivados del resultado, no del catalogo de constantes).
 */

import {
  ACTIVITY_FACTORS,
  computeMifflinStJeor,
  computeTDEE,
  deriveCalorieTarget,
  deriveMacroTargets,
  type ActivityLevel,
  type Goal,
  type Sex,
} from '@eva/nutrition-engine'

export type SuggestionSex = Sex
export type SuggestionActivity = ActivityLevel
export type SuggestionGoal = Goal

/** Rangos aceptados de los campos editables. Fuera de rango => sin sugerencia (nunca un numero absurdo). */
export const SUGGESTION_LIMITS = {
  age: { min: 10, max: 99 },
  weightKg: { min: 25, max: 400 },
  heightCm: { min: 100, max: 250 },
} as const

/** Opciones del select de actividad, en el orden de lectura, con el factor a la vista. */
export const SUGGESTION_ACTIVITY_OPTIONS: ReadonlyArray<{ value: SuggestionActivity; label: string }> = [
  { value: 'sedentary', label: 'Sedentario (×1,2)' },
  { value: 'light', label: 'Ligera (×1,375)' },
  { value: 'moderate', label: 'Moderada (×1,55)' },
  { value: 'active', label: 'Alta (×1,725)' },
  { value: 'very_active', label: 'Muy alta (×1,9)' },
]

/** Opciones del select de objetivo. Los porcentajes salen de `GOAL_CALORIE_MULTIPLIER` del motor. */
export const SUGGESTION_GOAL_OPTIONS: ReadonlyArray<{ value: SuggestionGoal; label: string }> = [
  { value: 'lose', label: 'Déficit (−15%)' },
  { value: 'maintain', label: 'Mantener' },
  { value: 'gain', label: 'Superávit (+10%)' },
]

export const SUGGESTION_SEX_OPTIONS: ReadonlyArray<{ value: SuggestionSex; label: string }> = [
  { value: 'female', label: 'Femenino' },
  { value: 'male', label: 'Masculino' },
]

/** Fragmento de la linea de supuestos por actividad ("actividad moderada"). */
const ACTIVITY_ASSUMPTION: Record<SuggestionActivity, string> = {
  sedentary: 'actividad sedentaria',
  light: 'actividad ligera',
  moderate: 'actividad moderada',
  active: 'actividad alta',
  very_active: 'actividad muy alta',
}

/** Fragmento de la linea de supuestos por objetivo. */
const GOAL_ASSUMPTION: Record<SuggestionGoal, string> = {
  lose: 'déficit 15%',
  maintain: 'mantención',
  gain: 'superávit 10%',
}

/** Campos editables del panel (todos texto: se tipean a mano y pueden venir vacios). */
export interface SuggestionForm {
  age: string
  weightKg: string
  heightCm: string
  sex: SuggestionSex
  activity: SuggestionActivity
  goal: SuggestionGoal
}

export interface SuggestedTargets {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  /** Metabolismo basal (kcal/día) — se muestra para que la cadena sea auditable. */
  bmr: number
  /** Gasto total estimado (kcal/día) ANTES del ajuste por objetivo. */
  tdee: number
  /** g/kg de proteína REALES del resultado (protein_g / peso), no la constante del motor. */
  proteinPerKg: number
  /** "Mifflin-St Jeor · actividad moderada · déficit 15% · P 2,0 g/kg". */
  assumptions: string
}

/** Numero desde un campo de texto es-CL (acepta coma decimal); null si no parsea. */
export function parseSuggestionNumber(value: string): number | null {
  const trimmed = String(value ?? '').trim().replace(',', '.')
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function withinRange(value: number | null, range: { min: number; max: number }): value is number {
  return value !== null && value >= range.min && value <= range.max
}

/** "2" -> "2", "2.05" -> "2,1" (1 decimal, coma es-CL). Sin `toLocaleString`: determinista en tests. */
export function formatProteinPerKg(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return String(rounded).replace('.', ',')
}

/**
 * Metas sugeridas para el formulario dado, o `null` si falta (o no es razonable) alguno de los
 * tres datos duros. Nunca lanza: el panel se pinta igual con los campos vacios y simplemente no
 * muestra resultado hasta que se completen.
 */
export function suggestTargets(form: SuggestionForm): SuggestedTargets | null {
  const age = parseSuggestionNumber(form.age)
  const weightKg = parseSuggestionNumber(form.weightKg)
  const heightCm = parseSuggestionNumber(form.heightCm)
  if (!withinRange(age, SUGGESTION_LIMITS.age)) return null
  if (!withinRange(weightKg, SUGGESTION_LIMITS.weightKg)) return null
  if (!withinRange(heightCm, SUGGESTION_LIMITS.heightCm)) return null

  const bmr = computeMifflinStJeor({ sex: form.sex, weightKg, heightCm, age })
  const tdee = computeTDEE(bmr, ACTIVITY_FACTORS[form.activity])
  const calories = deriveCalorieTarget(tdee, form.goal)
  const macros = deriveMacroTargets(calories, weightKg, form.goal)
  const proteinPerKg = Math.round((macros.protein_g / weightKg) * 10) / 10

  return {
    calories,
    proteinG: macros.protein_g,
    carbsG: macros.carbs_g,
    fatsG: macros.fats_g,
    bmr,
    tdee,
    proteinPerKg,
    assumptions:
      'Mifflin-St Jeor · ' +
      ACTIVITY_ASSUMPTION[form.activity] +
      ' · ' +
      GOAL_ASSUMPTION[form.goal] +
      ' · P ' +
      formatProteinPerKg(proteinPerKg) +
      ' g/kg',
  }
}

/**
 * Datos del alumno que la page resuelve server-side. Todos anulables a proposito: un alumno sin
 * ficha de ingreso (o sin fecha de nacimiento) tiene que poder usar el panel igual, a mano.
 */
export interface BuilderClientMetrics {
  age: number | null
  weightKg: number | null
  heightCm: number | null
  sex: SuggestionSex | null
}

/**
 * Formulario inicial del panel: precargado con lo que sepamos del alumno y con los defaults del
 * producto para lo que no es un dato (actividad moderada, mantención). Sin alumno (modo
 * plantilla) devuelve exactamente lo mismo con los tres campos duros vacios.
 */
export function initialSuggestionForm(metrics: BuilderClientMetrics | null): SuggestionForm {
  return {
    age: metrics?.age != null ? String(metrics.age) : '',
    weightKg: metrics?.weightKg != null ? String(metrics.weightKg) : '',
    heightCm: metrics?.heightCm != null ? String(metrics.heightCm) : '',
    sex: metrics?.sex ?? 'female',
    activity: 'moderate',
    goal: 'maintain',
  }
}
