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
 *
 * W4.3 (tren «Porciones a la chilena», caso Pame Cid) — fila de switch «Solo el {dia}» al pie.
 * Escribir metas parado en Martes dejaba al resto de la semana SIN objetivo, porque el snapshot
 * copia la variante entera y un dia con `target_calories NULL` no hereda del base. Con el switch
 * APAGADO los steppers despachan `scope: 'all'` y la meta se guarda en el base y en los dias que
 * heredaban; ENCENDIDO, solo en el dia. Como los DOS hosts web (la card `md:hidden` del lienzo y
 * el popover «Metas del día» de la cinta) montan ESTE componente, el switch aparece en los dos
 * por construccion — verificado en `QuickEditPlanView.tsx:525` y `EditorRibbon.tsx:362`.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { NutritionCard } from '@/components/nutrition-v2'
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import {
  defaultQeVariant,
  formatMacroEsCl,
  formatNutritionDayOfWeek,
  qeTargetsEqual,
  qeVariantPortionTotals,
  qeVariantTotalWithPortions,
  type QeTargetsScope,
  type QeTargetsText,
  type QeVariant,
} from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { useCaptureNutritionTargetsScope } from '@/lib/posthog/events'
import { useQuickEdit } from './QuickEditProvider'
import { EDITOR_COPY } from './microcopy'
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
  const { state, dispatch, errors, showErrors, isPending, exchangeGroups } = useQuickEdit()
  const captureTargetsScope = useCaptureNutritionTargetsScope()
  const hasSlots = variant.slots.length > 0

  // ── Switch «Solo el {dia}» (W4.3).
  const base = defaultQeVariant(state)
  // Oculto en el dia BASE (escribir la base ya es escribir todos), en planes de un solo dia y sin
  // base (no hay "todos los dias" posible): en esos tres casos los steppers despachan SIN `scope`
  // y el reducer se comporta EXACTAMENTE como antes de esta wave.
  const showScopeSwitch = base != null && !variant.isDefault && state.variants.length > 1
  // Default por ESTADO, no por preferencia (SPEC §7.5): OFF si el dia tiene las mismas metas que
  // el base (los dos vacios incluidos) ⇒ la proxima meta se guarda para toda la semana; ON si el
  // dia ya tenia metas propias distintas ⇒ el coach ya eligio separarlo y no se lo pisamos.
  const defaultOnlyThisDay = base != null && !qeTargetsEqual(variant, base)
  // El toggle manual se guarda POR DIA: al cambiar de dia manda de nuevo el default de ESE dia,
  // sin un efecto que sincronice (el estado derivado es la fuente, no una copia que puede driftar).
  const [manualScope, setManualScope] = useState<{ key: string; onlyThisDay: boolean } | null>(null)
  const onlyThisDay = manualScope?.key === variant.key ? manualScope.onlyThisDay : defaultOnlyThisDay
  const scope: QeTargetsScope | undefined = showScopeSwitch ? (onlyThisDay ? 'day' : 'all') : undefined

  // Nombre del dia DENTRO de la frase («Solo el martes»): en minuscula, con su etiqueta como
  // respaldo para las variantes con nombre propio y sin dia de semana («Día de entrenamiento»).
  const dayLabel = (formatNutritionDayOfWeek(variant.dayOfWeek) ?? variant.label).toLocaleLowerCase('es')
  const baseCaloriesText = base?.targets.calories.trim() ?? ''
  const baseCaloriesLabel =
    baseCaloriesText !== '' && Number.isFinite(Number(baseCaloriesText))
      ? formatMacroEsCl(Number(baseCaloriesText))
      : null
  // Ayuda del switch. ENCENDIDO y con el base SIN meta, la frase quedaria «los demás días siguen
  // con  kcal» (el hueco es justo el caso Pame a medio arreglar): ahi se calla, que es lo unico
  // honesto que se puede decir sin inventar una cifra.
  const scopeHelp = onlyThisDay
    ? baseCaloriesLabel != null
      ? EDITOR_COPY.targets.onlyThisDayOn(dayLabel, baseCaloriesLabel)
      : null
    : EDITOR_COPY.targets.onlyThisDayOff

  /** Escribe las cuatro metas en el dia activo y en NINGUN otro (sin `scope`, como siempre). */
  function writeDayTargets(values: QeTargetsText) {
    for (const { field } of TARGET_FIELDS) {
      dispatch({ type: 'SET_TARGET', variantKey: variant.key, field, value: values[field] })
    }
  }

  function toggleScope() {
    const next = !onlyThisDay
    setManualScope({ key: variant.key, onlyThisDay: next })
    captureTargetsScope(next ? 'day' : 'all', 'switch')
    // Apagarlo estando ENCENDIDO es «vuelve a las metas de todos los días»: las del base se copian
    // sobre el dia AHORA (si no, el dia se quedaria con su meta vieja hasta el proximo tecleo y el
    // switch estaria mintiendo). Reversible: «Deshacer» devuelve las cuatro cifras anteriores.
    if (!next && base && !qeTargetsEqual(variant, base)) {
      const previous: QeTargetsText = { ...variant.targets }
      writeDayTargets(base.targets)
      toast(EDITOR_COPY.targets.onlyThisDayOff, {
        duration: 6000,
        action: {
          label: PORTIONS_COPY.builder.groupBumpedUndo,
          onClick: () => {
            writeDayTargets(previous)
            setManualScope({ key: variant.key, onlyThisDay: true })
          },
        },
      })
    }
  }
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
                onChange={(value) =>
                  dispatch({ type: 'SET_TARGET', variantKey: variant.key, field, value, scope })
                }
                onStep={(direction) =>
                  dispatch({ type: 'STEP_TARGET', variantKey: variant.key, field, direction, scope })
                }
              />
              {error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
            </div>
          )
        })}
      </div>
      {/* Fila del switch: va DEBAJO de los cuatro steppers (mockup M4) porque lo que decide es
          dónde se guarda lo que el coach acaba de escribir arriba. */}
      {showScopeSwitch ? (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <button
            type="button"
            role="switch"
            aria-checked={onlyThisDay}
            disabled={isPending}
            onClick={toggleScope}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-1 text-left text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span className="min-w-0">{EDITOR_COPY.targets.onlyThisDay(dayLabel)}</span>
            {/* El riel es decorativo: el estado lo lleva el `aria-checked` del botón. */}
            <span
              aria-hidden="true"
              className={
                'flex h-6 w-10 shrink-0 items-center rounded-pill p-0.5 transition-colors ' +
                (onlyThisDay ? 'bg-primary' : 'bg-border-default')
              }
            >
              <span
                className={
                  'h-5 w-5 rounded-full bg-white shadow transition-transform ' +
                  (onlyThisDay ? 'translate-x-4' : '')
                }
              />
            </span>
          </button>
          {scopeHelp ? <p className="mt-1 px-1 text-xs leading-5 text-muted">{scopeHelp}</p> : null}
        </div>
      ) : null}
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
