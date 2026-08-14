'use client'

/**
 * Barra fija del total del día en MÓVIL (paso 2 del creador) — BD2.
 *
 * Antes solo decía "Total del día base: 1.850 kcal · P … · C … · G …". El coach que arma un plan
 * NO está sumando: está gastando un presupuesto, y la pregunta real ("¿cuánto me queda?") exigía
 * restar de cabeza contra las metas del paso anterior. En desktop eso ya lo resolvía el
 * `MacroBudget` del resumen lateral, que en <lg ni se monta.
 *
 * Toggle segmentado de dos estados, persistido mientras dure la pantalla:
 *  - ASIGNADO: lo de hoy, tal cual estaba (items fijos + porciones a elección);
 *  - RESTANTE: metas EFECTIVAS del día (propias o heredadas) menos lo asignado, macro por macro,
 *    con mini-barras de progreso. Pasarse no es un error (un día alto es legítimo), así que se
 *    dice en ámbar —"Te pasas por N"— y nunca en rojo ni bloqueando nada.
 *
 * Un macro sin meta cargada no inventa un restante: dice "Sin meta" y deja la barra vacía.
 */

import { useState } from 'react'
// Import por ruta directa (no via el barrel index.ts): mismo criterio que el resto del paso.
import { MacroChipRow } from '@/components/nutrition-v2/MacroChipRow'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import type { BuilderTargets, ItemMacros } from '../_lib/draft-builder'
import { numOr0 } from '../_lib/builder-view-model'

type TotalsView = 'assigned' | 'remaining'

const MACRO_ROWS: Array<{
  field: keyof BuilderTargets
  total: keyof Pick<ItemMacros, 'calories' | 'proteinG' | 'carbsG' | 'fatsG'>
  label: string
  unit: string
  /** Decimales del valor mostrado: las kcal son enteras, los gramos llevan uno. */
  decimals: number
  barClass: string
}> = [
  { field: 'calories', total: 'calories', label: 'kcal', unit: '', decimals: 0, barClass: 'bg-primary' },
  // T2.7 F1: barras de macros al trio fijo (tokens --color-macro-*).
  { field: 'proteinG', total: 'proteinG', label: 'P', unit: ' g', decimals: 1, barClass: 'bg-macro-protein' },
  { field: 'carbsG', total: 'carbsG', label: 'C', unit: ' g', decimals: 1, barClass: 'bg-macro-carbs' },
  { field: 'fatsG', total: 'fatsG', label: 'G', unit: ' g', decimals: 1, barClass: 'bg-macro-fats' },
]

/** Número es-CL sin ceros de relleno ("1850", "12,5"). */
function formatAmount(value: number, decimals: number): string {
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return String(rounded).replace('.', ',')
}

const segmentBase =
  'inline-flex min-h-9 flex-1 items-center justify-center rounded-control px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function DayTotalsBar({
  title,
  totals,
  targets,
  portionCalories,
  className,
}: {
  /** "Total del día base" / "Total de Sábado". */
  title: string
  /** Lo asignado hoy: items fijos + porciones a elección (mismo criterio que el strip). */
  totals: ItemMacros
  /** Metas EFECTIVAS del día en pantalla (propias o heredadas del día base). */
  targets: BuilderTargets
  /** kcal derivadas de las porciones a elección; `null` = el día no usa porciones. */
  portionCalories: number | null
  className?: string
}) {
  const [view, setView] = useState<TotalsView>('assigned')

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</span>
        <div
          role="group"
          aria-label="Qué mostrar del día"
          className="flex items-center gap-0.5 rounded-control bg-surface-sunken p-0.5"
        >
          {(
            [
              { value: 'assigned' as const, label: 'Asignado' },
              { value: 'remaining' as const, label: 'Restante' },
            ]
          ).map((segment) => (
            <button
              key={segment.value}
              type="button"
              aria-pressed={view === segment.value}
              onClick={() => setView(segment.value)}
              className={
                segmentBase +
                (view === segment.value
                  ? ' bg-surface-card text-strong shadow-sm'
                  : ' text-muted hover:text-strong')
              }
            >
              {segment.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'assigned' ? (
        <>
          <div className="mt-2">
            <MacroChipRow
              calories={totals.calories}
              proteinG={totals.proteinG}
              carbsG={totals.carbsG}
              fatsG={totals.fatsG}
            />
          </div>
          {portionCalories != null ? (
            <p className="mt-1 w-full text-xs text-muted">
              {PORTIONS_COPY.builder.subtotalPortionsNote(String(Math.round(portionCalories)))}
            </p>
          ) : null}
        </>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {MACRO_ROWS.map((row) => {
            const target = numOr0(targets[row.field])
            const consumed = totals[row.total]
            const remaining = target - consumed
            const over = target > 0 && remaining < 0
            const percent = target > 0 ? Math.min(100, Math.max(0, Math.round((consumed / target) * 100))) : 0
            return (
              <li key={row.field}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{row.label}</span>
                  {target <= 0 ? (
                    <span className="text-xs text-subtle">Sin meta</span>
                  ) : over ? (
                    <span className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                      Te pasas por {formatAmount(-remaining, row.decimals)}
                      {row.unit}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold tabular-nums text-strong">
                      Restan {formatAmount(remaining, row.decimals)}
                      {row.unit}
                    </span>
                  )}
                </div>
                <div
                  role="progressbar"
                  aria-label={`${row.label}: ${formatAmount(consumed, row.decimals)} de ${formatAmount(target, row.decimals)}`}
                  aria-valuemin={0}
                  aria-valuemax={target}
                  aria-valuenow={Math.min(consumed, target)}
                  className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-sunken"
                >
                  <div
                    className={'h-full rounded-pill ' + (over ? 'bg-amber-500' : row.barClass)}
                    style={{ width: `${target > 0 ? (over ? 100 : percent) : 0}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
