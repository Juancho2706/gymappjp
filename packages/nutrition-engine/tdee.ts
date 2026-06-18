/**
 * Energy & macro target estimation — PURE functions (no IO).
 *
 * Mifflin-St Jeor BMR → TDEE → calorie target by goal → protein-forward macro
 * split. Sin Next.js / Supabase / React / RN. Reutilizable web + mobile.
 *
 * Referencias:
 * - Mifflin MD, St Jeor ST, et al. (1990) — ecuación predictiva de RMR.
 * - Protein-forward: 1.6–2.2 g/kg (ISSN position stand 2017).
 * - Fats 20–35% kcal; aquí 25–30% según objetivo, resto a carbohidratos.
 */

export type Sex = 'male' | 'female'
export type Goal = 'lose' | 'maintain' | 'gain'

export type MifflinInput = {
  sex: Sex
  /** Peso corporal en kilogramos. */
  weightKg: number
  /** Estatura en centímetros. */
  heightCm: number
  /** Edad en años. */
  age: number
}

export type MacroTargets = {
  protein_g: number
  carbs_g: number
  fats_g: number
}

/** Kcal por gramo de cada macronutriente (Atwater redondeado). */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fats: 9 } as const

/**
 * Factores de actividad estándar (multiplicadores de TDEE sobre BMR).
 * Útil para UIs que ofrecen un dropdown en vez de un número crudo.
 */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2, // poco o nada de ejercicio
  light: 1.375, // ejercicio ligero 1–3 días/sem
  moderate: 1.55, // ejercicio moderado 3–5 días/sem
  active: 1.725, // ejercicio intenso 6–7 días/sem
  very_active: 1.9, // físico muy intenso / trabajo físico
} as const

export type ActivityLevel = keyof typeof ACTIVITY_FACTORS

/** Ajuste calórico por objetivo (déficit/superávit moderado ~15%). */
export const GOAL_CALORIE_MULTIPLIER: Record<Goal, number> = {
  lose: 0.85,
  maintain: 1,
  gain: 1.1,
}

/** Proteína objetivo (g/kg) por objetivo — protein-forward. */
export const GOAL_PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose: 2.2, // preservar masa magra en déficit
  maintain: 1.8,
  gain: 1.6, // superávit con foco en carbohidratos
}

/** Fracción de calorías provenientes de grasa por objetivo (25–30%). */
export const GOAL_FAT_KCAL_FRACTION: Record<Goal, number> = {
  lose: 0.3,
  maintain: 0.275,
  gain: 0.25,
}

const round = (n: number): number => Math.round(n)

/**
 * Tasa metabólica basal (BMR) vía Mifflin-St Jeor.
 *   male:   10·kg + 6.25·cm − 5·age + 5
 *   female: 10·kg + 6.25·cm − 5·age − 161
 * Devuelve kcal/día redondeado al entero.
 */
export function computeMifflinStJeor({
  sex,
  weightKg,
  heightCm,
  age,
}: MifflinInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  const bmr = sex === 'male' ? base + 5 : base - 161
  return round(bmr)
}

/**
 * TDEE = BMR · factor de actividad. Acepta un número crudo o una
 * `ActivityLevel` conocida. Devuelve kcal/día redondeado.
 */
export function computeTDEE(
  bmr: number,
  activityFactor: number | ActivityLevel
): number {
  const factor =
    typeof activityFactor === 'number'
      ? activityFactor
      : ACTIVITY_FACTORS[activityFactor]
  return round(bmr * factor)
}

/**
 * Calorías objetivo según objetivo (déficit/mantención/superávit).
 * Devuelve kcal/día redondeado.
 */
export function deriveCalorieTarget(tdee: number, goal: Goal): number {
  return round(tdee * GOAL_CALORIE_MULTIPLIER[goal])
}

/**
 * Reparto de macros protein-forward a partir de calorías y peso:
 *  - proteína: g/kg fijo por objetivo (1.6–2.2)
 *  - grasa: 25–30% de las calorías
 *  - carbohidratos: calorías restantes
 *
 * Si proteína + grasa exceden las calorías (peso alto / kcal bajas), los
 * carbohidratos se truncan a 0 y nunca salen negativos. Gramos redondeados.
 */
export function deriveMacroTargets(
  calories: number,
  weightKg: number,
  goal: Goal
): MacroTargets {
  const protein_g = round(GOAL_PROTEIN_G_PER_KG[goal] * weightKg)
  const fats_g = round((calories * GOAL_FAT_KCAL_FRACTION[goal]) / KCAL_PER_GRAM.fats)

  const proteinKcal = protein_g * KCAL_PER_GRAM.protein
  const fatKcal = fats_g * KCAL_PER_GRAM.fats
  const remainingKcal = calories - proteinKcal - fatKcal
  const carbs_g = round(Math.max(0, remainingKcal) / KCAL_PER_GRAM.carbs)

  return { protein_g, carbs_g, fats_g }
}
