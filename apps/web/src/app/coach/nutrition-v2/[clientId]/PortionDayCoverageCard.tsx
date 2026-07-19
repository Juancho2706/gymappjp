import { Check } from 'lucide-react'
import { exchangeGroupColor, formatPortions } from '@eva/nutrition-engine'
import type { NutritionDayCoverageRead } from '@eva/nutrition-v2'
import { NutritionCard } from '@/components/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'

/** Coma decimal es-CL para display ("1,5") sobre el `formatPortions` del engine. */
function formatPortionsEs(portions: number): string {
  return formatPortions(portions).replace('.', ',')
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * Fila "Porciones" read-only de la ficha del alumno para el coach (SPEC UX-b,
 * criterio "Coach ficha alumno"): chips compactos `n/N` por grupo bajo los macros
 * del día. Misma fuente que el alumno (`detail.today.dayCoverage` del read-model) —
 * CERO cálculo nuevo en el coach. Plan sin porciones ⇒ no renderiza nada (Q1).
 */
export function PortionDayCoverageCard({
  coverage,
}: {
  coverage: NutritionDayCoverageRead[] | undefined
}) {
  const rows = (coverage ?? []).filter((row) => row.prescribed > 0)
  if (rows.length === 0) return null

  return (
    <NutritionCard>
      <h2 className="font-display text-base font-semibold text-strong">
        {PORTIONS_COPY.coach.dayCoverage}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((row, index) => {
          const complete = row.coverage >= row.prescribed
          const extra = row.coverage - row.prescribed
          const shown = Math.min(row.coverage, row.prescribed)
          const label = `${formatPortionsEs(Math.round(shown * 10) / 10)}/${formatPortionsEs(row.prescribed)}`
          return (
            <span
              aria-label={`${row.groupName}: ${label}`}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1.5',
                complete
                  ? 'border-emerald-300/60 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-950/30'
                  : 'border-border-subtle bg-surface-card',
              )}
              key={row.groupCode}
              title={row.groupName}
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white"
                style={{ backgroundColor: exchangeGroupColor({ color: row.color, sortOrder: index }) }}
              >
                {row.groupCode}
              </span>
              <span
                className={cx(
                  'text-xs font-semibold tabular-nums',
                  complete ? 'text-emerald-700 dark:text-emerald-300' : 'text-strong',
                )}
              >
                {label}
              </span>
              {complete && extra <= 0 ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : null}
              {extra > 0 ? (
                <span className="rounded-pill border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                  +{formatPortionsEs(Math.round(extra * 10) / 10)}
                </span>
              ) : null}
            </span>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted">{PORTIONS_COPY.coach.derivedNote}</p>
    </NutritionCard>
  )
}
