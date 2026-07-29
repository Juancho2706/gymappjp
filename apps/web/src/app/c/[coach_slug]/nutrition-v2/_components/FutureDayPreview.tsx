import { NutritionStatePanel } from '@/components/nutrition-v2'
import { PlanVariantCard } from './PlanVariantCard'
import { SelectedDayBanner } from './SelectedDayBanner'
import { formatFutureDayHeadline, type StudentNutritionWeekCell } from './week-nav.logic'

/**
 * Un día FUTURO de la semana: qué le toca comer, en modo lectura.
 *
 * La variante sale de la proyección client-side (`resolveNutritionDayVariantForDow`, que replica
 * exactamente el `order by` con el que el backend congela el snapshot), NO de una lectura del día:
 * `get_nutrition_today_v2` es `volatile` y con fecha > hoy+1 lanza
 * `nutrition_v2_snapshot_date_out_of_window`. Mirar el sábado jamás debe escribir un snapshot del
 * sábado.
 *
 * CERO controles de registro (SPEC: hoy es la única superficie con registro). Por eso reusa
 * `PlanVariantCard` — el mismo markup del tab "Plan", que es solo lectura por construcción — y no
 * la experiencia de "Hoy".
 */
export function FutureDayPreview({
  cell,
  backHref,
}: {
  cell: StudentNutritionWeekCell
  /** URL canónica de hoy (sin `?date=`). */
  backHref: string
}) {
  return (
    <>
      <SelectedDayBanner
        backHref={backHref}
        headline={formatFutureDayHeadline(cell)}
        note="Vista previa de tu plan: el registro se habilita ese mismo día."
        tone="future"
      />
      {cell.variant != null ? (
        <PlanVariantCard showTargets variant={cell.variant} />
      ) : (
        <NutritionStatePanel
          illustration="sin-plan"
          title="Ese día no tiene comidas prescritas"
          description="Tu plan no define una estructura para ese día ni un día base al que seguir. Si crees que falta algo, coméntalo con tu coach."
        />
      )}
    </>
  )
}
