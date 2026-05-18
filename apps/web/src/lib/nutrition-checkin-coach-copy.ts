/**
 * Copy determinista para cruce check-in (peso) ↔ adherencia nutrición (coach).
 * No es diagnóstico médico: guía de seguimiento operativo.
 */

export function coachCheckinNutritionCaution(
  /** Pesos más recientes primero; solo números finitos. */
  weightsKgNewestFirst: number[],
  weeklyNutritionAdherencePct: number
): string | null {
  if (weightsKgNewestFirst.length < 2) return null
  const [latest, older] = weightsKgNewestFirst
  const delta = older - latest
  if (delta < 1.5) return null
  if (weeklyNutritionAdherencePct >= 38) return null
  return 'El peso bajó varios kg respecto al check-in anterior y la adherencia nutricional de la semana es baja. Vale la pena revisar déficit, hambre y sostenibilidad del plan con el alumno.'
}
