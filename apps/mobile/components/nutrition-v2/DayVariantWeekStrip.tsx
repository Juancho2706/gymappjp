import { Text, View } from 'react-native'
import {
  buildNutritionDayVariantWeekStrip,
  type NutritionDayVariantLike,
} from '@eva/nutrition-v2'

/**
 * Tira Lu-Do de una variante de día (FD3) — espejo nativo de la web
 * (`apps/web/src/components/nutrition-v2/DayVariantWeekStrip.tsx`).
 *
 * Explica —sin decidir nada— qué días le tocan a esta variante: el snapshot del alumno ya
 * congeló la elección y el helper compartido replica su misma regla. El día base queda marcado
 * en los días que ninguna variante específica reclama y el día actual lleva borde reforzado.
 * Read-only, solo tokens del tema (dark mode y white-label salen gratis).
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
    <View className="mt-2 flex-row flex-wrap items-center gap-1">
      {days.map((day) => (
        <View
          key={day.dayOfWeek}
          accessible
          accessibilityLabel={`${day.longLabel}: ${day.applies ? 'aplica' : 'no aplica'}${day.isToday ? ' · hoy' : ''}`}
          className={[
            'min-w-[32px] items-center justify-center rounded-pill border px-2 py-0.5',
            day.applies ? 'bg-primary/10' : 'bg-surface-sunken',
            day.isToday ? 'border-primary' : day.applies ? 'border-primary/30' : 'border-border-subtle',
          ].join(' ')}
        >
          <Text
            className={
              day.applies ? 'text-[11px] font-semibold text-primary' : 'text-[11px] text-text-subtle'
            }
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {day.shortLabel}
          </Text>
        </View>
      ))}
    </View>
  )
}
