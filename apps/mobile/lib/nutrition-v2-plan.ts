/**
 * nutrition-v2-plan — helpers PUROS (sin react-native / supabase) de la Vista Plan del alumno.
 *
 * `describeItemGuidance` es un port 1:1 del helper web
 * (`apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/PlanVariantCard.tsx`): arma la nota
 * de guía de un ítem prescrito combinando el rango de cantidad ajustable ("Ajustable entre X y Y"
 * / "Hasta X" / "Desde X") con las indicaciones del coach, unidas por " · ". Devuelve null si
 * no hay ni rango ni notas.
 *
 * La regla de "qué nota se muestra" (`resolveItemDisplayNote`) ya NO vive acá ni en el web: es
 * gramática compartida de `@eva/nutrition-v2/plan-substitutions`. Se re-exporta desde este módulo
 * porque la pantalla del alumno la consume junto con la guía y así el import de la vista es uno
 * solo.
 */
import { formatNutritionAmount, resolveItemDisplayNote } from '@eva/nutrition-v2'

export { resolveItemDisplayNote }

/** Forma estructural mínima del ítem prescrito que consume la guía (espejo del read-model). */
export type PlanItemGuidance = {
  unit: string
  minimumQuantity: number | null
  maximumQuantity: number | null
  notes: string | null
}

/**
 * Nota de guía de un item prescrito: rango de cantidad ajustable + indicaciones del coach.
 *
 * `hasStructuredSubstitutions` (SUB-T10) calla el texto LEGADO "Alternativas: …" congelado en
 * `notes` cuando el item ya tiene reemplazos estructurados — si no, el alumno lee la misma lista
 * dos veces. Default `false` ⇒ comportamiento idéntico al de antes.
 */
export function describeItemGuidance(
  item: PlanItemGuidance,
  hasStructuredSubstitutions = false,
): string | null {
  const unit = item.unit
  const range =
    item.minimumQuantity != null && item.maximumQuantity != null
      ? `Ajustable entre ${formatNutritionAmount(item.minimumQuantity, unit)} y ${formatNutritionAmount(item.maximumQuantity, unit)}`
      : item.maximumQuantity != null
        ? `Hasta ${formatNutritionAmount(item.maximumQuantity, unit)}`
        : item.minimumQuantity != null
          ? `Desde ${formatNutritionAmount(item.minimumQuantity, unit)}`
          : null
  const note = resolveItemDisplayNote(item.notes, hasStructuredSubstitutions)
  return [range, note].filter(Boolean).join(' · ') || null
}
