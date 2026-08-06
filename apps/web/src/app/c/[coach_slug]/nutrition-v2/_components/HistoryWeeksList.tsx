'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { NutritionCard } from '@/components/nutrition-v2'
import { fetchNutritionHistoryWeeksAction } from '../_actions/history.actions'
import { formatHistoryWeekRangeLabel, type HistoryWeekBucket } from './week-nav.logic'

/**
 * Tab "Historial": lista de semanas, con paginación ACUMULATIVA (SPEC ola 3 punto 7 — "Ver
 * semanas anteriores" AGREGA cards, nunca reemplaza el listado por una página nueva). La carga
 * inicial la resuelve el server (`page.tsx`); este componente solo AÑADE tandas siguientes vía
 * server action, así el primer render sigue siendo 100% RSC.
 */
export function HistoryWeeksList({
  clientId,
  base,
  todayIso,
  initialWeeks,
  initialHasMore,
  initialCursor,
  pageSize,
}: {
  clientId: string
  base: string
  todayIso: string
  initialWeeks: HistoryWeekBucket[]
  initialHasMore: boolean
  initialCursor: string | null
  /** Mismo tamaño de tanda que usó la carga inicial en `page.tsx`. */
  pageSize: number
}) {
  const [weeks, setWeeks] = useState(initialWeeks)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [cursor, setCursor] = useState(initialCursor)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadMore = () => {
    setError(null)
    startTransition(async () => {
      const res = await fetchNutritionHistoryWeeksAction({ clientId, before: cursor, pageSize, todayIso })
      if (!res.ok) {
        setError('No se pudo cargar más historial. Intenta de nuevo.')
        return
      }
      // ACUMULATIVO: se agrega al final, jamás se reemplaza lo ya pintado.
      setWeeks((prev) => [...prev, ...res.weeks])
      setHasMore(res.hasMore)
      setCursor(res.nextCursor)
    })
  }

  return (
    <div className="space-y-3">
      {weeks.map((week) => (
        <HistoryWeekCard base={base} key={week.weekStartIso} week={week} />
      ))}
      {/* Paridad RN T1.3 (mismo copy que `nutrition-v2/index.tsx`): la semana en curso queda
          fuera de `groupHistoryDaysByWeek`, así que el alumno necesita saber dónde verla. */}
      <p className="text-xs text-subtle">Semanas anteriores — la semana en curso vive en el tab Hoy</p>
      {error ? (
        <p className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {hasMore ? (
        <button
          className="inline-flex min-h-11 items-center rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken disabled:opacity-60"
          disabled={isPending}
          onClick={loadMore}
          type="button"
        >
          {isPending ? 'Cargando…' : 'Ver semanas anteriores'}
        </button>
      ) : null}
    </div>
  )
}

/** Card de una semana: rango + n/7 días + % arriba, mini-strip de 7 días tappable abajo. */
function HistoryWeekCard({ week, base }: { week: HistoryWeekBucket; base: string }) {
  return (
    <NutritionCard>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-base font-semibold text-strong">
          Semana {formatHistoryWeekRangeLabel(week.weekStartIso, week.weekEndIso)}
        </h2>
        <span className="text-xs font-semibold tabular-nums text-muted">
          {week.loggedCount}/7 días · {week.percent}%
        </span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {week.cells.map((cell) => {
          const logged = cell.state === 'past-logged' || cell.isLegacy === true
          return (
            <Link
              aria-label={`${cell.longLabel}: ver ese día`}
              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-control border border-border-subtle bg-surface-sunken/40 text-[10px] font-semibold text-muted transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`${base}/nutrition-v2?view=history&date=${cell.isoDate}`}
              key={cell.isoDate}
            >
              <span className="uppercase tracking-[0.06em]">{cell.shortLabel}</span>
              <span
                aria-hidden="true"
                className={
                  logged
                    ? 'h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400'
                    : 'h-1.5 w-1.5 shrink-0 rounded-full bg-border-default'
                }
              />
            </Link>
          )
        })}
      </div>
    </NutritionCard>
  )
}
