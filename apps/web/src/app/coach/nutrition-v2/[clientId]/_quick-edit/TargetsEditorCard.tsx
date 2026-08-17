'use client'

/**
 * Card de metas (targets) de la variante en modo edicion (§1.2.B.3): kcal/P/C/G
 * tap-to-edit con steppers (50 kcal / 5 g). En planes flexibles sin franjas esta card
 * ES el quick-edit completo. Muestra ademas el total prescrito en vivo cuando hay franjas,
 * para comparar meta vs prescripcion sin salir de la card.
 *
 * T3.v Cabina (V2.2; umbral bajado a ≥768 en V2.5): en el editor unico ≥768 (cinta compacta
 * 768–1023, completa desde 1024) esta MISMA card se muda al popover «Metas del día» de la cinta
 * (`EditorRibbon`) — cambia el HOST, no la logica: mismos steppers, mismos dispatches y mismos
 * errores. `chrome='bare'` es esa variante: sin caja ni titulo propios (los pone el popover).
 * En <768 y en el quick-edit clasico sigue pintandose tal cual.
 */

import { NutritionCard } from '@/components/nutrition-v2'
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import {
  qeVariantPortionTotals,
  qeVariantTotalWithPortions,
  type QeTargetsText,
  type QeVariant,
} from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { useQuickEdit } from './QuickEditProvider'
import { StepperField } from './StepperField'

const TARGET_FIELDS: Array<{ field: keyof QeTargetsText; label: string; suffix: string }> = [
  { field: 'calories', label: 'Calorías objetivo', suffix: 'kcal' },
  { field: 'proteinG', label: 'Proteína objetivo', suffix: 'g P' },
  { field: 'carbsG', label: 'Carbohidratos objetivo', suffix: 'g C' },
  { field: 'fatsG', label: 'Grasas objetivo', suffix: 'g G' },
]

export function TargetsEditorCard({
  variant,
  chrome = 'card',
}: {
  variant: QeVariant
  /** 'card' = card del lienzo (por defecto) · 'bare' = contenido pelado para el popover «Metas ▾». */
  chrome?: 'card' | 'bare'
}) {
  const { dispatch, errors, showErrors, isPending, exchangeGroups } = useQuickEdit()
  const hasSlots = variant.slots.length > 0
  // "Total prescrito" = items fijos + porciones a eleccion (antes ignoraba los grupos y
  // no cuadraba con los subtotales de franja ni con lo que el coach prescribio).
  const portionTotals = qeVariantPortionTotals(variant, exchangeGroups)
  const total = qeVariantTotalWithPortions(variant, exchangeGroups)

  const fields = (
    <>
      <div className={'grid grid-cols-1 gap-2.5 sm:grid-cols-2 ' + (chrome === 'card' ? 'mt-3' : '')}>
        {TARGET_FIELDS.map(({ field, label, suffix }) => {
          const error = showErrors ? errors[`target.${variant.key}.${field}`] : undefined
          return (
            <div key={field}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
              <StepperField
                label={label}
                value={variant.targets[field]}
                suffix={suffix}
                invalid={Boolean(error)}
                disabled={isPending}
                onChange={(value) => dispatch({ type: 'SET_TARGET', variantKey: variant.key, field, value })}
                onStep={(direction) => dispatch({ type: 'STEP_TARGET', variantKey: variant.key, field, direction })}
              />
              {error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
            </div>
          )
        })}
      </div>
      {hasSlots ? (
        <div
          className={
            'flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2 ' +
            (chrome === 'card' ? 'mt-3' : '')
          }
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Total prescrito</span>
          <MacroChipRow
            size="sm"
            calories={total.calories}
            proteinG={total.proteinG}
            carbsG={total.carbsG}
            fatsG={total.fatsG}
          />
          {portionTotals ? (
            <p className="w-full text-xs text-muted">
              {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionTotals.calories)))}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )

  // Host popover (cinta ≥768): sin caja ni título propios — los pone el popover «Metas del día».
  if (chrome === 'bare') return fields

  return (
    <NutritionCard>
      <h3 className="font-display text-base font-semibold text-strong">Metas diarias</h3>
      {fields}
    </NutritionCard>
  )
}
