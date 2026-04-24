'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClampedIntInput } from '@/components/ui/clamped-int-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { AlertTriangle, Zap } from 'lucide-react'

interface Goals {
  calories: number
  protein: number
  carbs: number
  fats: number
}

interface Props {
  planName: string
  onNameChange: (v: string) => void
  goals: Goals
  onGoalsChange: (g: Goals) => void
  realTotals: Goals
  onAutoSync: () => void
  autoSync: boolean
  onAutoSyncToggle: (v: boolean) => void
  instructions: string
  onInstructionsChange: (v: string) => void
  isSaving: boolean
  onSave: () => void
  mode: 'template' | 'client-plan'
}

function overMacroMismatch(real: number, target: number) {
  if (target <= 0) return false
  return Math.abs((real - target) / target) * 100 > 5
}

export function PlanBuilderSidebar({
  planName,
  onNameChange,
  goals,
  onGoalsChange,
  realTotals,
  onAutoSync,
  autoSync,
  onAutoSyncToggle,
  instructions,
  onInstructionsChange,
  isSaving,
  onSave,
  mode,
}: Props) {
  const mismatch = useMemo(
    () =>
      overMacroMismatch(realTotals.calories, goals.calories) ||
      overMacroMismatch(realTotals.protein, goals.protein) ||
      overMacroMismatch(realTotals.carbs, goals.carbs) ||
      overMacroMismatch(realTotals.fats, goals.fats),
    [realTotals, goals]
  )

  const kcalPct =
    goals.calories > 0 ? Math.min(100, (realTotals.calories / goals.calories) * 100) : 0

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div>
        <Label className="text-xs font-bold uppercase text-muted-foreground">
          {mode === 'template' ? 'Nombre de la plantilla' : 'Nombre del plan'}
        </Label>
        <Input value={planName} onChange={(e) => onNameChange(e.target.value)} className="mt-1 h-11 font-bold" />
      </div>

      <div className="space-y-3">
        {/* Header with toggle */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Metas {autoSync ? '' : '(manual)'}
          </p>
          <label className="flex cursor-pointer items-center gap-2">
            <span className={cn(
              'flex items-center gap-1 text-[10px] font-bold transition-colors',
              autoSync ? 'text-emerald-500' : 'text-muted-foreground'
            )}>
              <Zap className={cn('h-3 w-3', autoSync && 'fill-emerald-500')} />
              Auto
            </span>
            <Switch
              checked={autoSync}
              onCheckedChange={(checked) => {
                onAutoSyncToggle(checked)
                if (checked) onAutoSync()
              }}
              size="sm"
            />
          </label>
        </div>

        {autoSync && (
          <p className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
            Calculando metas en tiempo real desde los alimentos añadidos.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['kcal', 'calories', goals.calories],
              ['Proteína (g)', 'protein', goals.protein],
              ['Carbos (g)', 'carbs', goals.carbs],
              ['Grasas (g)', 'fats', goals.fats],
            ] as const
          ).map(([label, key, val]) => (
            <div key={key}>
              <Label className="text-[10px] text-muted-foreground">{label}</Label>
              <ClampedIntInput
                className={cn('h-9 mt-0.5 transition-opacity', autoSync && 'opacity-50 pointer-events-none')}
                value={val}
                min={0}
                max={key === 'calories' ? 50000 : 10000}
                onValueChange={(n) =>
                  !autoSync && onGoalsChange({ ...goals, [key]: n })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2">
        <div className="flex justify-between text-xs font-bold">
          <span className="text-muted-foreground">Suma real (alimentos)</span>
          <span className="tabular-nums">
            {Math.round(realTotals.calories)} / {goals.calories || '—'} kcal
          </span>
        </div>
        <Progress value={Math.min(kcalPct, 100)} className="h-2" />
        <div className="grid grid-cols-3 gap-1 text-[10px] tabular-nums text-muted-foreground">
          <span>P {Math.round(realTotals.protein)}</span>
          <span>C {Math.round(realTotals.carbs)}</span>
          <span>G {Math.round(realTotals.fats)}</span>
        </div>
      </div>

      {mismatch && !autoSync && (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-2">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Los macros reales difieren más de un 5% de la meta.
            </p>
            <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={onAutoSync}>
              Sincronizar metas con lo calculado
            </Button>
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs font-bold uppercase text-muted-foreground">Indicaciones</Label>
        <Textarea
          value={instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          rows={4}
          className="mt-1 resize-none"
          placeholder="Opcional: notas para el alumno…"
        />
      </div>

      <Button
        type="button"
        className={cn('w-full h-11 font-bold')}
        style={{ backgroundColor: 'var(--theme-primary)' }}
        disabled={isSaving || !planName.trim()}
        onClick={onSave}
      >
        {isSaving ? 'Guardando…' : 'Guardar'}
      </Button>
    </div>
  )
}
