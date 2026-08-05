'use client'

import { MacroBudget, NutritionCard } from '@/components/nutrition-v2'
import {
  slotSubtotal,
  variantEffectiveTargets,
  type BuilderState,
  type BuilderVariant,
  type ItemMacros,
} from '../_lib/draft-builder'
import { numOr0 } from '../_lib/builder-view-model'
import { combineSubtotals, portionsKey, slotPortionTotals } from './portions-state'
import type { PortionsController } from './PortionsSection'

export function DaySummary({
  state,
  variant,
  totals,
  portions,
}: {
  state: BuilderState
  /** Dia en edicion: el resumen es SIEMPRE del dia que el coach tiene en pantalla. */
  variant: BuilderVariant
  totals: ItemMacros
  portions: PortionsController
}) {
  // Metas contra las que se compara: las propias del dia si las personalizo, si no las del base.
  const targets = variantEffectiveTargets(state, variant)
  return (
    <div className="space-y-3">
      <h3 className="font-display text-base font-semibold text-strong">
        {variant.isDefault ? 'Resumen del día base' : 'Resumen de ' + variant.label}
      </h3>
      <MacroBudget
        calories={{ consumed: totals.calories, target: numOr0(targets.calories) }}
        macros={[
          { macro: 'protein', consumed: totals.proteinG, target: numOr0(targets.proteinG) },
          { macro: 'carbs', consumed: totals.carbsG, target: numOr0(targets.carbsG) },
          { macro: 'fats', consumed: totals.fatsG, target: numOr0(targets.fatsG) },
        ]}
      />
      <NutritionCard>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Por franja</p>
        {variant.slots.length === 0 ? (
          <p className="text-sm text-muted">Agrega una franja para ver el desglose del dia.</p>
        ) : (
          <ul className="space-y-2">
            {variant.slots.map((slot) => {
              // El desglose "Por franja" combina items + porciones a eleccion, igual que el
              // subtotal de la card de la franja (antes mostraba solo los items).
              const s = combineSubtotals(
                slotSubtotal(slot),
                slotPortionTotals(portions.bySlot, portionsKey(variant.key, slot.key), portions.groups),
              )
              return (
                <li key={slot.key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-body">
                    {slot.name.trim() || 'Sin nombre'}
                    <span className="text-subtle"> · {slot.items.length} item{slot.items.length === 1 ? '' : 's'}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-strong">{Math.round(s.calories)} kcal</span>
                </li>
              )
            })}
          </ul>
        )}
      </NutritionCard>
    </div>
  )
}
