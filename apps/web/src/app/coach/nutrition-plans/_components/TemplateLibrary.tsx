'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Trash2,
  CalendarHeart,
  Search,
  Utensils,
  Pencil,
  Copy,
  UserPlus,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { deleteNutritionTemplate, duplicateNutritionTemplate } from '../_actions/nutrition-coach.actions'
import { toast } from 'sonner'
import { AssignModal, type AssignModalClient, type AssignModalTemplate } from './AssignModal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type TemplateMeal = { id: string; name: string; order_index?: number | null }

export type TemplateLibraryItem = {
  id: string
  name: string
  description: string | null
  goal_type?: string | null
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  template_meals: TemplateMeal[]
  assigned_clients?: { id: string; full_name: string }[]
}

function goalLabel(goal: string | null | undefined): string | null {
  if (!goal) return null
  const g = goal.toLowerCase()
  if (g.includes('deficit') || g === 'cut') return 'Déficit'
  if (g.includes('surplus') || g.includes('bulk') || g === 'volume') return 'Volumen'
  if (g.includes('maint')) return 'Mantenimiento'
  return goal.replace(/_/g, ' ')
}

function macroCalorieSplit(calories: number, p: number, c: number, f: number) {
  const fromMacros = p * 4 + c * 4 + f * 9
  const denom = calories > 0 ? calories : fromMacros
  if (denom <= 0) return { pPct: 33, cPct: 34, fPct: 33 }
  const pPct = Math.round(((p * 4) / denom) * 100)
  const cPct = Math.round(((c * 4) / denom) * 100)
  const fPct = Math.max(0, 100 - pPct - cPct)
  return { pPct, cPct, fPct }
}

type Props = {
  templates: TemplateLibraryItem[]
  coachId: string
  clients: AssignModalClient[]
}

type TemplateSortKey = 'recent' | 'name' | 'kcalDesc' | 'kcalAsc'

const TEMPLATE_SORT_LABELS: Record<TemplateSortKey, string> = {
  recent: 'Recientes',
  name: 'Nombre',
  kcalDesc: 'Kcal ↓',
  kcalAsc: 'Kcal ↑',
}

const TEMPLATE_GOAL_OPTIONS = ['Todos', 'Déficit', 'Volumen', 'Mantenimiento'] as const

export function TemplateLibrary({ templates, coachId, clients }: Props) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [goalFilter, setGoalFilter] = useState<string>('Todos')
  const [sortBy, setSortBy] = useState<TemplateSortKey>('recent')
  const [filterOpen, setFilterOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null)
  const [assignTemplate, setAssignTemplate] = useState<AssignModalTemplate | null>(null)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)

  const filtersActive = goalFilter !== 'Todos' || sortBy !== 'recent'
  const resetFilters = () => {
    setGoalFilter('Todos')
    setSortBy('recent')
  }

  let filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )
  if (goalFilter !== 'Todos') {
    filteredTemplates = filteredTemplates.filter((t) => goalLabel(t.goal_type) === goalFilter)
  }
  if (sortBy === 'name') {
    filteredTemplates = [...filteredTemplates].sort((a, b) => a.name.localeCompare(b.name))
  } else if (sortBy === 'kcalDesc') {
    filteredTemplates = [...filteredTemplates].sort(
      (a, b) => (b.daily_calories ?? 0) - (a.daily_calories ?? 0)
    )
  } else if (sortBy === 'kcalAsc') {
    filteredTemplates = [...filteredTemplates].sort(
      (a, b) => (a.daily_calories ?? 0) - (b.daily_calories ?? 0)
    )
  }

  const runDeleteTemplate = async () => {
    if (!templateToDelete) return
    const id = templateToDelete
    setTemplateToDelete(null)
    setIsDeleting(id)
    try {
      const result = await deleteNutritionTemplate(id, coachId)
      if (result.error) toast.error(result.error)
      else toast.success('Plantilla eliminada')
    } finally {
      setIsDeleting(null)
    }
  }

  const handleDuplicate = async (id: string) => {
    setIsDuplicating(id)
    try {
      const result = await duplicateNutritionTemplate(id, coachId)
      if (result.error) toast.error(result.error)
      else toast.success('Plantilla duplicada')
    } finally {
      setIsDuplicating(null)
    }
  }

  const sortedMeals = (meals: TemplateMeal[]) =>
    [...meals].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  return (
    <div className="space-y-6">
      <AlertDialog open={templateToDelete !== null} onOpenChange={(o) => !o && setTemplateToDelete(null)}>
        <AlertDialogContent className="rounded-2xl border-border bg-card text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              No afectará planes ya asignados a alumnos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void runDeleteTemplate()}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Buscador + Filtros y orden + chips (patrón CD, espejo del board Alumnos) */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1 md:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <Input
              placeholder="Buscar plantilla…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-11 rounded-control border-default bg-surface-card pl-10 pr-10 text-base shadow-sm placeholder:text-muted md:text-sm"
              aria-label="Buscar plantilla"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpiar búsqueda"
                className="eva-press absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-surface-sunken text-[var(--text-muted)]"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="Filtros y orden"
            className="eva-press relative flex size-11 shrink-0 items-center justify-center rounded-control border-[1.5px] shadow-sm transition-colors"
            style={{
              borderColor: filtersActive ? 'var(--sport-300)' : 'var(--border-default)',
              backgroundColor: filtersActive ? 'var(--sport-100)' : 'var(--surface-card)',
              color: filtersActive ? 'var(--sport-600)' : 'var(--text-strong)',
            }}
          >
            <SlidersHorizontal className="size-[18px]" />
            {filtersActive && (
              <span
                className="absolute -right-1 -top-1 size-2.5 rounded-full border-2"
                style={{ backgroundColor: 'var(--sport-500)', borderColor: 'var(--surface-card)' }}
              />
            )}
          </button>
        </div>

        {filtersActive && (
          <div className="flex flex-wrap gap-1.5">
            {goalFilter !== 'Todos' && (
              <button
                type="button"
                onClick={() => setGoalFilter('Todos')}
                className="eva-press inline-flex h-7 items-center gap-1.5 rounded-pill pl-2.5 pr-2 text-xs font-bold"
                style={{ backgroundColor: 'var(--sport-100)', color: 'var(--sport-700)' }}
              >
                {goalFilter}
                <X className="size-3" />
              </button>
            )}
            {sortBy !== 'recent' && (
              <button
                type="button"
                onClick={() => setSortBy('recent')}
                className="eva-press inline-flex h-7 items-center gap-1.5 rounded-pill pl-2.5 pr-2 text-xs font-bold"
                style={{ backgroundColor: 'var(--sport-100)', color: 'var(--sport-700)' }}
              >
                Orden: {TEMPLATE_SORT_LABELS[sortBy]}
                <X className="size-3" />
              </button>
            )}
          </div>
        )}

        {(searchTerm.trim() || filtersActive) && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">
              {filteredTemplates.length} {filteredTemplates.length === 1 ? 'resultado' : 'resultados'}
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                resetFilters()
              }}
              className="eva-press inline-flex items-center gap-1 text-xs font-bold text-[var(--sport-600)]"
            >
              <X className="size-3" />
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Bottom-sheet de filtros/orden — 1:1 patrón CD NutriFilterSheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent
          side="bottom"
          showCloseButton
          className="max-h-[min(85dvh,520px)] rounded-t-sheet border-subtle bg-surface-card text-body shadow-lg"
        >
          <SheetHeader className="flex-row items-center justify-between border-0 bg-surface-card px-6 pt-2">
            <SheetTitle className="font-display font-extrabold normal-case tracking-[-0.02em] text-strong">
              Filtros y orden
            </SheetTitle>
            {filtersActive && (
              <button
                type="button"
                onClick={resetFilters}
                className="eva-press text-[13px] font-bold text-[var(--sport-600)]"
              >
                Restablecer
              </button>
            )}
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-2">
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted">Objetivo</span>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_GOAL_OPTIONS.map((goal) => {
                  const selected = goalFilter === goal
                  return (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => setGoalFilter(goal)}
                      className="eva-press rounded-pill border-[1.5px] px-4 py-2 text-[13px] font-semibold transition-colors"
                      style={{
                        borderColor: selected ? 'var(--sport-300)' : 'var(--border-default)',
                        backgroundColor: selected ? 'var(--sport-100)' : 'var(--surface-card)',
                        color: selected ? 'var(--sport-700)' : 'var(--text-body)',
                      }}
                    >
                      {goal}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted">Ordenar por</span>
              <div className="flex flex-wrap gap-2">
                {(['recent', 'name', 'kcalDesc', 'kcalAsc'] as const).map((key) => {
                  const selected = sortBy === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortBy(key)}
                      className="eva-press rounded-pill border-[1.5px] px-4 py-2 text-[13px] font-semibold transition-colors"
                      style={{
                        borderColor: selected ? 'var(--sport-300)' : 'var(--border-default)',
                        backgroundColor: selected ? 'var(--sport-100)' : 'var(--surface-card)',
                        color: selected ? 'var(--sport-700)' : 'var(--text-body)',
                      }}
                    >
                      {TEMPLATE_SORT_LABELS[key]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <SheetFooter className="border-subtle bg-surface-card">
            <Button type="button" variant="sport" className="w-full" onClick={() => setFilterOpen(false)}>
              Ver resultados
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {filteredTemplates.length === 0 ? (
        <div className="text-center py-16 px-6 flex flex-col items-center rounded-card border border-dashed border-[var(--border-default)] bg-surface-card">
          <div className="w-[58px] h-[58px] rounded-lg bg-[var(--sport-100)] text-[var(--sport-600)] flex items-center justify-center mb-3.5">
            <CalendarHeart className="w-7 h-7" />
          </div>
          {searchTerm.trim() || filtersActive ? (
            <>
              <h3 className="text-[16.5px] font-extrabold font-display text-[var(--text-strong)]">Sin plantillas</h3>
              <p className="text-[13px] text-[var(--text-muted)] max-w-[252px] mx-auto mt-1.5 leading-snug">
                {searchTerm.trim()
                  ? `Ninguna plantilla coincide con «${searchTerm.trim()}».`
                  : 'Ninguna plantilla con ese filtro. Probá quitarlo.'}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-[16.5px] font-extrabold font-display text-[var(--text-strong)]">Sin plantillas todavía</h3>
              <p className="text-[13px] text-[var(--text-muted)] max-w-[252px] mx-auto mt-1.5 leading-snug">
                Creá una plantilla de comidas reutilizable y asignala a tus alumnos en segundos.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template) => {
            const kcal = template.daily_calories ?? 0
            const p = template.protein_g ?? 0
            const c = template.carbs_g ?? 0
            const f = template.fats_g ?? 0
            const split = macroCalorieSplit(kcal, p, c, f)
            const goal = goalLabel(template.goal_type)
            const meals = sortedMeals(template.template_meals ?? [])
            const assigned = template.assigned_clients ?? []

            return (
              <Card
                key={template.id}
                className="overflow-hidden bg-surface-card backdrop-blur-sm transition-all duration-300 rounded-card border-[var(--border-subtle)] hover:border-[color:var(--ember-300)]"
              >
                <CardContent className="p-5 border border-transparent rounded-card h-full flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 space-y-1.5">
                      {goal && (
                        <Badge tone="neutral" variant="soft" size="sm" className="uppercase tracking-wide">
                          {goal}
                        </Badge>
                      )}
                      <h3 className="font-bold text-lg truncate text-[var(--text-strong)]">{template.name}</h3>
                      {template.description && (
                        <p className="text-sm text-[var(--text-muted)] line-clamp-2">{template.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-black text-[19px] leading-none text-[var(--text-strong)] tabular-nums tracking-tight">
                        {kcal.toLocaleString('es')}
                      </p>
                      <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-0.5">kcal</p>
                    </div>
                  </div>

                  {kcal > 0 && (
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-sunken">
                      <div className="h-full bg-[var(--ember-500)]" style={{ width: `${split.pPct}%` }} />
                      <div className="h-full bg-[var(--sport-600)]" style={{ width: `${split.cPct}%` }} />
                      <div className="h-full bg-[var(--aqua-500)]" style={{ width: `${split.fPct}%` }} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[var(--ember-500)]">●</span> P {p}g · {split.pPct}%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[var(--sport-600)]">●</span> C {c}g · {split.cPct}%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[var(--aqua-500)]">●</span> G {f}g · {split.fPct}%
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {meals.slice(0, 8).map((m) => (
                      <span
                        key={m.id}
                        className="text-[11px] font-semibold text-[var(--text-body)] bg-surface-sunken px-2 py-0.5 rounded-[var(--radius-xs)]"
                      >
                        {m.name}
                      </span>
                    ))}
                    {meals.length > 8 && (
                      <span className="text-[11px] font-bold text-[var(--text-subtle)] px-1 py-0.5">
                        +{meals.length - 8}
                      </span>
                    )}
                    {meals.length === 0 && (
                      <span className="text-xs text-[var(--text-muted)]">Sin comidas en la plantilla</span>
                    )}
                  </div>

                  {/* Footer de acciones — flex-wrap + cluster de botones agrupado (shrink-0):
                      en anchos intermedios (~880-1050px, 2 columnas) el cluster cae a su propia
                      línea en vez de desbordar la card (Asignar recortado en el borde) */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pt-3 border-t border-[var(--border-subtle)] mt-auto">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-subtle)] mr-auto">
                      <Utensils className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">{meals.length} comidas</span>
                      {assigned.length > 0 && (
                        <Badge tone="sport" variant="soft" size="sm" className="ml-1 shrink-0">
                          {assigned.length} activos
                        </Badge>
                      )}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => router.push(`/coach/nutrition-plans/${template.id}/edit`)}
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => handleDuplicate(template.id)}
                        disabled={isDuplicating === template.id}
                        title="Duplicar"
                        aria-label="Duplicar"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        onClick={() => setTemplateToDelete(template.id)}
                        disabled={isDeleting === template.id}
                        title="Eliminar"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        style={{ backgroundColor: 'var(--theme-primary)', color: 'white' }}
                        className="font-black uppercase tracking-widest text-[10px]"
                        onClick={() => setAssignTemplate({
                          id: template.id,
                          name: template.name,
                          assigned_client_ids: template.assigned_clients?.map((c) => c.id) ?? [],
                        })}
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1" />
                        Asignar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AssignModal
        open={!!assignTemplate}
        onOpenChange={(o) => !o && setAssignTemplate(null)}
        template={assignTemplate}
        coachId={coachId}
        clients={clients}
        onAssigned={() => router.refresh()}
      />
    </div>
  )
}
