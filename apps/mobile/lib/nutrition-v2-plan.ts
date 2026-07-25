/**
 * nutrition-v2-plan — helpers PUROS (sin react-native / supabase) de la Vista Plan del alumno.
 *
 * `describeItemGuidance` es un port 1:1 del helper web
 * (`apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:483-495`): arma la nota de guía
 * de un ítem prescrito combinando el rango de cantidad ajustable ("Ajustable entre X y Y" /
 * "Hasta X" / "Desde X") con las indicaciones del coach, unidas por " · ". Devuelve null si
 * no hay ni rango ni notas.
 */
import { formatNutritionAmount } from '@eva/nutrition-v2'

/** Forma estructural mínima del ítem prescrito que consume la guía (espejo del read-model). */
export type PlanItemGuidance = {
  unit: string
  minimumQuantity: number | null
  maximumQuantity: number | null
  notes: string | null
}

/** Nota de guía de un item prescrito: rango de cantidad ajustable + indicaciones del coach. */
export function describeItemGuidance(item: PlanItemGuidance): string | null {
  const unit = item.unit
  const range =
    item.minimumQuantity != null && item.maximumQuantity != null
      ? `Ajustable entre ${formatNutritionAmount(item.minimumQuantity, unit)} y ${formatNutritionAmount(item.maximumQuantity, unit)}`
      : item.maximumQuantity != null
        ? `Hasta ${formatNutritionAmount(item.maximumQuantity, unit)}`
        : item.minimumQuantity != null
          ? `Desde ${formatNutritionAmount(item.minimumQuantity, unit)}`
          : null
  return [range, item.notes].filter(Boolean).join(' · ') || null
}
