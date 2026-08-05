'use client'

// Semana de adherencia en 7 puntos — primitivo compartido, presentacional puro.
//
// Reemplaza a los "activity dots" del hub, que solo sabían CUÁNTOS de los últimos 7 días
// tuvieron registro y los rellenaban desde la izquierda (no eran días de calendario y no
// distinguían "cumplió la meta" de "registró cualquier cosa"). Desde la migración
// 20260805211949 el read model del hub trae `days7d` con la señal por día, así que cada punto
// es un día real de la ventana rodante y su color sale de la adherencia de ese día.
//
// Los umbrales y el copy NO se redefinen acá: viven en `./adherence-week`, el núcleo puro que
// comparten hub, perfil del alumno y ficha nutricional (y que a su vez reusa
// `resolveCoachDayAdherence` de la ficha como única fuente de las bandas 0.9–1.1 = en meta y
// 0.6–1.3 = desvío moderado). Ese módulo está aparte porque la ficha del coach es RSC y los
// exports de un archivo `'use client'` no son invocables desde el servidor.
//
// Se importa por ruta directa a propósito (no vía `components/nutrition/index.ts`) para no
// arrastrar `@eva/nutrition-v2` al bundle de cliente de las superficies V1 que sí usan el barrel.

import {
  formatAdherenceWeekSummaryText,
  formatAdherenceWeekSummaryTitle,
  resolveDotState,
  resolveWeekWindow,
  summarizeWeek,
  type AdherenceDotState,
  type AdherenceWeekDay,
} from './adherence-week'
import { cn } from '@/lib/utils'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const KCAL_FORMAT = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

/** "mar 04" — día de la semana abreviado + día del mes, es-CL. Timezone-safe (UTC). */
function formatDayChip(isoDate: string): string {
  if (!ISO_DATE_RE.test(isoDate)) return isoDate
  const parts = new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${isoDate}T00:00:00Z`))
  const weekday = (parts.find((p) => p.type === 'weekday')?.value ?? '').replace(/\.$/, '')
  const day = parts.find((p) => p.type === 'day')?.value ?? isoDate.slice(8, 10)
  return `${weekday} ${day}`.trim()
}

/** Etiqueta completa de un punto: nunca esconde el número real (kcal con separador es-CL). */
function dotLabel(isoDate: string, day: AdherenceWeekDay | undefined): string {
  const chip = formatDayChip(isoDate)
  if (!day || day.entryCount <= 0) return `${chip}: sin registro`
  const entries = `${day.entryCount} ${day.entryCount === 1 ? 'registro' : 'registros'}`
  const consumed = KCAL_FORMAT.format(day.consumedCalories)
  if (day.targetCalories == null || !(day.targetCalories > 0)) {
    return `${chip}: ${entries}, ${consumed} kcal (sin meta)`
  }
  return `${chip}: ${entries}, ${consumed} de ${KCAL_FORMAT.format(day.targetCalories)} kcal`
}

const DOT_STYLES: Record<AdherenceDotState, string> = {
  // Hueco = sin registro. La forma (borde vs relleno) ya diferencia sin depender del color.
  empty: 'border border-border-default bg-transparent',
  'in-range': 'bg-emerald-500 dark:bg-emerald-400',
  'off-range': 'bg-amber-500 dark:bg-amber-400',
  // Registró, pero no hay meta evaluable (o el consumo quedó muy fuera de banda): verde tenue,
  // porque registrar YA es la conducta que el coach quiere reforzar.
  logged: 'bg-emerald-500/35 dark:bg-emerald-400/35',
}

const SIZE_STYLES = {
  sm: { dot: 'h-1.5 w-1.5', gap: 'gap-[3px]', text: 'text-[11px]' },
  md: { dot: 'h-2 w-2', gap: 'gap-1', text: 'text-xs' },
} as const

export interface AdherenceWeekDotsProps {
  /** Solo los días CON registros de la ventana (contrato de `days7d`; el resto es hueco). */
  days7d: readonly AdherenceWeekDay[] | null | undefined
  /**
   * Ancla de la ventana: es el ÚLTIMO punto de la fila y los otros 6 son los días previos.
   * El hub pasa HOY en la zona del coach (ventana rodante). El perfil del alumno pasa el
   * DOMINGO de la semana en curso, porque su card habla de la semana Lu-Do, no de los
   * últimos 7 días. Acepta `YYYY-MM-DD` o un `Date`.
   */
  todayIso: string | Date
  size?: 'sm' | 'md'
  /**
   * Compat: conteo agregado 0-7 de días con registro. Se usa SOLO si `days7d` viene vacío
   * (item cacheado emitido antes del triage), degradando a los puntos rellenos desde la
   * izquierda de la versión anterior en vez de pintar una semana falsa toda vacía.
   */
  fallbackActiveDays?: number
  className?: string
}

export function AdherenceWeekDots({
  days7d,
  todayIso,
  size = 'md',
  fallbackActiveDays = 0,
  className,
}: AdherenceWeekDotsProps) {
  const styles = SIZE_STYLES[size]
  const today = todayIso instanceof Date ? todayIso.toISOString().slice(0, 10) : todayIso
  const days = days7d ?? []

  // ── Degradación (item viejo sin `days7d`) ─────────────────────────────────────────
  if (days.length === 0 && fallbackActiveDays > 0) {
    const filled = Math.max(0, Math.min(7, Math.round(fallbackActiveDays)))
    return (
      <div className={cn('min-w-0', className)}>
        <span
          aria-label={`${filled} de 7 días con registro en la última semana`}
          className={cn('inline-flex shrink-0 items-center', styles.gap)}
          role="img"
          title={`${filled}/7 días activos (7 días corridos)`}
        >
          {Array.from({ length: 7 }, (_, index) => (
            <span
              aria-hidden="true"
              className={cn(
                'shrink-0 rounded-full',
                styles.dot,
                index < filled ? DOT_STYLES.logged : DOT_STYLES.empty,
              )}
              key={index}
            />
          ))}
        </span>
        <p className={cn('mt-1 text-muted', styles.text)}>{filled}/7 registrados</p>
      </div>
    )
  }

  const byDate = new Map<string, AdherenceWeekDay>()
  for (const day of days) {
    if (day && typeof day.date === 'string') byDate.set(day.date, day)
  }
  const windowDates = resolveWeekWindow(today, days)

  // El resumen se calcula sobre la ventana pintada: lo que se lee es exactamente lo que se ve.
  // Si `todayIso` viniera corrupto no hay ventana que pintar y se resume lo recibido.
  const inWindow = windowDates
    .map((date) => byDate.get(date))
    .filter((d): d is AdherenceWeekDay => d != null)
  const summary = summarizeWeek(windowDates.length > 0 ? inWindow : days)

  const summaryText = formatAdherenceWeekSummaryText(summary)
  const summaryTitle = formatAdherenceWeekSummaryTitle(summary)

  return (
    <div className={cn('min-w-0', className)}>
      <span className={cn('inline-flex shrink-0 items-center', styles.gap)} role="group">
        {windowDates.map((date) => {
          const day = byDate.get(date)
          const label = dotLabel(date, day)
          return (
            <span
              aria-label={label}
              className={cn('shrink-0 rounded-full', styles.dot, DOT_STYLES[resolveDotState(day)])}
              key={date}
              role="img"
              title={label}
            />
          )
        })}
      </span>
      <p className={cn('mt-1 text-muted', styles.text)} title={summaryTitle}>
        {summaryText}
      </p>
    </div>
  )
}
