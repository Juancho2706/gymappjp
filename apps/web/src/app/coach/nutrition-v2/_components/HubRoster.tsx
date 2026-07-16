'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronRight, FilePlus2, Search, Users, X } from 'lucide-react'
import type { NutritionCoachHubItem } from '@eva/nutrition-v2'
import {
  CoachAttentionCard,
  NutritionCard,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import {
  ATTENTION_FILTER_OPTIONS,
  SORT_OPTIONS,
  applyRosterFilters,
  serializeRosterFilters,
  type AttentionFilter,
  type AttentionReason,
  type HubMetrics,
  type RosterFilters,
  type SortKey,
} from '../_lib/hub-roster'

// Roster interactivo del Centro V2. Recibe la pagina ya cargada del servidor (items +
// metricas + cursor) y aplica filtros/orden client-side (el RPC no los soporta). Los
// filtros se persisten en la URL (searchParams, compartible) via history.replaceState
// para no gatillar un refetch del RSC en cada tecla; la paginacion por cursor si navega.

const BASE_PATH = '/coach/nutrition-v2'

function attentionTitle(reason: Exclude<AttentionReason, 'none'>): string {
  if (reason === 'no_plan') return 'Sin plan V2 publicado'
  if (reason === 'draft_pending') return 'Borrador pendiente'
  return 'Sin consumo reciente'
}

function attentionDescription(reason: Exclude<AttentionReason, 'none'>): string {
  if (reason === 'no_plan') return 'Este alumno todavia no tiene una prescripcion versionada.'
  if (reason === 'draft_pending') return 'Existe una version que aun no ha sido publicada.'
  return 'No hay registros canonicos durante los ultimos siete dias.'
}

export function HubRoster({
  items,
  metrics,
  hasMore,
  nextCursor,
  initialFilters,
}: {
  items: NutritionCoachHubItem[]
  metrics: HubMetrics
  hasMore: boolean
  nextCursor: { updatedAt: string; clientId: string } | null
  initialFilters: RosterFilters
}) {
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<RosterFilters>(initialFilters)

  // Sincroniza los filtros a la URL sin navegar (shareable, sin refetch). El cursor
  // vigente se preserva desde los searchParams de la navegacion RSC.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams()
    const cursorUpdatedAt = searchParams.get('cursorUpdatedAt')
    const cursorClientId = searchParams.get('cursorClientId')
    if (cursorUpdatedAt) params.set('cursorUpdatedAt', cursorUpdatedAt)
    if (cursorClientId) params.set('cursorClientId', cursorClientId)
    for (const [key, value] of Object.entries(serializeRosterFilters(filters))) {
      params.set(key, value)
    }
    const qs = params.toString()
    window.history.replaceState(window.history.state, '', qs ? `${BASE_PATH}?${qs}` : BASE_PATH)
  }, [filters, searchParams])

  const visible = useMemo(() => applyRosterFilters(items, filters), [items, filters])

  const loadMoreHref = useMemo(() => {
    if (!nextCursor) return null
    const params = new URLSearchParams(serializeRosterFilters(filters))
    params.set('cursorUpdatedAt', nextCursor.updatedAt)
    params.set('cursorClientId', nextCursor.clientId)
    return `${BASE_PATH}?${params.toString()}`
  }, [nextCursor, filters])

  const isFiltered =
    filters.search.trim().length > 0 || filters.attention !== 'all' || filters.sort !== 'default'

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Con plan V2" value={metrics.withPlan} />
        <Metric label="Sin plan V2" value={metrics.withoutPlan} />
        <Metric label="Con actividad hoy" value={metrics.activeToday} />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            inputMode="search"
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value.slice(0, 120) }))
            }
            placeholder="Buscar alumno por nombre…"
            aria-label="Buscar alumno en el roster"
            className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-4 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
          />
        </div>
        <label className="sr-only" htmlFor="roster-attention">
          Filtrar por estado de atencion
        </label>
        <select
          id="roster-attention"
          value={filters.attention}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, attention: event.target.value as AttentionFilter }))
          }
          className="min-h-11 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong outline-none focus:ring-2 focus:ring-ring"
        >
          {ATTENTION_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="roster-sort">
          Ordenar roster
        </label>
        <select
          id="roster-sort"
          value={filters.sort}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, sort: event.target.value as SortKey }))
          }
          className="min-h-11 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong outline-none focus:ring-2 focus:ring-ring"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {isFiltered ? (
          <button
            type="button"
            onClick={() => setFilters({ search: '', attention: 'all', sort: 'default' })}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-muted hover:text-strong"
          >
            <X className="h-4 w-4" />
            Limpiar
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <NutritionStatePanel
          icon="empty"
          title="No hay alumnos en este scope"
          description="El Centro V2 respeta el workspace activo y no mezcla alumnos de otros equipos u organizaciones."
        />
      ) : visible.length === 0 ? (
        <NutritionStatePanel
          icon="empty"
          title="Sin coincidencias"
          description="Ningun alumno de esta pagina coincide con los filtros. Ajusta la busqueda o limpia los filtros."
          action={
            <button
              type="button"
              onClick={() => setFilters({ search: '', attention: 'all', sort: 'default' })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
            >
              <X className="h-4 w-4" />
              Limpiar filtros
            </button>
          }
        />
      ) : (
        <>
          {/* Movil: cards */}
          <div className="space-y-3 lg:hidden">
            {visible.map((item) => (
              <NutritionCard key={item.clientId}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-lg font-semibold text-strong">
                      {item.clientName}
                    </h2>
                    {item.strategy ? <StrategyBadge compact strategy={item.strategy} /> : null}
                    {item.versionNumber && item.planStatus === 'published' ? (
                      <PlanVersionBadge version={item.versionNumber} status="published" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {item.planName ?? 'Sin plan V2 publicado'} · {item.intakeEntries7d} registros en 7 dias
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`${BASE_PATH}/${item.clientId}`}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong hover:bg-surface-sunken"
                  >
                    Abrir ficha
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`${BASE_PATH}/${item.clientId}/builder`}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-control bg-ember-500 px-3 text-sm font-semibold text-white hover:bg-ember-600"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    Crear plan
                  </Link>
                </div>
                {item.attentionReason !== 'none' ? (
                  <div className="mt-3">
                    <CoachAttentionCard
                      item={{
                        id: item.clientId,
                        title: attentionTitle(item.attentionReason),
                        description: attentionDescription(item.attentionReason),
                        reason: item.attentionReason,
                        tone: item.attentionReason === 'no_plan' ? 'warning' : 'info',
                        actionLabel: 'Revisar',
                      }}
                    />
                  </div>
                ) : null}
              </NutritionCard>
            ))}
          </div>

          {/* Escritorio: tabla densa */}
          <div className="hidden overflow-x-auto rounded-card border border-border-default lg:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5">Alumno</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5 text-right">Registros 7d</th>
                  <th className="px-4 py-2.5">Atencion</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr
                    key={item.clientId}
                    className="border-b border-border-subtle last:border-0 hover:bg-surface-sunken/60"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-strong">{item.clientName}</span>
                        {item.strategy ? <StrategyBadge compact strategy={item.strategy} /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{item.planName ?? 'Sin plan V2'}</span>
                        {item.versionNumber && item.planStatus === 'published' ? (
                          <PlanVersionBadge version={item.versionNumber} status="published" />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-strong">
                      {item.intakeEntries7d}
                    </td>
                    <td className="px-4 py-2.5">
                      {item.attentionReason === 'none' ? (
                        <span className="text-xs text-subtle">Al dia</span>
                      ) : (
                        <span
                          className={
                            'inline-flex items-center rounded-pill border px-2 py-0.5 text-xs font-semibold ' +
                            (item.attentionReason === 'no_plan'
                              ? 'border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                              : 'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300')
                          }
                        >
                          {attentionTitle(item.attentionReason)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`${BASE_PATH}/${item.clientId}`}
                          className="inline-flex min-h-9 items-center gap-1 rounded-control border border-border-default bg-surface-card px-2.5 text-xs font-semibold text-strong hover:bg-surface-sunken"
                        >
                          Ficha
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                          href={`${BASE_PATH}/${item.clientId}/builder`}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-ember-500 px-2.5 text-xs font-semibold text-white hover:bg-ember-600"
                        >
                          <FilePlus2 className="h-3.5 w-3.5" />
                          Crear plan
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {hasMore && loadMoreHref ? (
        <Link
          href={loadMoreHref}
          className="mt-5 inline-flex min-h-11 items-center rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken"
        >
          Ver mas alumnos
        </Link>
      ) : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <NutritionCard>
      <Users className="h-5 w-5 text-ember-600" />
      <p className="mt-3 font-display text-3xl font-bold text-strong">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </NutritionCard>
  )
}
