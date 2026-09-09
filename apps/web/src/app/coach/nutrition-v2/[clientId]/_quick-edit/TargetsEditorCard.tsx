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
 *
 * El titulo de la hoja de metas es FIJO (decision del jefe D1): «Metas del día» lo pone el
 * popover, y esta card no tiene titulo dinamico ni un copy alterno para el alcance — quien dice
 * a donde va la meta es la AYUDA del switch (`onlyThisDayOff` / `onlyThisDayOn`), no un rotulo.
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

/** Las cuatro llaves que edita la card, en el orden en que se pintan. */
const TARGET_KEYS: ReadonlyArray<keyof QeTargetsText> = TARGET_FIELDS.map(({ field }) => field)

/**
 * Una escritura de meta: el campo y el texto que le va. SIN alcance a propósito —a QUÉ días se
 * escribe lo resuelve `toggleScope` UNA sola vez para los cuatro campos, igual que el host RN
 * (`QuickEditMode.handleTargetsSwitchOff`)—. Ver el porqué en `planSwitchOff`.
 */
type QeTargetWrite = { field: keyof QeTargetsText; value: string }

/** Foto de las metas de un día, para poder devolverlas EXACTAS con «Deshacer». */
type QeTargetsSnapshot = { key: string; targets: QeTargetsText }

/**
 * Qué pasa al APAGAR el switch «Solo el {día}» — decisión del jefe D2, y la MISMA en RN.
 * Apagar el switch **nunca borra una meta**: eso era el bug del checkpoint (copiaba encima del
 * día los strings vacíos del base y el plan de Pame perdía sus 2.040 kcal de un toque).
 *
 *  - `backToBase` — el base SÍ tiene meta (SPEC §7.5): el día vuelve a la meta de todos los días,
 *    o sea se le copian las cuatro cifras del base con `scope: 'day'` (solo ese día).
 *  - `appliedToAll` — el base está VACÍO (el plan de Pame): en vez de vaciar el día, se PROPAGA
 *    lo que el día tiene con `scope: 'all'`, que el reducer escribe en el base y en los días que
 *    heredaban, sin tocar a los que tienen meta propia distinta.
 *  - `noop` — no hay nada que mover (el día ya muestra la meta del base, o el plan entero está
 *    sin metas): el switch se apaga y ya, sin toast que anuncie un cambio que no ocurrió.
 *
 * Pura a propósito: es el criterio, y un test lo puede fijar sin montar React. Devuelve solo QUÉ
 * se escribe; el conjunto de días es cosa del host, EXACTAMENTE como en RN.
 *
 * Por qué el plan ya no lleva `scope: 'all'`, que es como lo hacía el checkpoint: el reducer
 * recalcula «quiénes heredaban» en CADA dispatch, contra el base de ESE momento. Con los cuatro
 * campos por separado, la 2.ª escritura alcanza al día que la 1.ª acaba de dejar igual al base y
 * le pisa su meta propia (base vacío · martes 2040/144/247/52 · miércoles con 2040 kcal propias:
 * tras el write de `calories` el base queda idéntico a miércoles y P/C/G le caen encima) — justo
 * lo que SPEC §7.5 manda no tocar.
 */
export function planSwitchOff(
  base: QeVariant | null,
  day: QeVariant,
): { mode: 'backToBase' | 'appliedToAll' | 'noop'; writes: readonly QeTargetWrite[] } {
  if (base == null) return { mode: 'noop', writes: [] }
  // La llave es SIEMPRE kcal, igual que `hasTargetCalories` del reducer: sin energía no hay
  // objetivo que mostrarle a nadie, por más proteína que tenga cargada el día.
  if (base.targets.calories.trim() !== '') {
    if (qeTargetsEqual(day, base)) return { mode: 'noop', writes: [] }
    return {
      mode: 'backToBase',
      writes: TARGET_KEYS.map((field) => ({ field, value: base.targets[field] })),
    }
  }
  if (day.targets.calories.trim() === '') return { mode: 'noop', writes: [] }
  // Los campos VACIOS del dia quedan fuera, igual que en RN: un '' viaja al base y a los dias que
  // heredaban, y un base que tenia la proteina cargada la perderia. Ese caso existe de verdad
  // —`applyBaseTargets` (D4) contempla el dia sin kcal pero con proteina— y borrar ahi seria justo
  // lo que D2 prohibe. Como arriba ya cortamos con kcal vacia, siempre queda al menos una escritura.
  return {
    mode: 'appliedToAll',
    writes: TARGET_KEYS.filter((field) => day.targets[field].trim() !== '').map((field) => ({
      field,
      value: day.targets[field],
    })),
  }
}

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

  /**
   * Escribe el plan de `planSwitchOff` sobre un conjunto de dias YA resuelto, siempre con
   * `scope: 'day'`. El conjunto se calcula una sola vez contra el estado PREVIO (ver
   * `toggleScope`): despachar `scope: 'all'` campo por campo dejaba que la 2.ª escritura pisara
   * al dia con meta propia que la 1.ª acababa de dejar igual al base.
   */
  function applyWrites(keys: readonly string[], writes: readonly QeTargetWrite[]) {
    for (const variantKey of keys) {
      for (const { field, value } of writes) {
        dispatch({ type: 'SET_TARGET', variantKey, field, value, scope: 'day' })
      }
    }
  }

  /**
   * «Deshacer»: devuelve a la foto previa los dias que el gesto TOCO, uno por uno y con
   * `scope: 'day'`.
   *
   * No se deshace con un `scope: 'all'` invertido a proposito: el reducer recalcula «quienes
   * heredaban» contra el base de ESE momento, que despues de propagar ya no es el de antes, y
   * un dia que casualmente quedo igual al base se llevaria un borrado que nadie pidio. Restaurar
   * dia por dia es exacto y, como el contador de cambios es un diff contra el borrador publicado
   * (no un contador de acciones), tambien deja el «N cambios sin publicar» donde estaba.
   *
   * Solo los dias TOCADOS: la foto es de todos (es lo unico que devuelve el estado exacto sin
   * volver a razonar quien heredaba de quien), pero un dia que nadie escribio ya esta en su valor
   * y reescribirlo son 4 dispatches de mas — `mapVariant` devuelve estado nuevo SIEMPRE, asi que
   * cada uno es un render del editor y un disparo del autosave.
   */
  function restoreSnapshot(snapshot: readonly QeTargetsSnapshot[], touched: readonly string[]) {
    const keys = new Set(touched)
    for (const day of snapshot) {
      if (!keys.has(day.key)) continue
      for (const field of TARGET_KEYS) {
        dispatch({ type: 'SET_TARGET', variantKey: day.key, field, value: day.targets[field], scope: 'day' })
      }
    }
  }

  function toggleScope() {
    const next = !onlyThisDay
    setManualScope({ key: variant.key, onlyThisDay: next })
    captureTargetsScope(next ? 'day' : 'all', 'switch')
    if (next) return
    // Sin base no hay «todos los dias» (el switch ni se pinta): el guard es para que `base.key`
    // de abajo no dependa de esa invariante de render.
    if (base == null) return
    // Apagarlo estando ENCENDIDO mueve metas AHORA (si no, el dia se quedaria con su meta vieja
    // hasta el proximo tecleo y el switch estaria mintiendo). El QUE se mueve lo decide la funcion
    // pura de arriba —nunca un vacio encima del dia, decision D2— y el toast dice lo que paso, que
    // no es lo mismo que la ayuda del switch (ese era el otro bug: el aviso mentia).
    const plan = planSwitchOff(base, variant)
    if (plan.mode === 'noop') return
    const snapshot: QeTargetsSnapshot[] = state.variants.map((day) => ({
      key: day.key,
      targets: { ...day.targets },
    }))
    // A QUE dias se escribe se resuelve ACA, UNA vez y contra el estado previo (mismo patron que
    // `handleTargetsSwitchOff` en RN): `backToBase` toca solo el dia activo; `appliedToAll` toca
    // el dia, el base y los que HOY heredan de el (mismo criterio `qeTargetsEqual` que el
    // `scope: 'all'` del reducer), y nunca al dia con meta propia distinta.
    const touched =
      plan.mode === 'backToBase'
        ? [variant.key]
        : [
            ...new Set<string>([
              variant.key,
              base.key,
              ...state.variants.filter((day) => qeTargetsEqual(day, base)).map((day) => day.key),
            ]),
          ]
    applyWrites(touched, plan.writes)
    toast(
      plan.mode === 'backToBase'
        ? EDITOR_COPY.targets.backToBase(dayLabel)
        : EDITOR_COPY.targets.appliedToAll,
      {
        duration: 6000,
        action: {
          label: EDITOR_COPY.targets.undo,
          onClick: () => {
            restoreSnapshot(snapshot, touched)
            setManualScope({ key: variant.key, onlyThisDay: true })
            // El evento sigue la POSICION del switch (D5), igual que RN: sin esto el embudo
            // mostraria un 'all' que el coach cancelo y ningun 'day' de vuelta, y solo en web.
            captureTargetsScope('day', 'switch')
          },
        },
      },
    )
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
