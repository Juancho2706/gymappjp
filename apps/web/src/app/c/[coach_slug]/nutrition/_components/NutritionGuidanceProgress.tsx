import { NotebookText, Pill } from 'lucide-react'

/**
 * Indicaciones del profesional (suplementación + protocolo) del plan del alumno.
 *
 * NOTA (decisión CEO 2026-07-16): la comparación de SOLO LECTURA de hábitos del día
 * (agua / pasos / sueño / ayuno vs. metas del plan) se RETIRÓ de aquí por ser un
 * duplicado — el editor completo de hábitos vive en el dashboard (`HabitsTrackerWidget`,
 * fuente editable). Este bloque conserva solo lo que NO estaba duplicado: las
 * indicaciones de suplementación y el protocolo que escribe el coach, que no se
 * muestran en ninguna otra parte de la app del alumno.
 */
interface Props {
  plan: {
    supplement_guidance?: string[] | null
    protocol_notes?: string | null
  }
}

export function NutritionGuidanceProgress({ plan }: Props) {
  const supplements = plan.supplement_guidance ?? []
  const hasContent = supplements.length > 0 || Boolean(plan.protocol_notes)
  if (!hasContent) return null

  return (
    <section aria-label="Indicaciones del profesional" className="rounded-card border border-ember-500/20 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <NotebookText className="h-4 w-4 text-ember-500" />
        <h2 className="font-display text-base font-extrabold tracking-tight text-foreground">Indicaciones del profesional</h2>
      </div>
      <p className="mt-1 text-[11px] font-semibold leading-relaxed text-muted-foreground">
        Lo que tu profesional te recomienda. No son recomendaciones automáticas.
      </p>

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
