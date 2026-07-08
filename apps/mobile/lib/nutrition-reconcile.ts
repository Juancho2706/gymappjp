// Adaptador PURO (sin supabase/RN/expo) de la cascade-safety de nutrición para mobile.
// Mapea las filas de comidas existentes + las comidas del draft (re-indexadas 0..n-1, que es
// la convención de order_index que usan los save-paths mobile) al input de `reconcileMeals`
// (@eva/nutrition-engine — la MISMA fn pura testeada que usa la web). El fetch impuro de
// `loggedMealIds` vive en `nutrition-builder.ts` (toca supabase); acá solo la decisión pura.
//
// Bug que cierra (G08 §2.2, DATA-LOSS vivo en prod): antes mobile borraba comidas
// huérfanas/sobrantes INCONDICIONALMENTE al editar un plan / propagar una plantilla más corta,
// destruyendo `nutrition_meal_logs` (FK meal_id -> nutrition_meals, ON DELETE CASCADE/SET NULL).
import type { ExistingMeal, ReconcileTemplateMeal } from '@eva/nutrition-engine'

export type ReconcileDraftMeal = { name: string; description: string; day_of_week: number | null }

export type MealReconcileInput = {
  existingMeals: ExistingMeal[]
  templateMeals: ReconcileTemplateMeal[]
  /** ids de comidas cuyo order_index quedó FUERA del nuevo set -> candidatos a borrar. Se usan
   *  para acotar el fetch de nutrition_meal_logs (reconcileMeals solo consulta logs de estas). */
  removalCandidates: string[]
}

/**
 * Construye el input de `reconcileMeals` desde las filas mobile. Las comidas del draft se
 * re-indexan a 0..n-1 (idéntico a cómo `saveClientPlan`/`propagateTemplate` reasignan
 * order_index al guardar), y `existingMeals` debe venir con el `order_index` en la MISMA
 * convención con la que el save-path emparejará (real para saveClientPlan; posición para
 * propagateTemplate).
 */
export function buildMealReconcileInput(
  existingMeals: ExistingMeal[],
  draftMeals: ReconcileDraftMeal[]
): MealReconcileInput {
  const templateMeals: ReconcileTemplateMeal[] = draftMeals.map((m, i) => ({
    order_index: i,
    name: m.name,
    description: m.description,
    day_of_week: m.day_of_week,
  }))
  const newIndices = new Set(templateMeals.map((t) => t.order_index))
  const removalCandidates = existingMeals
    .filter((m) => !newIndices.has(m.order_index))
    .map((m) => m.id)
  return { existingMeals, templateMeals, removalCandidates }
}
