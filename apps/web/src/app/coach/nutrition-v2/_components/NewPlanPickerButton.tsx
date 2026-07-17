'use client'

import { useMemo, useState, useId } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, FilePlus2, Plus, Search, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { filterPickerEntries, planCtaLabel } from '../_lib/hub-roster'

// CTA global "Nuevo plan" del Centro V2. El hub no tiene un alumno seleccionado, asi que el
// boton abre un selector con el roster del workspace (buscable) y, al elegir, navega al builder
// del alumno (/coach/nutrition-v2/[clientId]/builder). Isla cliente delgada: recibe el roster
// ya cargado por el RSC y filtra client-side (mismo criterio tolerante a acentos del hub).

export interface NewPlanPickerEntry {
  clientId: string
  clientName: string
  /** planStatus del hub: gobierna el label "Crear plan" vs "Nueva version". */
  planStatus: string | null
}

export function NewPlanPickerButton({ roster }: { roster: NewPlanPickerEntry[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchId = useId()

  const filtered = useMemo(() => filterPickerEntries(roster, search), [roster, search])

  function onOpenChange(next: boolean) {
    if (next) setSearch('')
    setOpen(next)
  }

  function choose(clientId: string) {
    setOpen(false)
    router.push(`/coach/nutrition-v2/${clientId}/builder`)
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
              Elige el alumno para abrir su builder y crear (o versionar) su plan.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 space-y-4">
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
                    className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-4 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
                  />
                </div>

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
                  {filtered.length === 0 ? (
                    <li className="px-1 py-6 text-center text-sm text-muted">Sin coincidencias.</li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
