'use client'

/**
 * Rail de DÍAS del editor único (T3.v Cabina, V2.3 — mockup «Cabina v2» §A·1).
 *
 * Columna izquierda del layout de 3 zonas (rail · lienzo · paleta), SOLO en desktop (≥1024) y
 * SOLO en modo editor. Es la misma afordancia de la cápsula horizontal (`EditorDayCapsule`, que
 * queda para <1024): tocar una fila CAMBIA el día en edición — mismo `onSelect`, misma cadena de
 * fallback del día activo. Lo que agrega es DIAGNÓSTICO, que en la cápsula no cabía:
 *
 *  - punto de estado por día: verde = el día tiene comidas y el defecto B4 no lo nombra;
 *    ámbar = `qeDaysMissingBasePortions` lo nombra (sus porciones quedaron en el base) o el día
 *    está vacío (el servidor lo rechaza al publicar y el alumno lo vería sin nada);
 *  - kcal actuales del día (`qeVariantTotalWithPortions`, el MISMO total que la cinta y la barra);
 *  - bajo el día ámbar copiable, el arreglo como línea-enlace en vez de la caja del aviso:
 *    dispara el MISMO `APPLY_BASE_PORTIONS` (y el mismo toast) que `PortionsDayGapNotice`, que en
 *    ≥1024 deja de pintarse en el lienzo justamente porque su acción vive acá.
 *
 * Cero lógica nueva: los estados salen de los helpers puros del paquete y todos los despachos son
 * los que ya existían. El menú ⋮ del día NO se muda: sigue en el encabezado del lienzo
 * (`DayVariantHeader`), que es donde el coach lo tiene desde FD5.
 */

import { useMemo } from 'react'
import { toast } from 'sonner'
import {
  defaultQeVariant,
  formatNutritionDayOfWeek,
  qeDaysMissingBasePortions,
  qeVariantTotalWithPortions,
  takenDayVariantDows,
  type QeVariant,
} from '@eva/nutrition-v2'
import { AddDayPopover } from '@/app/coach/nutrition-v2/_components/AddDayPopover'
import { useQuickEdit } from './QuickEditProvider'
import { QE_COPY } from './microcopy'

/** Id del rótulo del rail: es el nombre accesible de la navegación (ver `aria-labelledby`). */
const RAIL_TITLE_ID = 'qe-day-rail-title'

export function EditorDayRail({
  variants,
  activeKey,
  todayVariantKey,
  onSelect,
}: {
  /** Días en orden de lectura (base primero, luego Lu→Do) — el mismo arreglo que pinta el lienzo. */
  variants: readonly QeVariant[]
  activeKey: string
  todayVariantKey: string | null
  onSelect: (key: string) => void
}) {
  const { state, dispatch, isPending, exchangeGroups, strategy, hasNutritionPro } = useQuickEdit()
  // `flexible` no tiene franjas por definición: ahí un día sin ellas es su estado correcto, no un
  // hueco (misma excepción que `qeEmptyDayVariants`, que es quien corta el publish).
  const usesSlots = strategy === 'structured' || strategy === 'hybrid'

  const gapByVariant = useMemo(
    () => new Map(qeDaysMissingBasePortions(state.variants).map((gap) => [gap.variantKey, gap])),
    [state.variants],
  )
  // Un total por día (el rail los muestra todos a la vez). Memo por identidad del arreglo: sin él,
  // cada tecleo del lienzo recalcularía el árbol completo de todas las variantes.
  const kcalByVariant = useMemo(
    () =>
      new Map(
        variants.map((variant) => [
          variant.key,
          Math.round(qeVariantTotalWithPortions(variant, exchangeGroups).calories),
        ]),
      ),
    [variants, exchangeGroups],
  )

  // Mismas props que el "+ Agregar día" del lienzo (que en ≥1024 se oculta: una sola afordancia).
  const takenDays = useMemo(() => [...takenDayVariantDows(state)], [state])
  const base = useMemo(() => defaultQeVariant(state), [state])

  function applyBasePortions() {
    dispatch({ type: 'APPLY_BASE_PORTIONS' })
    toast(QE_COPY.portionsGapApplied, { duration: 4000 })
  }

  return (
    <nav
      /* El rótulo visible ES el nombre accesible (`aria-labelledby`, no un `aria-label` que lo
         repita): así el rail y la cápsula de <1024 —montada a la vez, oculta acá— no quedan como
         dos navegaciones con el MISMO nombre. */
      aria-labelledby={RAIL_TITLE_ID}
      /* Mismo patrón sticky que la paleta del otro costado (`EditorPalette`): la columna acompaña
         el scroll del lienzo sin salirse del viewport.
         `2xl:w-[11.875rem]`: desde 1536 el track lateral izquierdo mide lo mismo que el de la paleta
         (18rem) para que el lienzo quede centrado en la pantalla (ver `QuickEditPlanView`); el rail
         conserva ahí sus 190 px del contrato de la SPEC («≥1536 | rail 190 / paleta 288 fijos») y el
         sobrante del track queda como aire. Sin esto el rail se estiraría a 288. */
      className="sticky top-20 hidden max-h-[calc(100vh-7rem)] flex-col overflow-y-auto lg:flex 2xl:w-[11.875rem]"
    >
      <p
        id={RAIL_TITLE_ID}
        className="px-2 pb-2 font-mono text-[9px] font-semibold uppercase leading-4 tracking-[0.16em] text-muted"
      >
        {QE_COPY.railTitle}
      </p>
      <ul className="space-y-0.5">
        {variants.map((variant) => {
          const isActive = variant.key === activeKey
          const isToday = todayVariantKey != null && variant.key === todayVariantKey
          const short = variant.isDefault
            ? QE_COPY.baseDayShort
            : formatNutritionDayOfWeek(variant.dayOfWeek, { short: true })
          const gap = gapByVariant.get(variant.key)
          const isEmptyDay = usesSlots && variant.slots.length === 0
          const needsAttention = gap !== undefined || isEmptyDay
          return (
            <li key={variant.key}>
              <button
                type="button"
                aria-pressed={isActive}
                aria-label={variant.label + (isToday ? ` — ${QE_COPY.dayAppliesToday}` : '')}
                title={variant.label}
                onClick={() => onSelect(variant.key)}
                className={
                  'flex min-h-11 w-full items-center gap-2 rounded-control border-l-2 px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                  (isActive
                    ? 'border-l-primary bg-primary/10'
                    : 'border-l-transparent hover:bg-surface-sunken') +
                  (isToday && !isActive ? ' ring-1 ring-primary/50' : '')
                }
              >
                {/* Punto de estado: decorativo. Cuando el hueco se arregla copiando, el enlace de
                    abajo dice con palabras lo mismo que el color; el día sin comidas lo vuelve a
                    decir el lienzo (aviso `emptyDayVariant`) y lo corta la validación al publicar. */}
                <span
                  aria-hidden="true"
                  className={
                    'h-[7px] w-[7px] shrink-0 rounded-full ' +
                    (needsAttention ? 'bg-warning-500' : 'bg-macro-goal')
                  }
                />
                {short ? (
                  <span className="w-[26px] shrink-0 font-mono text-[9px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">
                    {short}
                  </span>
                ) : null}
                <span
                  className={
                    'min-w-0 flex-1 truncate text-[12.5px] font-semibold ' +
                    (isActive ? 'text-strong' : 'text-body')
                  }
                >
                  {variant.label}
                </span>
                <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-muted">
                  {kcalByVariant.get(variant.key) ?? 0}
                </span>
              </button>
              {/* B4 como ENLACE (no como caja): solo cuando copiar arregla el día — un día sin
                  franjas homónimas no se arregla copiando, y eso lo explica el aviso del lienzo. */}
              {gap && gap.slotKeyPairs.length > 0 ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={applyBasePortions}
                  className="ml-[2.875rem] mr-1 block text-left text-[10px] font-semibold leading-4 text-primary underline decoration-dotted underline-offset-2 transition-colors hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
                >
                  {QE_COPY.railApplyBase}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {/* `AddDayPopover` es COMPARTIDO con el builder (docstring del componente): su trigger no se
          toca (min-h-9 en todos sus usos, builder incluido) — acá se agranda SOLO el hit-area con
          un selector de descendiente, sin cambiar una línea del componente ni su comportamiento en
          otras superficies. SPEC «touch targets ≥44 px en TODOS los controles nuevos» del rail. */}
      <div className="mt-2.5 px-1.5 [@media(pointer:coarse)]:[&_button]:min-h-11">
        <AddDayPopover
          takenDays={takenDays}
          canCopyBase={(base?.slots.length ?? 0) > 0}
          locked={!hasNutritionPro}
          onCreate={(days, origin) =>
            dispatch({ type: 'ADD_VARIANT', days, source: origin === 'copy-base' ? 'clone' : 'empty' })
          }
        />
      </div>
    </nav>
  )
}
