'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Trash2,
  CalendarHeart,
  Search,
  Users,
  Utensils,
  Pencil,
  Copy,
  Eye,
  UserPlus,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { deleteNutritionTemplate, duplicateNutritionTemplate } from '../_actions/nutrition-coach.actions'
import { toast } from 'sonner'
import Link from 'next/link'
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

export function TemplateLibrary({ templates, coachId, clients }: Props) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null)
  const [assignTemplate, setAssignTemplate] = useState<AssignModalTemplate | null>(null)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

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
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar plantillas…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-11 rounded-xl bg-white dark:bg-card border-slate-200 dark:border-border/60 text-slate-900 dark:text-foreground"
          />
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="text-center py-20 bg-blue-50/30 dark:bg-blue-950/20 border border-dashed border-blue-200 dark:border-blue-900/50 rounded-2xl">
          <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <CalendarHeart className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold">Crea tu primera plantilla</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mt-1">
            Así podrás asignar protocolos a tus alumnos en segundos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                className="overflow-hidden bg-card/50 backdrop-blur-sm transition-all duration-300 rounded-2xl border-border/50"
                style={{ '--hover-border': 'var(--theme-primary)' } as React.CSSProperties}
              >
                <CardContent className="p-5 border border-transparent rounded-2xl h-full flex flex-col gap-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {goal && (
                          <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest">
                            {goal}
                          </Badge>
                        )}
                        <h3 className="font-bold text-lg truncate">{template.name}</h3>
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                        onClick={() => router.push(`/coach/nutrition-plans/${template.id}/edit`)}
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                        onClick={() => handleDuplicate(template.id)}
                        disabled={isDuplicating === template.id}
                        title="Duplicar"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => setTemplateToDelete(template.id)}
                        disabled={isDeleting === template.id}
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-2 text-center">
                      <p className="text-[9px] font-bold text-orange-600 dark:text-orange-400 uppercase">Kcal</p>
                      <p className="text-sm font-bold tabular-nums">{kcal}</p>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
                      <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase">P</p>
                      <p className="text-sm font-bold tabular-nums">{p}g</p>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                      <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">C</p>
                      <p className="text-sm font-bold tabular-nums">{c}g</p>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 text-center">
                      <p className="text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase">G</p>
                      <p className="text-sm font-bold tabular-nums">{f}g</p>
                    </div>
                  </div>

                  {kcal > 0 && (
                    <div className="h-2 rounded-full overflow-hidden flex bg-muted/60">
                      <div className="h-full bg-blue-500/80" style={{ width: `${split.pPct}%` }} />
                      <div className="h-full bg-emerald-500/80" style={{ width: `${split.cPct}%` }} />
                      <div className="h-full bg-purple-500/80" style={{ width: `${split.fPct}%` }} />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {meals.slice(0, 8).map((m) => (
                      <Badge key={m.id} variant="outline" className="text-[10px] font-medium rounded-lg">
                        {m.name}
                      </Badge>
                    ))}
                    {meals.length > 8 && (
                      <Badge variant="outline" className="text-[10px] rounded-lg">
                        +{meals.length - 8}
                      </Badge>
                    )}
                    {meals.length === 0 && (
                      <span className="text-xs text-muted-foreground">Sin comidas en la plantilla</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50 mt-auto">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Utensils className="w-3.5 h-3.5" />
                      <span>{meals.length} comidas</span>
                      {assigned.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold text-[10px] uppercase tracking-widest">
                          <Users className="w-3 h-3" />
                          {assigned.length} activos
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-9 text-[10px] font-black uppercase tracking-widest"
                        style={{ backgroundColor: 'var(--theme-primary)', color: 'white' }}
                        onClick={() => setAssignTemplate({ id: template.id, name: template.name })}
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1" />
                        Asignar
                      </Button>
                      <Link
                        href={`/coach/nutrition-plans/${template.id}/edit`}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                          className: 'h-9 text-[10px] font-black uppercase tracking-widest inline-flex',
                        })}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Ver plan
                      </Link>
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
