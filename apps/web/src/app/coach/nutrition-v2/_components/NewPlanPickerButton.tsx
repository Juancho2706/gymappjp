'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Copy, FilePlus2, Loader2, Plus, Search, Star, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { filterPickerEntries, planCtaLabel } from '../_lib/hub-roster'
import { searchCoachRosterAction } from '../_actions/roster-search.actions'
import { listPlanTemplatesAction } from '../_actions/plan-templates.actions'
// `import type` puro: se borra en compilacion, asi que el servicio (y su repository) jamas
// entran al bundle cliente — la trampa del barrel que ya nos costo un build.
import type { PlanTemplateListItem } from '@/services/nutrition-v2/plan-templates.service'

// CTA global "Nuevo plan" del Centro V2. El hub no tiene un alumno seleccionado, asi que el
// boton abre un selector con el roster del workspace (buscable) y, al elegir, navega al builder
// del alumno (/coach/nutrition-v2/[clientId]/builder).
//
// NUT-026: el RSC entrega solo la PRIMERA pagina alfabetica; escribir dispara busqueda
// server-side (debounce 300 ms) sobre TODO el workspace. Antes el RSC pre-cargaba hasta 400
// alumnos y el filtro era client-side: el alumno #401 era invisible e imbuscable.

export interface NewPlanPickerEntry {
  clientId: string
  clientName: string
  /** planStatus del hub: gobierna el label "Crear plan" vs "Nueva version". */
  planStatus: string | null
}

const SEARCH_DEBOUNCE_MS = 300
const MIN_SERVER_SEARCH_LEN = 2

export function NewPlanPickerButton({
  roster,
  hasMore = false,
}: {
  roster: NewPlanPickerEntry[]
  /** Hay mas alumnos que los de la primera pagina: la busqueda deja de ser opcional. */
  hasMore?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [remote, setRemote] = useState<NewPlanPickerEntry[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchId = useId()
  const requestRef = useRef(0)
  // Pestañas del modal (AD-3, F3). "Desde cero" es lo de siempre; "Reutilizar" elige primero un
  // ORIGEN (plantilla o el plan vigente de otro alumno) y despues el alumno destino.
  const [tab, setTab] = useState<'scratch' | 'reuse'>('scratch')
  const [source, setSource] = useState<{ kind: 'template' | 'plan'; id: string; label: string } | null>(null)
  const [templates, setTemplates] = useState<PlanTemplateListItem[] | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  const term = search.trim()
  const useRemote = term.length >= MIN_SERVER_SEARCH_LEN

  // Busqueda server-side con debounce. `requestRef` descarta respuestas fuera de orden
  // (el coach sigue tecleando mientras vuelve una consulta vieja).
  useEffect(() => {
    if (!open || !useRemote) {
      setRemote(null)
      setSearching(false)
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    const ticket = ++requestRef.current
    const timer = setTimeout(() => {
      void searchCoachRosterAction({ search: term, pageSize: 50 })
        .then((res) => {
          if (ticket !== requestRef.current) return
          if (res.ok) setRemote(res.items)
          else setSearchError(res.error)
        })
        .catch(() => {
          if (ticket === requestRef.current) setSearchError('No pudimos buscar alumnos. Intenta de nuevo.')
        })
        .finally(() => {
          if (ticket === requestRef.current) setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [open, term, useRemote])

  // Con termino corto se filtra la primera pagina en memoria (respuesta instantanea);
  // desde 2 caracteres manda el servidor.
  const filtered = useMemo(
    () => (useRemote ? (remote ?? []) : filterPickerEntries(roster, search)),
    [useRemote, remote, roster, search],
  )

  function onOpenChange(next: boolean) {
    if (next) {
      setSearch('')
      setRemote(null)
      setSearchError(null)
      setTab('scratch')
      setSource(null)
      setTemplateError(null)
    }
    setOpen(next)
  }

  // Las plantillas se cargan al entrar a "Reutilizar", no al abrir el modal: quien viene a
  // crear desde cero no paga una consulta que no pidio.
  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    const result = await listPlanTemplatesAction()
    setLoadingTemplates(false)
    if (!result.ok) {
      setTemplateError(result.error)
      setTemplates([])
      return
    }
    setTemplateError(null)
    setTemplates(result.templates)
  }, [])

  useEffect(() => {
    if (!open || tab !== 'reuse' || templates !== null) return
    void loadTemplates()
  }, [open, tab, templates, loadTemplates])

  /** Alumnos que YA tienen plan: son los unicos que sirven de origen para copiar. */
  const planSources = useMemo(
    () => filterPickerEntries(roster, '').filter((entry) => entry.planStatus != null),
    [roster]
  )

  function choose(clientId: string) {
    setOpen(false)
    // Con origen elegido, la MISMA ruta del builder lo recibe por `?from=` (AD-3): no hay un
    // segundo camino de creacion que pueda divergir del wizard normal.
    const suffix = source ? `?from=${source.kind}:${source.id}` : ''
    router.push(`/coach/nutrition-v2/${clientId}/builder${suffix}`)
  }

  return (
    <>
      {/* En el header compacto del hub (movil ~390px) el label no cabe junto al titulo:
          bajo `sm` queda icono solo (44px, aria-label) y desde `sm` icono + texto. */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="Nuevo plan"
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90 sm:px-4"
      >
        <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
        <span className="hidden sm:inline">Nuevo plan</span>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="normal-case tracking-tight">Nuevo plan de nutrición</DialogTitle>
            <DialogDescription>
              {tab === 'reuse' && !source
                ? 'Elige de qué partir: una plantilla tuya o el plan de un alumno.'
                : source
                  ? `Partirás de «${source.label}». Elige el alumno que recibe el plan.`
                  : 'Elige el alumno para abrir su builder y crear (o versionar) su plan.'}
            </DialogDescription>
          </DialogHeader>

          {/* Dos puertas, una sola ruta de destino (AD-3). */}
          <div className="mt-2 flex gap-1 rounded-control bg-surface-sunken p-1">
            {(
              [
                { id: 'scratch', label: 'Desde cero' },
                { id: 'reuse', label: 'Reutilizar' },
              ] as const
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => {
                  setTab(entry.id)
                  setSource(null)
                }}
                className={`min-h-11 flex-1 rounded-control px-3 text-sm font-semibold transition-colors ${
                  tab === entry.id ? 'bg-surface-card text-strong shadow-sm' : 'text-muted hover:text-body'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {tab === 'reuse' && !source ? (
            <div className="mt-3 space-y-4">
              <section className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Tus plantillas</h3>
                {loadingTemplates ? (
                  <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted">
                    <Loader2 className="size-4 animate-spin" /> Cargando plantillas…
                  </p>
                ) : templateError ? (
                  <p className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                    {templateError}
                  </p>
                ) : (templates?.length ?? 0) === 0 ? (
                  <p className="rounded-control border border-border-subtle bg-surface-sunken px-3 py-4 text-sm text-muted">
                    Todavía no tienes plantillas. Guarda el plan de un alumno como plantilla y
                    aparecerá acá.
                  </p>
                ) : (
                  <ul className="max-h-[28vh] space-y-1.5 overflow-y-auto pr-1">
                    {(templates ?? []).map((template) => (
                      <li key={template.id}>
                        <button
                          type="button"
                          disabled={!template.readable}
                          onClick={() =>
                            setSource({ kind: 'template', id: template.id, label: template.name })
                          }
                          className="flex w-full items-center gap-3 rounded-control border border-border-default bg-surface-card px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {template.isFavorite ? (
                            <Star className="size-4 shrink-0 fill-current text-amber-500" />
                          ) : (
                            <Copy className="size-4 shrink-0 text-subtle" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-strong">{template.name}</span>
                            <span className="block truncate text-xs text-muted">
                              {template.readable
                                ? [
                                    template.summary?.calories ? `${template.summary.calories} kcal` : null,
                                    template.summary?.mealSlotCount
                                      ? `${template.summary.mealSlotCount} franjas`
                                      : null,
                                    template.usageCount > 0 ? `usada ${template.usageCount}×` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || 'Plantilla'
                                : 'No se puede abrir: se guardó con una versión anterior.'}
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-subtle" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                  …o copia el plan de un alumno
                </h3>
                {planSources.length === 0 ? (
                  <p className="rounded-control border border-border-subtle bg-surface-sunken px-3 py-4 text-sm text-muted">
                    Ninguno de tus alumnos tiene plan todavía.
                  </p>
                ) : (
                  <ul className="max-h-[28vh] space-y-1.5 overflow-y-auto pr-1">
                    {planSources.map((entry) => (
                      <li key={entry.clientId}>
                        <button
                          type="button"
                          onClick={() =>
                            setSource({
                              kind: 'plan',
                              id: entry.clientId,
                              label: `Plan de ${entry.clientName}`,
                            })
                          }
                          className="flex w-full items-center gap-3 rounded-control border border-border-default bg-surface-card px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-surface-sunken"
                        >
                          <span className="min-w-0 flex-1 truncate font-semibold text-strong">
                            {entry.clientName}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-subtle" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
          <div className="mt-1 space-y-4">
            {source ? (
              <button
                type="button"
                onClick={() => setSource(null)}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-body"
              >
                <ArrowLeft className="size-4" />
                Cambiar el origen
              </button>
            ) : null}
            {roster.length === 0 ? (
              <div className="rounded-control border border-border-subtle bg-surface-sunken px-4 py-8 text-center text-sm text-muted">
                <Users className="mx-auto mb-2 h-7 w-7 opacity-30" />
                No hay alumnos en tu espacio para crear un plan.
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                  <label className="sr-only" htmlFor={searchId}>
                    Buscar alumno
                  </label>
                  <input
                    id={searchId}
                    type="search"
                    inputMode="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value.slice(0, 120))}
                    placeholder="Buscar alumno…"
                    className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-10 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
                  />
                  {searching ? (
                    <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-subtle" />
                  ) : null}
                </div>

                {hasMore && !useRemote ? (
                  <p className="text-xs text-muted">
                    Tu espacio tiene más alumnos de los que caben aquí. Escribe para buscarlos a todos.
                  </p>
                ) : null}
                {searchError ? (
                  <p className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                    {searchError}
                  </p>
                ) : null}

                <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
                  {filtered.map((entry) => (
                    <li key={entry.clientId}>
                      <button
                        type="button"
                        onClick={() => choose(entry.clientId)}
                        className="flex w-full items-center gap-3 rounded-control border border-border-default bg-surface-card px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-surface-sunken"
                      >
                        <span className="min-w-0 flex-1 truncate font-semibold text-strong">
                          {entry.clientName}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-muted">
                          <FilePlus2 className="h-3 w-3" />
                          {planCtaLabel(entry.planStatus)}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 && !searching ? (
                    <li className="px-1 py-6 text-center text-sm text-muted">
                      {searchError ? 'No pudimos completar la búsqueda.' : 'Sin coincidencias.'}
                    </li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
