import {
  buildNutritionDayVariantWeekStrip,
  type NutritionDayVariantLike,
} from '@eva/nutrition-v2'

/**
 * Tira Lu-Do de una variante de día (FD3, SPEC multi-día UX 4-5).
 *
 * Explica —sin decidir nada— qué días le tocan a esta variante: el snapshot del alumno ya
 * congeló la elección y `buildNutritionDayVariantWeekStrip` replica su misma regla. El día
 * base queda marcado en los días que ninguna variante específica reclama, y el día actual
 * se resalta con anillo. Read-only: no hay interacción.
 */
export function DayVariantWeekStrip<T extends NutritionDayVariantLike>({
  variants,
  variant,
  todayIso,
}: {
  variants: readonly T[]
  variant: T
  todayIso?: string | null
}) {
  const days = buildNutritionDayVariantWeekStrip({ variants, variant, todayIso })
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-1" aria-label="Días en que aplica este día del plan">
      {days.map((day) => (
        <li
          key={day.dayOfWeek}
          aria-label={`${day.longLabel}: ${day.applies ? 'aplica' : 'no aplica'}${day.isToday ? ' · hoy' : ''}`}
          className={[
            'inline-flex min-w-8 items-center justify-center rounded-pill border px-2 py-0.5 text-[11px] tabular-nums',
            day.applies
              ? 'border-primary/30 bg-primary/10 font-semibold text-primary dark:border-primary/40 dark:bg-primary/15'
              : 'border-border-subtle bg-surface-sunken text-subtle',
            day.isToday ? 'ring-1 ring-primary/60' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {day.shortLabel}
        </li>
      ))}
    </ul>
  )
}
