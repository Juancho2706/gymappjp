'use client'

import { useEffect, useState, useTransition } from 'react'
import { Droplets, Footprints, Loader2, Moon, NotebookPen, TimerReset } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getNutritionPlanGuidanceAction,
  updateNutritionPlanGuidanceAction,
} from '../_actions/guidance.actions'

interface Props {
  planId: string
  clientName: string
  disabled?: boolean
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function NutritionGuidanceDialog({ planId, clientName, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hydration, setHydration] = useState('')
  const [steps, setSteps] = useState('')
  const [sleep, setSleep] = useState('')
  const [fasting, setFasting] = useState('')
  const [supplements, setSupplements] = useState('')
  const [protocolNotes, setProtocolNotes] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || disabled) return
    let active = true
    setLoading(true)
    void getNutritionPlanGuidanceAction({ planId })
      .then((result) => {
        if (!active) return
        if (!result.success || !result.guidance) {
          toast.error(result.error ?? 'No se pudo cargar el protocolo.')
          setOpen(false)
          return
        }
        const guidance = result.guidance
        setHydration(guidance.hydrationTargetMl == null ? '' : String(guidance.hydrationTargetMl))
        setSteps(guidance.stepsTarget == null ? '' : String(guidance.stepsTarget))
        setSleep(guidance.sleepTargetHours == null ? '' : String(guidance.sleepTargetHours))
        setFasting(guidance.fastingTargetHours == null ? '' : String(guidance.fastingTargetHours))
        setSupplements(guidance.supplementGuidance.join('\n'))
        setProtocolNotes(guidance.protocolNotes ?? '')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [disabled, open, planId])

  function save() {
    const supplementGuidance = supplements
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean)

    startTransition(async () => {
      const result = await updateNutritionPlanGuidanceAction({
        planId,
        hydrationTargetMl: parseOptionalNumber(hydration),
        stepsTarget: parseOptionalNumber(steps),
        sleepTargetHours: parseOptionalNumber(sleep),
        fastingTargetHours: parseOptionalNumber(fasting),
        supplementGuidance,
        protocolNotes: protocolNotes.trim() || null,
      })

      if (!result.success) {
        toast.error(result.error ?? 'No se pudo guardar el protocolo.')
        return
      }
      toast.success('Objetivos y protocolo guardados')
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={(
          <button
            type="button"
            disabled={disabled}
            aria-label={`Configurar objetivos de ${clientName}`}
            className="flex h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-ember-100 hover:text-ember-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-ember-500/15 dark:hover:text-ember-300"
          />
        )}
      >
        <NotebookPen className="h-4 w-4" />
      </DialogTrigger>

      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden border-subtle bg-surface-card p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-subtle px-5 py-4">
          <DialogTitle className="font-display text-xl font-extrabold normal-case tracking-tight text-strong">
            Objetivos de {clientName}
          </DialogTitle>
          <p className="text-xs leading-relaxed text-muted">
            Metas profesionales comparadas con el registro diario existente. EVA no genera recomendaciones automáticas.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-ember-500" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricField
                id="guidance-hydration"
                label="Agua diaria"
                suffix="ml"
                icon={<Droplets className="h-4 w-4" />}
                value={hydration}
                onChange={setHydration}
                placeholder="Ej: 2500"
              />
              <MetricField
                id="guidance-steps"
                label="Pasos diarios"
                suffix="pasos"
                icon={<Footprints className="h-4 w-4" />}
                value={steps}
                onChange={setSteps}
                placeholder="Ej: 8000"
              />
              <MetricField
                id="guidance-sleep"
                label="Sueño"
                suffix="horas"
                icon={<Moon className="h-4 w-4" />}
                value={sleep}
                onChange={setSleep}
                placeholder="Ej: 8"
              />
              <MetricField
                id="guidance-fasting"
                label="Ayuno opcional"
                suffix="horas"
                icon={<TimerReset className="h-4 w-4" />}
                value={fasting}
                onChange={setFasting}
                placeholder="Dejar vacío si no aplica"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="guidance-supplements">Indicaciones de suplementos</Label>
              <textarea
                id="guidance-supplements"
                value={supplements}
                onChange={(event) => setSupplements(event.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Una indicación por línea. No se generan automáticamente."
                className="w-full resize-y rounded-control border border-default bg-surface-card px-3 py-3 text-sm text-strong outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="guidance-notes">Protocolo y recomendaciones</Label>
              <textarea
                id="guidance-notes"
                value={protocolNotes}
                onChange={(event) => setProtocolNotes(event.target.value)}
                rows={6}
                maxLength={8000}
                placeholder="Objetivos conductuales, horarios, señales de alerta o instrucciones de seguimiento…"
                className="w-full resize-y rounded-control border border-default bg-surface-card px-3 py-3 text-sm text-strong outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-subtle bg-surface-sunken/50 px-5 py-4">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={pending || loading} className="min-w-36 bg-ember-500 text-white hover:bg-ember-600">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar objetivos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetricField({
  id,
  label,
  suffix,
  icon,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  suffix: string
  icon: React.ReactNode
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          className="eva-mono h-11 rounded-control border-default bg-surface-card pl-9 pr-16"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-muted">
          {suffix}
        </span>
      </div>
    </div>
  )
}
