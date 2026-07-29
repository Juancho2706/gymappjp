'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { NutritionWeekCell } from '@eva/nutrition-v2'
import { WeekDayNav } from '@/components/nutrition-v2'
import { cn } from '@/lib/utils'

/**
 * Puente de navegación de la tira Lu-Do en la ficha del coach.
 *
 * `WeekDayNav` es presentacional puro (avisa el día elegido y nada más): acá se decide que el día
 * viaje en la URL como `?date=`, para que el estado sobreviva al refresh, al back y al link que el
 * coach se manda a sí mismo. Se usa `replace` y no `push` a propósito: mirar siete días no debe
 * dejar siete entradas en el historial entre la ficha y el roster. `scroll: false` mantiene la
 * vista donde está (la tira no se desmonta al cambiar de día).
 *
 * El día de HOY navega a la ficha limpia (sin query): la URL canónica del alumno sigue siendo
 * `/coach/nutrition-v2/{id}`. La navegación tampoco arrastra `?published=1`, que es un aviso de un
 * solo uso y no debe reaparecer al pasear por la semana.
 *
 * Cero fetch acá: el RSC recompone la semana con datos que ya viajaron (`plan.dayVariants` +
 * `recentDays`) y NUNCA vuelve a pedir el día (`get_nutrition_today_v2` es volatile y materializa
 * snapshots; ver `_lib/week-nav.ts`).
 */
export function CoachWeekDayNav({
  basePath,
  cells,
  selectedIso,
  todayIso,
}: {
  /** Ruta de la ficha sin query (`/coach/nutrition-v2/{clientId}`). */
  basePath: string
  cells: readonly NutritionWeekCell[]
  selectedIso: string
  todayIso: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div
      aria-busy={isPending}
      className={cn('transition-opacity duration-[var(--dur-fast)]', isPending && 'opacity-60')}
    >
      <WeekDayNav
        cells={cells}
        label="Días de la semana del alumno"
        onSelect={(isoDate) => {
          if (isoDate === selectedIso) return
          const href = isoDate === todayIso ? basePath : `${basePath}?date=${isoDate}`
          startTransition(() => {
            router.replace(href, { scroll: false })
          })
        }}
        selectedIso={selectedIso}
      />
    </div>
  )
}
