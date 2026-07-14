import { Droplets, Footprints, Moon, NotebookText, Pill, TimerReset } from 'lucide-react'

interface Props {
  plan: {
    hydration_target_ml?: number | null
    steps_target?: number | null
    sleep_target_hours?: number | null
    fasting_target_hours?: number | null
    supplement_guidance?: string[] | null
    protocol_notes?: string | null
  }
  habits: {
    water_ml: number | null
    steps: number | null
    sleep_hours: number | null
    fasting_hours: number | null
    supplements: string[] | null
  } | null
}

function targetPct(value: number | null | undefined, target: number | null | undefined): number {
  if (!target || target <= 0 || value == null) return 0
  return Math.max(0, Math.round((Number(value) / Number(target)) * 100))
}

function Goal({
  label,
  value,
  target,
  unit,
  icon,
}: {
  label: string
  value: number | null | undefined
  target: number
  unit: string
  icon: React.ReactNode
}) {
  const percent = targetPct(value, target)
  return (
    <div className="rounded-control border border-border/70 bg-background/60 p-3">
      <div className="flex items-center gap-2 text-ember-700 dark:text-ember-300">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 font-mono text-sm font-black tabular-nums text-foreground">
        {value == null ? '—' : Number(value).toLocaleString('es-CL')}
        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
          / {Number(target).toLocaleString('es-CL')} {unit}
        </span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-ember-500"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-right font-mono text-[9px] font-bold tabular-nums text-muted-foreground">
        {percent}%
      </p>
    </div>
  )
}

export function NutritionGuidanceProgress({ plan, habits }: Props) {
  const goals = [
    plan.hydration_target_ml
      ? { key: 'water', label: 'Agua', value: habits?.water_ml, target: plan.hydration_target_ml, unit: 'ml', icon: <Droplets className="h-4 w-4" /> }
      : null,
    plan.steps_target
      ? { key: 'steps', label: 'Pasos', value: habits?.steps, target: plan.steps_target, unit: 'pasos', icon: <Footprints className="h-4 w-4" /> }
      : null,
    plan.sleep_target_hours
      ? { key: 'sleep', label: 'Sueño', value: habits?.sleep_hours, target: plan.sleep_target_hours, unit: 'h', icon: <Moon className="h-4 w-4" /> }
      : null,
    plan.fasting_target_hours
      ? { key: 'fasting', label: 'Ayuno', value: habits?.fasting_hours, target: plan.fasting_target_hours, unit: 'h', icon: <TimerReset className="h-4 w-4" /> }
      : null,
  ].filter((goal): goal is NonNullable<typeof goal> => goal !== null)

  const supplements = plan.supplement_guidance ?? []
  const hasContent = goals.length > 0 || supplements.length > 0 || Boolean(plan.protocol_notes)
  if (!hasContent) return null

  return (
    <section aria-label="Objetivos y protocolo" className="rounded-card border border-ember-500/20 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <NotebookText className="h-4 w-4 text-ember-500" />
        <h2 className="font-display text-base font-extrabold tracking-tight text-foreground">Objetivos del profesional</h2>
      </div>
      <p className="mt-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
        Se comparan con los hábitos que registras en EVA. No son recomendaciones automáticas.
      </p>

      {goals.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {goals.map(({ key, ...goal }) => <Goal key={key} {...goal} />)}
        </div>
      )}

      {supplements.length > 0 && (
        <div className="mt-4 rounded-control bg-surface-sunken px-3 py-3">
          <div className="flex items-center gap-2 text-ember-700 dark:text-ember-300">
            <Pill className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-wider">Indicaciones</p>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-foreground">
            {supplements.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-ember-500">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.protocol_notes && (
        <details className="mt-4 rounded-control border border-border/70 bg-background/50">
          <summary className="cursor-pointer list-none px-3 py-3 text-xs font-extrabold text-foreground">
            Ver protocolo y recomendaciones
          </summary>
          <p className="whitespace-pre-wrap border-t border-border/70 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            {plan.protocol_notes}
          </p>
        </details>
      )}
    </section>
  )
}
