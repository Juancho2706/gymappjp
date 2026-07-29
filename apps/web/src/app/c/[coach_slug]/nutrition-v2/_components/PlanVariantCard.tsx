import {
  formatNutritionAmount,
  formatNutritionCalories,
  type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import { MacroChipRow, NutritionCard, PrescribedPortionChips } from '@/components/nutrition-v2'
import { NutritionFoodRow } from './NutritionFoodRow'
import { resolveFoodImageUrl } from './food-result-image'

/**
 * Estructura prescrita de UNA variante de día (franjas, alimentos, porciones), en modo lectura.
 *
 * Vive en `_components` (y ya no dentro de `page.tsx`) porque la comparten el tab "Plan" — que
 * ahora muestra una sola card, la del día elegido en el selector semanal — y la vista previa de
 * un día FUTURO del tab "Hoy". Una sola pieza: el alumno ve exactamente la misma prescripción
 * mire donde mire, sin dos markups que se desincronizan.
 *
 * Ya NO pinta la tira Lu-Do por card (auditoría P1-10 / Q9): con 7 variantes eran 49 pastillas
 * diciendo fracciones de lo mismo. Esa información ahora la da UN solo selector arriba, que
 * además navega. Componente de servidor: cero estado, cero controles de registro.
 */

export type PlanVariant = NutritionPlanReadModel['dayVariants'][number]
export type PlanSlot = PlanVariant['mealSlots'][number]
export type PlanItem = PlanSlot['prescriptionItems'][number]

/** Base pública de Storage para resolver la ilustración del producto (server-side, NEXT_PUBLIC). */
const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

export function PlanVariantCard({
  variant,
  showTargets = false,
}: {
  variant: PlanVariant
  /**
   * Metas de la variante como chips bajo el título. El tab "Plan" las pinta arriba en su propia
   * card ("Metas del día"), así que ahí va en `false` para no repetir la misma cifra dos veces.
   */
  showTargets?: boolean
}) {
  return (
    <NutritionCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-strong">{variant.label}</h3>
        {variant.isDefault ? (
          <span className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary">
            Por defecto
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm tabular-nums text-muted">
        {variant.mealSlots.length} franja{variant.mealSlots.length === 1 ? '' : 's'}
        {variant.targets.calories != null ? ` · ${formatNutritionCalories(variant.targets.calories)}` : ''}
      </p>
      {showTargets ? (
        <span className="mt-2 block">
          <MacroChipRow
            calories={variant.targets.calories}
            proteinG={variant.targets.proteinG}
            carbsG={variant.targets.carbsG}
            fatsG={variant.targets.fatsG}
            size="sm"
          />
        </span>
      ) : null}
      <div className="mt-2 space-y-4">
        {variant.mealSlots.length === 0 ? (
          <p className="text-sm text-muted">
            Plan sin franjas fijas: sigue tus metas diarias y registra lo que comas.
          </p>
        ) : (
          variant.mealSlots.map((slot) => <PlanSlotBlock key={slot.id} slot={slot} />)
        )}
      </div>
    </NutritionCard>
  )
}

/** Una franja del plan: encabezado (hora), indicaciones, alimentos prescritos y subtotal. */
export function PlanSlotBlock({ slot }: { slot: PlanSlot }) {
  const timeLabel = slot.startTime
    ? slot.endTime
      ? `${slot.startTime}–${slot.endTime}`
      : slot.startTime
    : null
  const subtotal = slot.prescriptionItems.reduce((sum, item) => sum + (item.macros.calories ?? 0), 0)
  const hasItems = slot.prescriptionItems.length > 0
  // Capa de porciones (P0-3): una franja puede prescribir SOLO porciones a elección; sin
  // esto la vista Plan la mostraba como "franja flexible sin alimentos prescritos".
  const hasPortions = (slot.exchangeTargets?.length ?? 0) > 0
  const targetChips =
    slot.targets.calories != null ||
    slot.targets.proteinG != null ||
    slot.targets.carbsG != null ||
    slot.targets.fatsG != null

  return (
    <div className="rounded-control border border-border-subtle bg-surface-sunken/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-display text-base font-semibold text-strong">{slot.name}</h4>
          {timeLabel ? <span className="font-mono text-xs text-muted">{timeLabel}</span> : null}
        </div>
        {hasItems && subtotal > 0 ? (
          <span className="font-mono text-xs font-semibold text-strong">{formatNutritionCalories(subtotal)}</span>
        ) : null}
      </div>
      {slot.instructions ? (
        <p className="mt-1 text-xs leading-5 text-subtle">{slot.instructions}</p>
      ) : null}
      {hasItems ? (
        <div className="mt-2 divide-y divide-border-subtle">
          {slot.prescriptionItems.map((item) => (
            <NutritionFoodRow
              key={item.id}
              name={item.name ?? 'Alimento prescrito'}
              detail={item.brand}
              quantityLabel={`${item.quantity} ${item.unit}${item.optional ? ' · opcional' : ''}`}
              calories={item.macros.calories}
              proteinG={item.macros.proteinG}
              carbsG={item.macros.carbsG}
              fatsG={item.macros.fatsG}
              imageUrl={resolveFoodImageUrl(item.media ?? null, SUPABASE_BASE)}
              category={item.category ?? undefined}
              note={describeItemGuidance(item)}
            />
          ))}
        </div>
      ) : targetChips ? (
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Objetivo de la franja</p>
          <span className="mt-1 block">
            <MacroChipRow
              calories={slot.targets.calories}
              proteinG={slot.targets.proteinG}
              carbsG={slot.targets.carbsG}
              fatsG={slot.targets.fatsG}
              size="sm"
            />
          </span>
        </div>
      ) : null}
      {/* Porciones prescritas: se suman a los alimentos fijos o al objetivo de macros; el
          empty-state de abajo solo aparece cuando la franja no prescribe NADA. */}
      <PrescribedPortionChips className="mt-2" targets={slot.exchangeTargets} />
      {!hasItems && !targetChips && !hasPortions ? (
        <p className="mt-2 text-xs text-muted">Franja flexible sin alimentos prescritos.</p>
      ) : null}
    </div>
  )
}

/** Nota de guía de un item prescrito: rango de cantidad ajustable + indicaciones del coach. */
export function describeItemGuidance(item: PlanItem): string | null {
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
