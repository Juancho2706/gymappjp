'use client'

import { useId, useMemo, useRef, useState, useTransition } from 'react'
import { AlertTriangle, Check, CheckCircle2, Loader2, Search, UserPlus, Users, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { assignPlanToClientsAction } from '../_actions/nutrition-assign.actions'
import type { AssignClientResult, AssignSummary } from '../_lib/assign-plan'

// "Asignar este plan a otros alumnos" (web coach). Isla cliente montada en la ficha V2 cuando
// hay plan publicado: abre un dialogo con el roster del workspace (buscable, checkboxes, con
// insignia para quienes YA tienen plan) + fecha de vigencia, y al confirmar muestra el reporte
// por alumno (ok/fallo con motivo). useTransition + doble-submit bloqueado. La barrera real es
// server-side (assignPlanToClientsAction); esta UI solo espeja.

export interface AssignRosterEntry {
  clientId: string
  clientName: string
  hasPlan: boolean
}

function genOperationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'op-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function AssignPlanToClientsDialog({
  sourceClientId,
  sourcePlanVersion,
  sourcePlanName,
  roster,
  today,
}: {
  sourceClientId: string
  sourcePlanVersion: number
  sourcePlanName: string
  roster: AssignRosterEntry[]
  today: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [results, setResults] = useState<{ items: AssignClientResult[]; summary: AssignSummary } | null>(null)
  const [topError, setTopError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const operationId = useRef(genOperationId())
  const searchId = useId()
  const dateId = useId()

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of roster) map.set(entry.clientId, entry.clientName)
    return map
  }, [roster])

  const filtered = useMemo(() => {
    const needle = normalize(search)
    if (needle.length === 0) return roster
    return roster.filter((entry) => normalize(entry.clientName).includes(needle))
  }, [roster, search])

  function resetForNewRun() {
    operationId.current = genOperationId()
    setSelected(new Set())
    setSearch('')
    setEffectiveFrom(today)
    setResults(null)
    setTopError(null)
  }

  function onOpenChange(next: boolean) {
    if (isPending) return
    if (next) resetForNewRun()
    setOpen(next)
  }

  function toggle(clientId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  function handleConfirm() {
    if (selected.size === 0 || isPending) return
    setTopError(null)
    const targetClientIds = [...selected]
    startTransition(async () => {
      const res = await assignPlanToClientsAction({
        sourceClientId,
        sourcePlanVersion,
        targetClientIds,
        effectiveFrom,
        operationId: operationId.current,
      })
      if (res.ok) {
        setResults({ items: res.results, summary: res.summary })
      } else {
        setTopError(res.error)
      }
    })
  }

  const selectAllVisible = () => setSelected(new Set(filtered.map((entry) => entry.clientId)))
  const clearSelection = () => setSelected(new Set())

  return (
    <>
      {/* Trigger secundario compacto: vive junto a los badges del plan en la ficha,
          no en el header (alli manda la CTA primaria "Nueva version"). */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-border-subtle bg-surface-card px-3 text-xs font-semibold text-body transition-colors hover:bg-surface-sunken hover:text-strong"
      >
        <UserPlus className="h-3.5 w-3.5 text-primary dark:text-primary" />
        Asignar a otros alumnos
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="normal-case tracking-tight">Asignar plan a otros alumnos</DialogTitle>
            <DialogDescription>
              Se copiara la estructura de <span className="font-semibold text-strong">{sourcePlanName}</span> a los
              alumnos que elijas. A quienes ya tengan un plan se les creara una nueva version vigente.
            </DialogDescription>
          </DialogHeader>

          {results ? (
            <div className="mt-1 space-y-3">
              <div className="rounded-control border border-border-subtle bg-surface-sunken p-3 text-sm text-body">
                <span className="font-semibold text-strong">{results.summary.succeeded}</span> asignado
                {results.summary.succeeded === 1 ? '' : 's'}
                {results.summary.failed > 0 ? (
                  <>
                    {' '}· <span className="font-semibold text-strong">{results.summary.failed}</span> con problemas
                  </>
                ) : null}
                {' '}de {results.summary.total}.
              </div>
              <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
                {results.items.map((item) => (
                  <li
                    key={item.clientId}
                    className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-sm"
                  >
                    {item.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <span className="min-w-0">
                      <span className="font-semibold text-strong">
                        {nameById.get(item.clientId) ?? 'Alumno'}
                      </span>
                      {!item.ok && item.error ? (
                        <span className="block text-xs text-muted">{item.error}</span>
                      ) : (
                        <span className="block text-xs text-muted">Nueva version publicada.</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => resetForNewRun()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken"
                >
                  Asignar a otros
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white hover:bg-primary/90"
                >
                  Listo
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 space-y-4">
              {roster.length === 0 ? (
                <div className="rounded-control border border-border-subtle bg-surface-sunken px-4 py-8 text-center text-sm text-muted">
                  <Users className="mx-auto mb-2 h-7 w-7 opacity-30" />
                  No hay otros alumnos en tu espacio para asignar este plan.
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
                      className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-4 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                    </span>
                    <span className="flex gap-2">
                      <button type="button" onClick={selectAllVisible} className="font-semibold text-primary hover:underline dark:text-primary">
                        Seleccionar visibles
                      </button>
                      {selected.size > 0 ? (
                        <button type="button" onClick={clearSelection} className="font-semibold text-muted hover:text-strong">
                          Limpiar
                        </button>
                      ) : null}
                    </span>
                  </div>

                  <ul className="max-h-[38vh] space-y-1.5 overflow-y-auto pr-1">
                    {filtered.map((entry) => {
                      const isSelected = selected.has(entry.clientId)
                      const cbId = `${searchId}-${entry.clientId}`
                      return (
                        <li key={entry.clientId}>
                          <label
                            htmlFor={cbId}
                            className={
                              'flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors ' +
                              (isSelected
                                ? 'border-primary/50 bg-primary/10 text-strong dark:border-primary/40 dark:bg-primary/10'
                                : 'border-border-default bg-surface-card text-body hover:bg-surface-sunken')
                            }
                          >
                            <input
                              id={cbId}
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(entry.clientId)}
                              className="h-4 w-4 shrink-0 rounded border-border-default accent-[var(--theme-primary)]"
                            />
                            <span className="min-w-0 flex-1 truncate font-semibold">{entry.clientName}</span>
                            {entry.hasPlan ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3" />
                                Ya tiene plan
                              </span>
                            ) : null}
                            {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary dark:text-primary" /> : null}
                          </label>
                        </li>
                      )
                    })}
                    {filtered.length === 0 ? (
                      <li className="px-1 py-6 text-center text-sm text-muted">Sin coincidencias.</li>
                    ) : null}
                  </ul>

                  <div className="border-t border-border-subtle pt-3">
                    <label htmlFor={dateId} className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Vigente desde
                    </label>
                    <input
                      id={dateId}
                      type="date"
                      value={effectiveFrom}
                      onChange={(event) => setEffectiveFrom(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="mt-1 text-xs text-muted">
                      Para quienes ya tienen plan, la fecha debe ser posterior a la de su version vigente.
                    </p>
                  </div>

                  {topError ? (
                    <p className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                      {topError}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={selected.size === 0 || isPending}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {isPending
                      ? 'Asignando…'
                      : selected.size === 0
                        ? 'Selecciona alumnos'
                        : `Asignar a ${selected.size} alumno${selected.size === 1 ? '' : 's'}`}
                  </button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
