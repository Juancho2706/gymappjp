import Link from 'next/link'
import { CalendarDays, History } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Banner de contexto cuando el alumno NO está mirando hoy (tab "Hoy" del módulo).
 *
 * Su único trabajo es que nadie confunda un día pasado o futuro con la jornada en curso, y dar
 * una salida de un toque de vuelta a hoy. Sobrio a propósito: el pasado no lleva rojo ni copy de
 * culpa (auditoría UX: la adherencia se conversa con el coach, no se reprocha en un banner), y el
 * futuro se pinta con el acento de marca porque es plan, no resultado.
 */
export function SelectedDayBanner({
  headline,
  note,
  backHref,
  backLabel = 'Volver a hoy',
  tone = 'past',
}: {
  headline: string
  /** Matiz opcional bajo el titular (por ejemplo, que el futuro es una proyección). */
  note?: string | null
  /** URL de retorno (canónica de hoy, o del historial cuando se llega desde ahí). */
  backHref: string
  /** Copy del link de vuelta; el día abierto desde Historial dice "Volver al historial". */
  backLabel?: string
  tone?: 'past' | 'future'
}) {
  const Icon = tone === 'future' ? CalendarDays : History
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control border px-4 py-2',
        tone === 'future'
          ? 'border-primary/30 bg-primary/10 dark:border-primary/40 dark:bg-primary/15'
          : 'border-border-subtle bg-surface-sunken',
      )}
    >
      <div className="flex min-w-0 items-start gap-2 py-1">
        <Icon
          aria-hidden="true"
          className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'future' ? 'text-primary' : 'text-muted')}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strong">{headline}</p>
          {note ? <p className="mt-0.5 text-xs leading-5 text-subtle">{note}</p> : null}
        </div>
      </div>
      <Link
        className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-sm font-semibold text-primary hover:bg-surface-card"
        href={backHref}
      >
        {backLabel}
      </Link>
    </div>
  )
}
