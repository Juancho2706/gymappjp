'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FilePlus2,
  MessageCircle,
  Search,
  TrendingDown,
  X,
} from 'lucide-react'
import type { NutritionCoachHubItem } from '@eva/nutrition-v2'
import { NutritionCard, NutritionStatePanel, StrategyBadge } from '@/components/nutrition-v2'
import { AdherenceWeekDots } from '@/components/nutrition/AdherenceWeekDots'
import {
  ATTENTION_FILTER_LABELS,
  ATTENTION_FILTER_OPTIONS,
  DEFAULT_SORT,
  SORT_OPTIONS,
  applyRosterFilters,
  attentionReasonLabel,
  buildContactList,
  encodeCursorStack,
  isRosterPageComplete,
  parseCursorStack,
  pickWeeklyDrops,
  planCtaLabel,
  serializeRosterFilters,
  weeklyDropMessage,
  whatsappHref,
  type AttentionFilter,
  type HubMetrics,
  type RosterCursor,
  type RosterFilterContext,
  type RosterFilters,
  type SortKey,
} from '../_lib/hub-roster'
import { cn } from '@/lib/utils'

// Roster interactivo del Centro V2, en modo TRIAGE (migracion 20260805211949).
//
// Reparto de responsabilidades:
//  - SERVIDOR: busqueda por nombre (`q`) y orden (`sort`). Antes ambos eran client-side sobre
//    la pagina cargada, asi que buscar a alguien de la pagina 3 no lo encontraba y el "orden
//    por atencion" solo reordenaba 25 filas arbitrarias. Cambiarlos NAVEGA (router.replace) y
//    resetea la paginacion: la pagina 2 de otra busqueda no significa nada.
//  - CLIENTE: el filtro por estado (`attn`) sobre la pagina visible; se sincroniza a la URL con
//    history.replaceState (sin refetch del RSC) para que el enlace siga siendo compartible.
//
// La app NO mensajea alumnos: todo contacto sale por WhatsApp (wa.me) con el telefono del
// alumno, en pestaña nueva. Nada se envia desde el servidor.

const BASE_PATH = '/coach/nutrition-v2'
const SEARCH_DEBOUNCE_MS = 400

const ADHERENCE_FORMULA_TITLE =
  'Un día cuenta “en meta” si el consumo queda entre 90% y 110% de la meta de ese día. ' +
  'Banda sana: 75-90% de adherencia semanal.'

export function HubRoster({
  items,
  metrics,
  hasMore,
  nextCursor,
  initialFilters,
  todayIso,
  timeZone,
}: {
  items: NutritionCoachHubItem[]
  metrics: HubMetrics
  hasMore: boolean
  nextCursor: RosterCursor | null
  initialFilters: RosterFilters
  /** Hoy en la zona del coach (`YYYY-MM-DD`), resuelto en el servidor. */
  todayIso: string
  timeZone: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // `initialFilters` son los filtros YA APLICADOS por el servidor en esta respuesta. La
  // busqueda y el orden se leen de ahi (no de estado local) para que el href de paginacion y
  // el debounce comparen contra la verdad servida.
  const appliedSearch = initialFilters.search
  const appliedSort = initialFilters.sort

  const [searchDraft, setSearchDraft] = useState(initialFilters.search)
  const [attention, setAttention] = useState<AttentionFilter>(initialFilters.attention)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const ctx: RosterFilterContext = useMemo(() => ({ todayIso, timeZone }), [todayIso, timeZone])

  // Estado de paginacion leido de la URL (fuente de verdad RSC). `incomingCursor` es el
  // cursor con que el servidor cargo ESTA pagina (null en la primera); `prevStackRaw` es
  // la pila codificada de cursores ancestros para "Pagina anterior".
  const incomingCursorUpdatedAt = searchParams.get('cursorUpdatedAt')
  const incomingCursorClientId = searchParams.get('cursorClientId')
  const incomingCursorScore = searchParams.get('cursorScore')
  const incomingCursor: RosterCursor | null = useMemo(
    () =>
      incomingCursorUpdatedAt && incomingCursorClientId
        ? {
            updatedAt: incomingCursorUpdatedAt,
            clientId: incomingCursorClientId,
            score:
              incomingCursorScore != null && incomingCursorScore !== ''
                ? Number(incomingCursorScore)
                : null,
          }
        : null,
    [incomingCursorUpdatedAt, incomingCursorClientId, incomingCursorScore],
  )
  const prevStackRaw = searchParams.get('pc')
  const hasIncomingCursor = incomingCursor !== null

  // Solo cuando la pagina es el roster completo (sin cursor de entrada ni pagina siguiente)
  // las metricas son totales reales; con paginacion son un resumen de la pagina visible.
  const metricsAreTotals = isRosterPageComplete({ hasMore, hasIncomingCursor })

  /** Navega cambiando un param SERVER-side. Resetea cursor y pila: la pagina N de otra query no existe. */
  const navigateServer = useCallback(
    (next: { search?: string; sort?: SortKey }) => {
      const params = new URLSearchParams(
        serializeRosterFilters({
          search: next.search ?? appliedSearch,
          attention,
          sort: next.sort ?? appliedSort,
        }),
      )
      const qs = params.toString()
      router.replace(qs ? `${BASE_PATH}?${qs}` : BASE_PATH, { scroll: false })
    },
    [router, appliedSearch, appliedSort, attention],
  )

  // Busqueda server-side con debounce. No dispara en el montaje ni despues de navegar: el
  // draft y lo aplicado coinciden, asi que la comparacion corta el ciclo sola.
  useEffect(() => {
    const trimmed = searchDraft.trim().slice(0, 120)
    if (trimmed === appliedSearch.trim()) return
    const timer = setTimeout(() => navigateServer({ search: trimmed }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, appliedSearch, navigateServer])

  // El filtro por estado es client-side: se refleja en la URL SIN navegar. Se parte de la URL
  // vigente para no pisar los params server-side (`q`, `sort`) ni los del cursor.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (attention === 'all') params.delete('attn')
    else params.set('attn', attention)
    const qs = params.toString()
    window.history.replaceState(window.history.state, '', qs ? `${BASE_PATH}?${qs}` : BASE_PATH)
  }, [attention])

  const filters: RosterFilters = useMemo(
    () => ({ search: appliedSearch, attention, sort: appliedSort }),
    [appliedSearch, attention, appliedSort],
  )

  const visible = useMemo(() => applyRosterFilters(items, filters, ctx), [items, filters, ctx])

  // Franja de triage: quienes venian registrando y bajaron fuerte esta semana. Se calcula
  // sobre la pagina completa (no sobre `visible`): es un aviso, no un resultado de filtro.
  const drops = useMemo(() => pickWeeklyDrops(items, 3), [items])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  // Se derivan de `items` (no de `visible`) para que cambiar de filtro no borre la seleccion.
  const selectedItems = useMemo(
    () => items.filter((item) => selectedSet.has(item.clientId)),
    [items, selectedSet],
  )
  const contactQueue = useMemo(
    () => selectedItems.filter((item) => whatsappHref(item.phone) !== null),
    [selectedItems],
  )

  const toggleSelected = useCallback((clientId: string) => {
    setSelectedIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    )
  }, [])

  /** Abre el wa.me del PRIMERO de la cola y lo saca: un click = un alumno, sin popups masivos. */
  const handleOpenNextWhatsapp = useCallback(() => {
    const next = contactQueue[0]
    if (!next) return
    const href = whatsappHref(next.phone)
    if (!href) return
    window.open(href, '_blank', 'noopener,noreferrer')
    setSelectedIds((prev) => prev.filter((id) => id !== next.clientId))
  }, [contactQueue])

  const handleCopyList = useCallback(async () => {
    const text = buildContactList(selectedItems, ctx)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${selectedItems.length} alumnos copiados`)
    } catch {
      toast.error('No se pudo copiar la lista')
    }
  }, [selectedItems, ctx])

  const cursorParams = useCallback((cursor: RosterCursor | null, params: URLSearchParams) => {
    if (!cursor) return
    params.set('cursorUpdatedAt', cursor.updatedAt)
    params.set('cursorClientId', cursor.clientId)
    // El keyset por score solo existe en el orden por atencion; sin el, la pagina 2 vuelve
    // a empezar por el mas urgente.
    if (cursor.score != null && Number.isFinite(cursor.score)) {
      params.set('cursorScore', String(cursor.score))
    }
  }, [])

  // "Pagina siguiente": empuja el cursor de ESTA pagina a la pila y navega al siguiente.
  const nextHref = useMemo(() => {
    if (!nextCursor) return null
    const params = new URLSearchParams(serializeRosterFilters(filters))
    cursorParams(nextCursor, params)
    const stack = [...parseCursorStack(prevStackRaw), incomingCursor]
    params.set('pc', encodeCursorStack(stack))
    return `${BASE_PATH}?${params.toString()}`
  }, [nextCursor, filters, prevStackRaw, incomingCursor, cursorParams])

  // "Pagina anterior": saca el tope de la pila (cursor de la pagina previa) y navega alla.
  // Sin pila (deep-link a una pagina interna) cae de vuelta a la primera.
  const prevHref = useMemo(() => {
    if (!hasIncomingCursor) return null
    const stack = parseCursorStack(prevStackRaw)
    const target = stack.length > 0 ? stack[stack.length - 1] : null
    const remaining = stack.slice(0, -1)
    const params = new URLSearchParams(serializeRosterFilters(filters))
    cursorParams(target ?? null, params)
    if (remaining.length > 0) params.set('pc', encodeCursorStack(remaining))
    return `${BASE_PATH}?${params.toString()}`
  }, [hasIncomingCursor, filters, prevStackRaw, cursorParams])

  const isFiltered =
    appliedSearch.trim().length > 0 || attention !== 'all' || appliedSort !== DEFAULT_SORT

  const clearFilters = useCallback(() => {
    setSearchDraft('')
    setAttention('all')
    router.replace(BASE_PATH, { scroll: false })
  }, [router])

  // El chip del valor activo que no vive en la fila por defecto (hoy: "Sin plan", que activa
  // la tile de stats) se agrega al vuelo para que el filtro nunca quede invisible.
  const chipOptions = useMemo(() => {
    const base = ATTENTION_FILTER_OPTIONS
    if (base.some((option) => option.value === attention)) return base
    return [...base, { value: attention, label: ATTENTION_FILTER_LABELS[attention] }]
  }, [attention])

  return (
    <div data-testid="nutrition-v2-hub-roster">
      {/* Stats como UNA card segmentada (divide-x): menos ruido de bordes que tres tiles
          sueltos y los numeros respiran mas anchos en movil ~390px. "Sin plan" es accionable
          (filtra); "Con plan" y "Activos hoy" no tienen filtro equivalente y quedan estaticos. */}
      <div className="mb-4">
        {metricsAreTotals ? null : (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Resumen de la página
          </p>
        )}
        <div className="grid grid-cols-3 divide-x divide-border-subtle rounded-card border border-border-subtle bg-surface-card shadow-sm">
          <Metric label="Con plan" value={metrics.withPlan} />
          <Metric
            active={attention === 'no_plan'}
            label="Sin plan"
            onClick={() => setAttention((prev) => (prev === 'no_plan' ? 'all' : 'no_plan'))}
            value={metrics.withoutPlan}
          />
          <Metric label="Activos hoy" value={metrics.activeToday} />
        </div>
      </div>

      {/* Franja de triage. Solo aparece con candidatos reales: una franja vacia todos los dias
          entrena a ignorarla. */}
      {drops.length > 0 ? (
        <section
          aria-label="Alumnos que bajaron esta semana"
          className="mb-4 rounded-card border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <TrendingDown aria-hidden="true" className="h-4 w-4" />
            Bajaron esta semana
          </h2>
          <ul className="mt-2 space-y-2">
            {drops.map((drop) => {
              const href = whatsappHref(drop.phone, weeklyDropMessage(drop.clientName))
              return (
                <li className="flex items-center justify-between gap-2" key={drop.clientId}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-strong">{drop.clientName}</p>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      -{drop.drop} {drop.drop === 1 ? 'día' : 'días'} vs semana pasada ·{' '}
                      {drop.activeDays7d}/7 esta semana, {drop.activeDaysPrev7d}/7 la anterior
                    </p>
                  </div>
                  {href ? (
                    <a
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-control border border-amber-400/70 bg-surface-card px-3 text-xs font-semibold text-strong hover:bg-surface-sunken dark:border-amber-500/40"
                      href={href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-muted">Sin teléfono</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* Filtros: busqueda ancho completo (server-side) + chips de estado + orden. */}
      <div className="mb-5 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            inputMode="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value.slice(0, 120))}
            placeholder="Buscar alumno…"
            aria-label="Buscar alumno"
            className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-4 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
          />
        </div>
        <div
          aria-label="Filtrar por estado"
          className="flex flex-wrap items-center gap-1.5"
          role="group"
        >
          {chipOptions.map((option) => {
            const active = attention === option.value
            return (
              <button
                aria-pressed={active}
                className={cn(
                  'inline-flex min-h-9 items-center rounded-pill border px-3 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-default bg-surface-card text-muted hover:text-strong',
                )}
                key={option.value}
                onClick={() => setAttention(option.value)}
                type="button"
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="roster-sort">
            Ordenar roster
          </label>
          <select
            id="roster-sort"
            value={appliedSort}
            onChange={(event) => navigateServer({ sort: event.target.value as SortKey })}
            className="min-h-11 min-w-0 flex-1 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong outline-none focus:ring-2 focus:ring-ring sm:flex-none"
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
              onClick={clearFilters}
              aria-label="Limpiar filtros"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-muted hover:text-strong"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        appliedSearch.trim().length > 0 ? (
          <NutritionStatePanel
            icon="empty"
            illustration="sin-resultados"
            title="Sin coincidencias"
            description={`Ningún alumno de tu workspace coincide con “${appliedSearch.trim()}”.`}
            action={
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
              >
                <X className="h-4 w-4" />
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <NutritionStatePanel
            icon="empty"
            illustration="sin-alumnos"
            title="No hay alumnos en este scope"
            description="Este centro respeta el workspace activo y no mezcla alumnos de otros equipos u organizaciones."
          />
        )
      ) : visible.length === 0 ? (
        <NutritionStatePanel
          icon="empty"
          illustration="sin-resultados"
          title="Sin coincidencias"
          description="Ningún alumno de esta página está en ese estado. Prueba otro filtro o límpialos."
          action={
            <button
              type="button"
              onClick={clearFilters}
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
            {visible.map((item) => {
              const reason = attentionReasonLabel(item, ctx)
              const waHref = whatsappHref(item.phone)
              return (
                <NutritionCard key={item.clientId}>
                  <div className="flex items-start gap-2">
                    <SelectCheckbox
                      checked={selectedSet.has(item.clientId)}
                      clientName={item.clientName}
                      disabled={waHref === null}
                      onChange={() => toggleSelected(item.clientId)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-display text-lg font-semibold text-strong">
                          {item.clientName}
                        </h2>
                        {item.strategy ? <StrategyBadge compact strategy={item.strategy} /> : null}
                      </div>
                      {reason ? (
                        <p className="mt-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          {reason}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-muted">
                        {item.planName ?? 'Sin plan publicado'} · {item.intakeEntries7d} registros
                        en 7 días
                      </p>
                      <div className="mt-1.5" title={ADHERENCE_FORMULA_TITLE}>
                        <AdherenceWeekDots
                          days7d={item.days7d}
                          fallbackActiveDays={item.activeDays7d}
                          todayIso={todayIso}
                        />
                      </div>
                    </div>
                    {waHref ? (
                      <a
                        aria-label={`Escribir a ${item.clientName} por WhatsApp`}
                        className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-control border border-border-default bg-surface-card text-muted hover:text-strong"
                        href={waHref}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={`Escribir a ${item.clientName} por WhatsApp`}
                      >
                        <MessageCircle aria-hidden="true" className="h-4 w-4" />
                      </a>
                    ) : null}
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
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-control bg-primary/100 px-3 text-sm font-semibold text-white hover:bg-primary/90"
                    >
                      <FilePlus2 className="h-4 w-4" />
                      {planCtaLabel(item.planStatus)}
                    </Link>
                  </div>
                </NutritionCard>
              )
            })}
          </div>

          {/* Escritorio: tabla densa */}
          <div className="hidden overflow-x-auto rounded-card border border-border-default lg:block">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="w-10 px-3 py-2.5">
                    <span className="sr-only">Seleccionar</span>
                  </th>
                  <th className="px-4 py-2.5">Alumno</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5" title={ADHERENCE_FORMULA_TITLE}>
                    Semana
                  </th>
                  <th className="px-4 py-2.5 text-right">Registros 7d</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const reason = attentionReasonLabel(item, ctx)
                  const waHref = whatsappHref(item.phone)
                  return (
                    <tr
                      key={item.clientId}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-sunken/60"
                    >
                      <td className="px-3 py-2.5 align-top">
                        <SelectCheckbox
                          checked={selectedSet.has(item.clientId)}
                          clientName={item.clientName}
                          disabled={waHref === null}
                          onChange={() => toggleSelected(item.clientId)}
                        />
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-strong">{item.clientName}</span>
                          {item.strategy ? (
                            <StrategyBadge compact strategy={item.strategy} />
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                          {reason ?? <span className="text-subtle">Al día</span>}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 align-top text-muted">
                        <span className="truncate">{item.planName ?? 'Sin plan'}</span>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <AdherenceWeekDots
                          days7d={item.days7d}
                          fallbackActiveDays={item.activeDays7d}
                          size="sm"
                          todayIso={todayIso}
                        />
                      </td>
                      <td className="px-4 py-2.5 align-top text-right tabular-nums text-strong">
                        {item.intakeEntries7d}
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <div className="flex items-center justify-end gap-2">
                          {waHref ? (
                            <a
                              aria-label={`Escribir a ${item.clientName} por WhatsApp`}
                              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-control border border-border-default bg-surface-card text-muted hover:text-strong"
                              href={waHref}
                              rel="noopener noreferrer"
                              target="_blank"
                              title={`Escribir a ${item.clientName} por WhatsApp`}
                            >
                              <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          <Link
                            href={`${BASE_PATH}/${item.clientId}`}
                            className="inline-flex min-h-9 items-center gap-1 rounded-control border border-border-default bg-surface-card px-2.5 text-xs font-semibold text-strong hover:bg-surface-sunken"
                          >
                            Ficha
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                          <Link
                            href={`${BASE_PATH}/${item.clientId}/builder`}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-primary/100 px-2.5 text-xs font-semibold text-white hover:bg-primary/90"
                          >
                            <FilePlus2 className="h-3.5 w-3.5" />
                            {planCtaLabel(item.planStatus)}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {prevHref || (hasMore && nextHref) ? (
        <div className="mt-5 flex items-center justify-between gap-2">
          {prevHref ? (
            <Link
              href={prevHref}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken"
            >
              <ChevronLeft className="h-4 w-4" />
              Pagina anterior
            </Link>
          ) : (
            <span />
          )}
          {hasMore && nextHref ? (
            <Link
              href={nextHref}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken"
            >
              Pagina siguiente
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Barra de seleccion: cola de contacto, un alumno por click. Safe-area inset para no
          chocar con el home indicator. */}
      {selectedItems.length > 0 ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]"
          data-testid="nutrition-v2-hub-selection-bar"
        >
          <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-card border border-border-default bg-surface-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface-card/85">
            <p className="min-w-0 flex-1 text-sm font-semibold text-strong">
              {selectedItems.length} {selectedItems.length === 1 ? 'seleccionado' : 'seleccionados'}
            </p>
            <button
              className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3 text-xs font-semibold text-strong hover:bg-surface-sunken"
              onClick={handleCopyList}
              type="button"
            >
              <ClipboardList aria-hidden="true" className="h-4 w-4" />
              Copiar lista
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primary/100 px-3 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              disabled={contactQueue.length === 0}
              onClick={handleOpenNextWhatsapp}
              type="button"
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              Abrir WhatsApp ({contactQueue.length})
            </button>
            <button
              aria-label="Limpiar selección"
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-control border border-border-default bg-surface-card text-muted hover:text-strong"
              onClick={() => setSelectedIds([])}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SelectCheckbox({
  checked,
  clientName,
  disabled,
  onChange,
}: {
  checked: boolean
  clientName: string
  disabled: boolean
  onChange: () => void
}) {
  return (
    <input
      aria-label={
        disabled ? `${clientName}: sin teléfono registrado` : `Seleccionar a ${clientName}`
      }
      checked={checked}
      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onChange={onChange}
      title={disabled ? 'Sin teléfono registrado' : undefined}
      type="checkbox"
    />
  )
}

function Metric({
  active,
  label,
  onClick,
  value,
}: {
  active?: boolean
  label: string
  onClick?: () => void
  value: number
}) {
  // Segmento de la card de stats: número grande + etiqueta corta. El contenedor pone
  // borde/fondo una sola vez (divide-x entre segmentos); aquí solo padding interno.
  const body = (
    <>
      <p className="font-display text-2xl font-bold leading-tight tabular-nums text-strong sm:text-3xl">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-medium text-muted sm:text-sm">{label}</p>
    </>
  )

  if (!onClick) return <div className="min-w-0 px-3 py-3 sm:px-4">{body}</div>

  return (
    <button
      aria-pressed={active ?? false}
      className={cn(
        'min-w-0 px-3 py-3 text-left transition-colors hover:bg-surface-sunken sm:px-4',
        active ? 'bg-primary/10' : null,
      )}
      onClick={onClick}
      type="button"
    >
      {body}
    </button>
  )
}
