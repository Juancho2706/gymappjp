'use client'

import { cn } from '@/lib/utils'

export interface NutritionProgressZoneProps {
  /** Optional zone heading (e.g. "Progreso", "Hoy"). */
  title?: string
  /** Optional caption / period descriptor under the title. */
  subtitle?: string
  /** Optional element rendered at the top-right (e.g. a "Ver todo →" link or period toggle). */
  action?: React.ReactNode
  /** Read-only surfaces dim slightly. */
  isReadOnly?: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Presentational card wrapper for the "Progreso" hot-zone shared by coach +
 * alumno nutrition surfaces. Provides the framed card chrome (header + body)
 * into which `ConsumedVsTarget`, `MacroRings`, `MacroBars`, `AdherenceRing`,
 * `MealAdherenceList`, etc. are composed by the page. Pure layout — no data.
 */
export function NutritionProgressZone({
  title,
  subtitle,
  action,
  isReadOnly,
  children,
  className,
}: NutritionProgressZoneProps) {
  const hasHeader = Boolean(title || subtitle || action)
  return (
    <section
      aria-label={title ?? 'Progreso de nutrición'}
      className={cn(
        'relative space-y-5 overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm',
        isReadOnly && 'opacity-80',
        className
      )}
    >
      {hasHeader ? (
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                {title}
                {isReadOnly ? ' · Solo lectura' : ''}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 truncate text-sm font-bold text-foreground">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}
