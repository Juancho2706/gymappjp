'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, History, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { GlassCard } from '@/components/ui/glass-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'
import type { NutritionPlanCycleUpsertInput } from '@/lib/nutrition-plan-cycle-schema'
import type { NutritionCycleBlock } from '@/lib/nutrition-plan-cycle-resolver'
import { resolveNutritionCycleBlockForDate } from '@/lib/nutrition-plan-cycle-resolver'
import {
  restoreClientNutritionPlanFromHistory,
  upsertNutritionPlanCycle,
} from '@/app/coach/nutrition-plans/_actions/nutrition-coach.actions'

export type NutritionCycleRow = {
  id: string
  name: string
  start_date: string
  blocks: unknown
  is_active: boolean
  created_at: string
}

export type NutritionHistoryEntryLite = {
  id: string
  created_at: string
  label: string | null
}

type Props = {
  coachId: string
  clientId: string
  planId: string | undefined
  santiagoTodayIso: string
  activeCycle: NutritionCycleRow | null
  templates: { id: string; name: string }[]
  historyEntries: NutritionHistoryEntryLite[]
}

function parseBlocks(raw: unknown): NutritionCycleBlock[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (b): b is NutritionCycleBlock =>
      b != null &&
      typeof b === 'object' &&
      typeof (b as NutritionCycleBlock).week_start === 'number' &&
      typeof (b as NutritionCycleBlock).week_end === 'number' &&
      typeof (b as NutritionCycleBlock).template_id === 'string' &&
      typeof (b as NutritionCycleBlock).label === 'string'
  )
}

function defaultBlocks(templates: { id: string; name: string }[]): NutritionCycleBlock[] {
  const tid = templates[0]?.id ?? ''
  return [{ week_start: 1, week_end: 2, template_id: tid, label: templates[0]?.name?.slice(0, 80) || 'Fase 1' }]
}

export function NutritionCycleHistorySection({
  coachId,
  clientId,
  planId,
  santiagoTodayIso,
  activeCycle,
  templates,
  historyEntries,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [cycleOpen, setCycleOpen] = useState(false)
  const [historyRestoreId, setHistoryRestoreId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formStart, setFormStart] = useState('')
  const [formBlocks, setFormBlocks] = useState<NutritionCycleBlock[]>([])

  useEffect(() => {
    if (!cycleOpen) return
    if (activeCycle) {
      setFormName(activeCycle.name)
      setFormStart(activeCycle.start_date)
      const parsed = parseBlocks(activeCycle.blocks)
      setFormBlocks(parsed.length > 0 ? parsed : defaultBlocks(templates))
    } else {
      setFormName('Ciclo principal')
      setFormStart(santiagoTodayIso || '')
      setFormBlocks(defaultBlocks(templates))
    }
  }, [cycleOpen, activeCycle, santiagoTodayIso, templates])

  const cyclePreview = useMemo(() => {
    if (!activeCycle || !santiagoTodayIso) return null
    const blocks = parseBlocks(activeCycle.blocks)
    const { weekIndex, block } = resolveNutritionCycleBlockForDate(
      activeCycle.start_date,
      blocks,
      santiagoTodayIso
    )
    return { weekIndex, block }
  }, [activeCycle, santiagoTodayIso])

  const saveCycle = () => {
    if (!coachId || templates.length === 0) {
      toast.error('Necesitas al menos una plantilla para armar bloques.')
      return
    }
    const payload: NutritionPlanCycleUpsertInput = {
      id: activeCycle?.id,
      name: formName.trim(),
      start_date: formStart,
      blocks: formBlocks.map((b) => ({
        ...b,
        template_id: b.template_id || templates[0]!.id,
      })),
      is_active: true,
    }
    startTransition(async () => {
      const res = await upsertNutritionPlanCycle(coachId, clientId, payload)
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo guardar')
        return
      }
      toast.success('Ciclo guardado')
      setCycleOpen(false)
      router.refresh()
    })
  }

  const addBlockRow = () => {
    setFormBlocks((prev) => [
      ...prev,
      {
        week_start: (prev[prev.length - 1]?.week_end ?? 0) + 1,
        week_end: (prev[prev.length - 1]?.week_end ?? 0) + 2,
        template_id: templates[0]?.id ?? '',
        label: `Fase ${prev.length + 1}`,
      },
    ])
  }

  const removeBlockRow = (i: number) => {
    setFormBlocks((prev) => prev.filter((_, idx) => idx !== i))
  }

  const restore = () => {
    if (!historyRestoreId) return
    startTransition(async () => {
      const res = await restoreClientNutritionPlanFromHistory(coachId, clientId, historyRestoreId)
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo restaurar')
        return
      }
      toast.success('Plan restaurado desde el historial')
      setHistoryRestoreId(null)
      router.refresh()
    })
  }

  if (!planId) return null

  return (
    <>
      <GlassCard className="border-border/40 p-4 dark:border-white/10">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Ciclo de dieta</h3>
              <InfoTooltip content="Define bloques de semanas vinculados a plantillas. La rotación automática al cambiar de semana se activará con el job programado (próximo paso DevOps)." />
            </div>
            <p className="text-[11px] text-muted-foreground max-w-xl">
              Vista previa de en qué bloque va el alumno según la fecha de inicio del ciclo y el calendario.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 text-[10px] font-black uppercase"
            disabled={templates.length === 0 || pending}
            onClick={() => setCycleOpen(true)}
          >
            {activeCycle ? 'Editar ciclo' : 'Definir ciclo'}
          </Button>
        </div>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Crea una plantilla en Nutrición para poder definir ciclos.</p>
        ) : activeCycle ? (
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-sm">
            <p className="font-bold text-foreground">{activeCycle.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Inicio: {activeCycle.start_date}
              {cyclePreview && cyclePreview.weekIndex > 0 ? (
                <>
                  {' · '}
                  Semana {cyclePreview.weekIndex} del ciclo
                  {cyclePreview.block ? (
                    <span className="text-foreground font-semibold">
                      {' '}
                      → {cyclePreview.block.label} (plantilla en bloque)
                    </span>
                  ) : (
                    <span className="text-amber-600 font-medium"> → sin bloque para esta semana (revisa rangos)</span>
                  )}
                </>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin ciclo activo. Puedes definir uno para documentar fases.</p>
        )}

        {historyEntries.length > 0 && (
          <div className="mt-5 border-t border-border/40 pt-4">
            <div className="mb-2 flex items-center gap-1.5">
              <History className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Historial del plan (autosave)
              </h4>
              <InfoTooltip content="Cada vez que guardas el plan del alumno, se guarda una copia antes del cambio. Restaurar reaplica comidas y metas; los logs de adherencia existentes se conservan." />
            </div>
            <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
              {historyEntries.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/60 px-2 py-1.5"
                >
                  <span className="tabular-nums text-muted-foreground">
                    {h.label ?? new Date(h.created_at).toLocaleString('es-CL')}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] font-bold uppercase"
                    disabled={pending}
                    onClick={() => setHistoryRestoreId(h.id)}
                  >
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </GlassCard>

      <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
        <DialogContent className="max-h-[min(90dvh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase">
              {activeCycle ? 'Editar ciclo' : 'Nuevo ciclo'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Nombre</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Fecha inicio</Label>
              <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Bloques (semanas)</Label>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-[10px]" onClick={addBlockRow}>
                  <Plus className="h-3 w-3" /> Fila
                </Button>
              </div>
              <div className="space-y-3">
                {formBlocks.map((b, i) => (
                  <div
                    key={i}
                    className={cn('grid gap-2 rounded-lg border border-border/40 p-3 sm:grid-cols-2')}
                  >
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">Semanas</span>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={1}
                          className="h-9"
                          value={b.week_start}
                          onChange={(e) =>
                            setFormBlocks((prev) =>
                              prev.map((row, j) =>
                                j === i ? { ...row, week_start: Number(e.target.value) || 1 } : row
                              )
                            )
                          }
                        />
                        <Input
                          type="number"
                          min={1}
                          className="h-9"
                          value={b.week_end}
                          onChange={(e) =>
                            setFormBlocks((prev) =>
                              prev.map((row, j) =>
                                j === i ? { ...row, week_end: Number(e.target.value) || 1 } : row
                              )
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">Etiqueta</span>
                      <Input
                        className="h-9"
                        value={b.label}
                        onChange={(e) =>
                          setFormBlocks((prev) =>
                            prev.map((row, j) => (j === i ? { ...row, label: e.target.value } : row))
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">Plantilla</span>
                      <Select
                        value={b.template_id}
                        onValueChange={(v) => {
                          if (!v) return
                          setFormBlocks((prev) =>
                            prev.map((row, j) => (j === i ? { ...row, template_id: v } : row))
                          )
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Plantilla…" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive gap-1"
                        disabled={formBlocks.length <= 1}
                        onClick={() => removeBlockRow(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Quitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Button type="button" className="w-full h-10 font-bold" disabled={pending} onClick={saveCycle}>
              {pending ? 'Guardando…' : 'Guardar ciclo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!historyRestoreId} onOpenChange={(o) => !o && setHistoryRestoreId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar esta versión?</AlertDialogTitle>
            <AlertDialogDescription>
              Se sobrescribirá el plan actual con el snapshot guardado. Se creará otra entrada en el historial con el
              estado previo a restaurar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button type="button" disabled={pending} onClick={restore}>
              Restaurar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
