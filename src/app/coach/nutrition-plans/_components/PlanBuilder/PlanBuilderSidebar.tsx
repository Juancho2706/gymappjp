'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClampedIntInput } from '@/components/ui/clamped-int-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'
import { AlertTriangle, ChevronDown, ChevronUp, Sparkles, Zap } from 'lucide-react'

interface Goals {
  calories: number
  protein: number
  carbs: number
  fats: number
}

export interface ClientProfileHint {
  weight_kg?: number | null
  height_cm?: number | null
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
  clientProfile?: ClientProfileHint | null
}

type ActivityKey = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
type GoalKey = 'cut' | 'maintain' | 'bulk'

const ACTIVITY_MULTIPLIERS: Record<ActivityKey, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

const GOAL_ADJUSTMENTS: Record<GoalKey, { kcalDelta: number; proteinMultiplier: number; label: string }> = {
  cut: { kcalDelta: -400, proteinMultiplier: 2.2, label: 'Déficit (bajar grasa)' },
  maintain: { kcalDelta: 0, proteinMultiplier: 1.8, label: 'Mantención' },
  bulk: { kcalDelta: 300, proteinMultiplier: 2.0, label: 'Volumen (ganar músculo)' },
}

const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  sedentary: 'Sedentario (sin ejercicio)',
  light: 'Ligero (1–3 días/sem)',
  moderate: 'Moderado (3–5 días/sem)',
  active: 'Activo (6–7 días/sem)',
  very_active: 'Muy activo (doble sesión)',
}

function calcMacros(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  gender: 'M' | 'F',
  activity: ActivityKey,
  goal: GoalKey
): Goals {
  const bmr =
    gender === 'M'
      ? 10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activity]
  const adj = GOAL_ADJUSTMENTS[goal]
  const calories = Math.round(tdee + adj.kcalDelta)
  const protein = Math.round(weightKg * adj.proteinMultiplier)
  const fats = Math.round(weightKg * 0.9)
  const carbsKcal = calories - protein * 4 - fats * 9
  const carbs = Math.max(0, Math.round(carbsKcal / 4))
  return { calories, protein, carbs, fats }
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
  clientProfile,
}: Props) {
  const [suggOpen, setSuggOpen] = useState(false)
  const [suggAge, setSuggAge] = useState('25')
  const [suggGender, setSuggGender] = useState<'M' | 'F'>('M')
  const [suggActivity, setSuggActivity] = useState<ActivityKey>('moderate')
  const [suggGoal, setSuggGoal] = useState<GoalKey>('maintain')

  const suggested = useMemo(() => {
    const w = clientProfile?.weight_kg
    const h = clientProfile?.height_cm
    const age = Number.parseInt(suggAge, 10)
    if (!w || !h || !Number.isFinite(age) || age < 10 || age > 99) return null
    return calcMacros(w, h, age, suggGender, suggActivity, suggGoal)
  }, [clientProfile, suggAge, suggGender, suggActivity, suggGoal])

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
            <InfoTooltip content="Cuando está activo, las metas se calculan automáticamente desde los macros reales de los alimentos que agregas. Desactívalo para definir metas manualmente." />
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
              ['kcal', 'calories', goals.calories, 'Suma total de calorías al día. Se calcula automáticamente según los alimentos que agregues, o puedes establecerlo manualmente como meta.'],
              ['Proteína (g)', 'protein', goals.protein, 'Para ganancia muscular: 1.6–2.2 g/kg de peso corporal. Para mantención: 1.2–1.6 g/kg.'],
              ['Carbos (g)', 'carbs', goals.carbs, 'Principal fuente de energía. Ajusta según el nivel de actividad del alumno.'],
              ['Grasas (g)', 'fats', goals.fats, 'Esenciales para hormonas y absorción de vitaminas. No bajar de 0.5 g/kg de peso corporal.'],
            ] as const
          ).map(([label, key, val, tip]) => (
            <div key={key}>
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <InfoTooltip content={tip} />
              </div>
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

      {mode === 'client-plan' && clientProfile?.weight_kg && clientProfile?.height_cm && (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/5">
          <button
            type="button"
            onClick={() => setSuggOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300">
                Macros sugeridos (Mifflin-St Jeor)
              </span>
              <InfoTooltip
                content="Cálculo estimado basado en peso, altura, edad y nivel de actividad del alumno. Es solo una referencia — tú defines los valores finales."
                iconClassName="w-3 h-3"
              />
            </div>
            {suggOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            )}
          </button>

          {suggOpen && (
            <div className="border-t border-violet-500/20 px-3 pb-3 pt-2 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div>
                  <span className="font-bold">Peso:</span> {clientProfile.weight_kg} kg
                </div>
                <div>
                  <span className="font-bold">Altura:</span> {clientProfile.height_cm} cm
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Edad</Label>
                  <Input
                    type="number"
                    value={suggAge}
                    onChange={(e) => setSuggAge(e.target.value)}
                    className="h-8 mt-0.5 text-sm"
                    min={10}
                    max={99}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Género</Label>
                  <Select value={suggGender} onValueChange={(v) => setSuggGender(v as 'M' | 'F')}>
                    <SelectTrigger className="h-8 mt-0.5 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Femenino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Actividad</Label>
                <Select value={suggActivity} onValueChange={(v) => setSuggActivity(v as ActivityKey)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue>{ACTIVITY_LABELS[suggActivity]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentario (sin ejercicio)</SelectItem>
                    <SelectItem value="light">Ligero (1–3 días/sem)</SelectItem>
                    <SelectItem value="moderate">Moderado (3–5 días/sem)</SelectItem>
                    <SelectItem value="active">Activo (6–7 días/sem)</SelectItem>
                    <SelectItem value="very_active">Muy activo (doble sesión)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Objetivo</Label>
                <Select value={suggGoal} onValueChange={(v) => setSuggGoal(v as GoalKey)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue>{GOAL_ADJUSTMENTS[suggGoal].label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GOAL_ADJUSTMENTS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {suggested && (
                <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-1 text-[11px] font-bold">
                    <span className="text-muted-foreground">kcal:</span>
                    <span className="tabular-nums text-violet-700 dark:text-violet-300">{suggested.calories}</span>
                    <span className="text-muted-foreground">Proteína:</span>
                    <span className="tabular-nums text-orange-600">{suggested.protein}g</span>
                    <span className="text-muted-foreground">Carbos:</span>
                    <span className="tabular-nums text-blue-600">{suggested.carbs}g</span>
                    <span className="text-muted-foreground">Grasas:</span>
                    <span className="tabular-nums text-yellow-600">{suggested.fats}g</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[10px] font-bold border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
                    onClick={() => {
                      onGoalsChange(suggested)
                      if (autoSync) onAutoSyncToggle(false)
                    }}
                  >
                    Aplicar sugerencia
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center gap-1">
          <Label className="text-xs font-bold uppercase text-muted-foreground">Indicaciones</Label>
          <InfoTooltip content="Notas visibles para el alumno en su plan. Úsalas para agregar contexto: horarios sugeridos, tip de preparación, o recordatorios específicos para este alumno." />
        </div>
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
