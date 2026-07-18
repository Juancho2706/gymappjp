'use client'

import { Check } from 'lucide-react'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import type { NutritionDayCoverageRead } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { extraPortionsValue, formatPortionsEs } from './portion-marks.logic'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * Circulito de identidad del grupo: ÚNICO lugar donde se usa el color del catálogo
 * (letra blanca encima — patrón V1 probado en light/dark). El progreso SIEMPRE va en
 * `primary` del coach (white-label), nunca en el color del grupo (SPEC UX).
 */
export function PortionGroupCircle({
  code,
  color,
  sortOrder,
  size = 'sm',
}: {
  code: string
  color: string | null
  sortOrder: number
  size?: 'sm' | 'md'
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full font-black text-white',
        size === 'md' ? 'h-9 w-9 text-xs' : 'h-5 w-5 text-[9px]',
      )}
      style={{ backgroundColor: exchangeGroupColor({ color, sortOrder }) }}
    >
      {code}
    </span>
  )
}

/**
 * Fila secundaria compacta "Porciones de hoy" bajo el AuraHero (SPEC UX-b): el héroe
 * único siguen siendo los anillos de macros. Chips pequeños con circulito de código,
 * contador `n/N` y mini barra de 2 px; scroll-x si no caben en 360 px. Solo lista
 * grupos con target prescrito ese día; el exceso se muestra como "+n" (warning) y
 * completo como check (success).
 */
export function PortionCoverageRow({ items }: { items: NutritionDayCoverageRead[] }) {
  const rows = items.filter((row) => row.prescribed > 0)
  if (rows.length === 0) return null

  return (
    <section
      aria-label={PORTIONS_COPY.student.coverageTitle}
      className="rounded-card border border-border-subtle bg-surface-card p-3 shadow-sm"
    >
      <h2 className="text-sm font-medium text-strong">{PORTIONS_COPY.student.coverageTitle}</h2>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
        {rows.map((row, index) => {
          const complete = row.coverage >= row.prescribed
          const extra = extraPortionsValue(row.prescribed, row.coverage)
          const shown = Math.min(row.coverage, row.prescribed)
          // Display R5: 1 decimal máx; el chip se capea a N y el exceso va como "+n".
          const label = `${formatPortionsEs(Math.round(shown * 10) / 10)}/${formatPortionsEs(row.prescribed)}`
          const fillPct = Math.min(1, row.prescribed > 0 ? row.coverage / row.prescribed : 0) * 100
          return (
            <span
              key={row.groupCode}
              aria-label={`${row.groupName}: ${label}`}
              className={cx(
                'inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1.5',
                complete
                  ? 'border-emerald-300/60 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-950/30'
                  : 'border-border-subtle bg-surface-card',
              )}
              title={row.groupName}
            >
              <PortionGroupCircle code={row.groupCode} color={row.color} sortOrder={index} />
              <span className="flex flex-col items-start gap-0.5">
                <span
                  className={cx(
                    'text-xs font-semibold tabular-nums leading-none',
                    complete ? 'text-emerald-700 dark:text-emerald-300' : 'text-strong',
                  )}
                >
                  {label}
                </span>
                <span className="block h-0.5 w-8 overflow-hidden rounded-full bg-border-subtle">
                  <span
                    className={cx('block h-full rounded-full', complete ? 'bg-emerald-500' : 'bg-primary')}
                    style={{ width: `${fillPct}%` }}
                  />
                </span>
              </span>
              {complete && extra === 0 ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : null}
              {extra > 0 ? (
                <span className="rounded-pill border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                  {PORTIONS_COPY.student.extraBadge(formatPortionsEs(extra))}
                </span>
              ) : null}
            </span>
          )
        })}
      </div>
    </section>
  )
}
