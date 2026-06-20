'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MealAdherenceItem {
  id: string
  name: string
  /** Whether the meal was completed for the period. */
  completed: boolean
  /**
   * Optional explicit portion percentage of the plan consumed (0–100).
   * `null`/undefined = binary completion (100% when completed).
   */
  partialPlanPct?: number | null
  /** Optional calories for the meal (shown as a muted chip). */
  calories?: number | null
}

export interface MealAdherenceListProps {
  meals: MealAdherenceItem[]
  /** Caption above the list. */
  title?: string
  className?: string
}

function adherencePct(item: MealAdherenceItem): number {
  if (!item.completed) return 0
  if (item.partialPlanPct != null) return Math.max(0, Math.min(100, item.partialPlanPct))
  return 100
}

/** Track color is paired with a check icon + text % so it never reads by color alone. */
function trackColor(pct: number, completed: boolean): string {
  if (!completed || pct === 0) return 'var(--ring-track-strong)'
  if (pct >= 80) return 'var(--color-macro-goal)'
  if (pct >= 50) return 'var(--color-macro-carbs)'
  return 'var(--color-macro-over)'
}

/**
 * Presentational per-meal adherence list. Each row shows the meal name, a
 * completion check (icon, not color-only), an optional kcal chip and a small
 * percentage track. Pure — no data fetching, no actions.
 */
export function MealAdherenceList({ meals, title, className }: MealAdherenceListProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {title ? (
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{title}</p>
      ) : null}
      <ul className="space-y-1.5" aria-label={title ?? 'Adherencia por comida'}>
        {meals.map((meal) => {
          const pct = adherencePct(meal)
          const done = meal.completed
          return (
            <li
              key={meal.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                done
                  ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                  : 'border-border bg-card'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-muted-foreground/30 text-transparent'
                )}
                aria-hidden
              >
                <Check className="h-3.5 w-3.5" />
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm font-bold',
                  done ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'
                )}
              >
                {meal.name}
              </span>
              {meal.calories != null ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black tabular-nums text-muted-foreground">
                  {Math.round(meal.calories)} kcal
                </span>
              ) : null}
              <span
                className="flex h-1.5 w-10 shrink-0 overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--ring-track-strong)' }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-valuetext={`${meal.name}: ${done ? `${pct} por ciento del plan` : 'sin registrar'}`}
                aria-label={meal.name}
              >
                <span
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: trackColor(pct, done) }}
                  aria-hidden
                />
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
