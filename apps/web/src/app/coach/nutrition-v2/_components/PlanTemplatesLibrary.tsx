'use client'

/**
 * Biblioteca de plantillas del Centro V2 (F3 — specs/nutrition-plan-templates-v2).
 *
 * Es el destino del rescate de las 33 plantillas que quedaron atrapadas en V1 y la unica
 * pantalla donde el coach administra su material reutilizable: renombrar, marcar favorita,
 * eliminar (soft-delete) y crear una plantilla nueva a partir del plan de un alumno.
 *
 * Aplicar una plantilla NO se hace desde aca sino desde el `+` del hub: hay UNA sola puerta al
 * builder (`?from=template:<id>`), y duplicarla seria el primer paso para que los dos caminos
 * diverjan.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, Loader2, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { searchCoachRosterAction, type RosterSearchEntry } from '../_actions/roster-search.actions'
import {
  deletePlanTemplateAction,
  listPlanTemplatesAction,
  renamePlanTemplateAction,
  setPlanTemplateFavoriteAction,
} from '../_actions/plan-templates.actions'
import type { PlanTemplateListItem } from '@/services/nutrition-v2/plan-templates.service'

/**
 * Builder de plantillas SIN alumno (CEO 2026-08-04). Es la puerta que faltaba: hasta ahora la
 * unica alta era "desde el plan de un alumno", asi que un coach sin alumnos —o que queria
 * material generico— no podia crear ni una.
 */
const TEMPLATE_BUILDER_HREF = '/coach/nutrition-v2/plantillas/builder'

function editTemplateHref(templateId: string): string {
  return `${TEMPLATE_BUILDER_HREF}?template=${templateId}`
}

function summaryLine(template: PlanTemplateListItem): string {
  if (!template.readable) return 'No se puede abrir: se guardó con una versión anterior.'
  const parts = [
    template.summary?.calories ? `${template.summary.calories} kcal` : null,
    template.summary?.mealSlotCount ? `${template.summary.mealSlotCount} franjas` : null,
    template.summary?.dayVariantCount && template.summary.dayVariantCount > 1
      ? `${template.summary.dayVariantCount} días`
      : null,
    template.summary?.hasPortions ? 'con porciones' : null,
    template.usageCount > 0 ? `usada ${template.usageCount}×` : null,
    template.source === 'import_v1' ? 'rescatada de la versión anterior' : null,
  ].filter(Boolean)
  return parts.join(' · ') || 'Plantilla'
}

export function PlanTemplatesLibrary() {
  const [templates, setTemplates] = useState<PlanTemplateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<PlanTemplateListItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await listPlanTemplatesAction()
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setTemplates(result.templates)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleFavorite(template: PlanTemplateListItem) {
    const result = await setPlanTemplateFavoriteAction({
      id: template.id,
      isFavorite: !template.isFavorite,
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    void load()
  }

  async function remove(template: PlanTemplateListItem) {
    const result = await deletePlanTemplateAction({ id: template.id })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Plantilla eliminada')
    void load()
  }

  return (
    <section className="space-y-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Arma un plan reutilizable y aplícalo a cualquier alumno desde «Nuevo plan →
          Reutilizar».
        </p>
        {/* Dos altas, la de cero como primaria: crear desde el plan de un alumno exige tener
            alumnos CON plan, así que no puede ser la única puerta. `flex-1` en ambos para que
            el par no desborde en 360 px (dos w-full en una fila desbordan). */}
        <div className="flex items-center gap-2">
          <Link
            href={TEMPLATE_BUILDER_HREF}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 sm:flex-none"
          >
            <Plus className="size-4 shrink-0" />
            Nueva plantilla
          </Link>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken sm:flex-none"
          >
            <Users className="size-4 shrink-0" />
            Desde un alumno
          </button>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Cargando plantillas…
        </p>
      ) : error ? (
        <p className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : templates.length === 0 ? (
        <div className="rounded-control border border-border-subtle bg-surface-sunken px-4 py-10 text-center text-sm text-muted">
          <Copy className="mx-auto mb-2 size-7 opacity-30" />
          <p>Todavía no tienes plantillas. Arma una desde cero y aplícala al alumno que quieras.</p>
          <Link
            href={TEMPLATE_BUILDER_HREF}
            className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus className="size-4 shrink-0" />
            Nueva plantilla
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-strong">{template.name}</p>
                <p className="truncate text-xs text-muted">{summaryLine(template)}</p>
              </div>
              <button
                type="button"
                onClick={() => void toggleFavorite(template)}
                aria-label={template.isFavorite ? `Quitar ${template.name} de favoritas` : `Marcar ${template.name} como favorita`}
                aria-pressed={template.isFavorite}
                className="shrink-0 rounded-control p-2 hover:bg-surface-sunken"
              >
                <Star className={`size-4 ${template.isFavorite ? 'fill-current text-amber-500' : 'text-subtle'}`} />
              </button>
              {/* Editar el CONTENIDO en el builder. Solo si el draft guardado todavía valida:
                  una plantilla ilegible abriría un wizard en blanco y "guardar" la vaciaría. */}
              {template.readable ? (
                <Link
                  href={editTemplateHref(template.id)}
                  aria-label={`Editar ${template.name}`}
                  title="Editar plantilla"
                  className="shrink-0 rounded-control p-2 hover:bg-surface-sunken"
                >
                  <SlidersHorizontal className="size-4 text-subtle" />
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setRenaming(template)}
                aria-label={`Renombrar ${template.name}`}
                title="Renombrar"
                className="shrink-0 rounded-control p-2 hover:bg-surface-sunken"
              >
                <Pencil className="size-4 text-subtle" />
              </button>
              <button
                type="button"
                onClick={() => void remove(template)}
                aria-label={`Eliminar ${template.name}`}
                className="shrink-0 rounded-control p-2 hover:bg-surface-sunken"
              >
                <Trash2 className="size-4 text-subtle" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateFromClientDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          setCreating(false)
          void load()
        }}
      />
      <RenameDialog
        template={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={() => {
          setRenaming(null)
          void load()
        }}
      />
    </section>
  )
}

/**
 * Crear plantilla a partir del plan VIGENTE de un alumno. Todo el armado (leer el plan,
 * ensamblar el draft y quitarle la identidad) ocurre en el servidor: acá solo viajan el alumno
 * elegido y el nombre.
 */
function CreateFromClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState<RosterSearchEntry[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<RosterSearchEntry | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelected(null)
    setName('')
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open || selected) return
    setSearching(true)
    const timer = setTimeout(() => {
      void searchCoachRosterAction({ search: search.trim() || undefined, pageSize: 40 })
        .then((res) => {
          if (res.ok) setEntries(res.items.filter((entry) => entry.planStatus != null))
          else setError(res.error)
        })
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [open, search, selected])

  async function save() {
    if (!selected) return
    setSaving(true)
    // Import diferido a proposito: esa action arrastra el read-model del plan y las utilidades
    // del builder. Cargarla al montar la pestaña haria pagar ese arbol a quien solo viene a
    // mirar su biblioteca.
    const { savePlanTemplateFromClientAction } = await import(
      '../_actions/plan-templates-from-plan.actions'
    )
    const result = await savePlanTemplateFromClientAction({
      clientId: selected.clientId,
      name: name.trim() || `Plan de ${selected.clientName}`,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success('Plantilla guardada')
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-tight">Nueva plantilla</DialogTitle>
          <DialogDescription>
            {selected
              ? `Se guardará el plan vigente de ${selected.clientName}. El alumno no se entera ni se modifica.`
              : 'Elige el alumno cuyo plan quieres guardar como plantilla.'}
          </DialogDescription>
        </DialogHeader>

        {selected ? (
          <div className="mt-1 space-y-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="min-h-11 text-sm font-semibold text-muted hover:text-body"
            >
              ← Elegir otro alumno
            </button>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                Nombre de la plantilla
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 180))}
                placeholder={`Plan de ${selected.clientName}`}
                className="min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? 'Guardando…' : 'Guardar plantilla'}
            </button>
          </div>
        ) : (
          <div className="mt-1 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value.slice(0, 120))}
                placeholder="Buscar alumno con plan…"
                aria-label="Buscar alumno con plan"
                className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-10 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
              />
              {searching ? (
                <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-subtle" />
              ) : null}
            </div>
            <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
              {entries.map((entry) => (
                <li key={entry.clientId}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(entry)
                      setName(`Plan de ${entry.clientName}`)
                    }}
                    className="flex w-full items-center gap-3 rounded-control border border-border-default bg-surface-card px-3 py-2.5 text-left text-sm text-body transition-colors hover:bg-surface-sunken"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-strong">
                      {entry.clientName}
                    </span>
                  </button>
                </li>
              ))}
              {entries.length === 0 && !searching ? (
                <li className="px-1 py-6 text-center text-sm text-muted">
                  Ninguno de tus alumnos con plan coincide.
                </li>
              ) : null}
            </ul>
          </div>
        )}

        {error ? (
          <p className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RenameDialog({
  template,
  onClose,
  onRenamed,
}: {
  template: PlanTemplateListItem | null
  onClose: () => void
  onRenamed: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(template?.name ?? '')
    setError(null)
  }, [template])

  async function save() {
    if (!template) return
    setSaving(true)
    const result = await renamePlanTemplateAction({ id: template.id, name })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success('Plantilla renombrada')
    onRenamed()
  }

  return (
    <Dialog open={template != null} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-tight">Renombrar plantilla</DialogTitle>
        </DialogHeader>
        <div className="mt-1 space-y-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 180))}
            aria-label="Nombre de la plantilla"
            className="min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring md:text-sm"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Guardar
          </button>
          {error ? (
            <p className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
