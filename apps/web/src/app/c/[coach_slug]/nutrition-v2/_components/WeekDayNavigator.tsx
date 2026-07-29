'use client'

import { useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { NutritionWeekCell } from '@eva/nutrition-v2'
import { WeekDayNav } from '@/components/nutrition-v2'
import { cn } from '@/lib/utils'

/**
 * Puente mínimo entre el selector semanal (`WeekDayNav`, presentacional puro) y la URL.
 *
 * Es la ÚNICA pieza de cliente que agrega la navegación semanal del alumno: el día vive en
 * `searchParams` y el RSC recompone la vista, así que acá no hay estado, ni fetch, ni lógica de
 * negocio. Las 7 URLs las arma el servidor (`hrefByIso`) porque solo él conoce el base path del
 * coach y qué parámetro usa cada tab (`?dow=` en Plan, `?date=` en Hoy); el cliente solo navega.
 *
 * `router.replace` (no `push`) a propósito: tocar 5 chips no debe dejar 5 entradas de historial
 * entre el alumno y el botón "atrás" del navegador. `scroll: false` mantiene la posición: el
 * strip no se mueve, solo cambia el cuerpo.
 *
 * Durante la transición el selector NUNCA se desmonta (sigue respondiendo al toque) y solo el
 * cuerpo se atenúa, con `delay-200` para que una navegación rápida no alcance a parpadear —
 * el umbral de 300 ms del PLAN, resuelto en CSS y sin timers.
 */
export function WeekDayNavigator({
  cells,
  selectedIso,
  hrefByIso,
  label,
  sticky = false,
  children,
}: {
  /** Las 7 celdas ya podadas para el cliente (`toWeekNavCells`). */
  cells: readonly NutritionWeekCell[]
  selectedIso: string
  /** URL destino por fecha `YYYY-MM-DD`. Un día sin URL simplemente no navega. */
  hrefByIso: Record<string, string>
  label?: string
  /** El tab "Hoy" lo fija arriba; en "Plan" el selector viaja con el scroll. */
  sticky?: boolean
  children?: ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="space-y-4">
      <div
        className={cn(
          sticky
            ? // El fondo opaco evita que las cards se transparenten bajo el selector al hacer
              // scroll; el hairline inferior lo separa del contenido sin pesar.
              'sticky top-0 z-20 border-b border-border-subtle/60 bg-surface-app pb-2 pt-1'
            : null,
        )}
      >
        <WeekDayNav
          cells={cells}
          label={label}
          onSelect={(isoDate) => {
            const href = hrefByIso[isoDate]
            if (!href) return
            startTransition(() => {
              router.replace(href, { scroll: false })
            })
          }}
          selectedIso={selectedIso}
        />
      </div>
      {children != null ? (
        <div
          aria-busy={isPending || undefined}
          className={cn(
            'space-y-4 transition-opacity duration-200 motion-reduce:transition-none',
            isPending ? 'opacity-60 delay-200' : null,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
