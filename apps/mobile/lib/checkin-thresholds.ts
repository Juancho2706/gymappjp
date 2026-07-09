/**
 * Umbrales del recordatorio de check-in — lógica pura compartida (E2-18).
 *
 * FUENTE ÚNICA de la decisión "¿toca recordar el check-in?" para mobile: el banner del dashboard
 * (`components/alumno/home/CheckInBanner`, vía `home.tsx`) Y el prompt post-entreno del
 * `WorkoutSummaryOverlay`. Espejo EXACTO del banner web
 * (`c/[coach_slug]/dashboard/_components/checkin/CheckInBanner.tsx`):
 *
 *   - sin check-ins           → `first`   (invitación a registrar el primero)
 *   - días desde el último <3 → `null`    (oculto: aún reciente)
 *   - días desde el último >7 → `overdue` (pendiente, urgente)
 *   - en el medio (3..7)      → `warning` (próximo)
 *
 * Sin React ni queries: recibe la fecha del último check-in (o null) + el día de hoy en Santiago
 * (`getTodayInSantiago().iso`). Los consumidores hacen la query y formatean la fecha relativa.
 */

const MS_DAY = 24 * 60 * 60 * 1000

export type CheckInVariant = 'first' | 'warning' | 'overdue'

export interface CheckInReminder {
  /** Variante a renderizar, o `null` cuando el check-in es reciente (<3 días) → nada que mostrar. */
  variant: CheckInVariant | null
  /** Días transcurridos desde el último check-in (null si nunca hubo). */
  daysSince: number | null
  /** Día (YYYY-MM-DD, Santiago) del último check-in — para formatear "Último: …". */
  lastDay: string | null
}

/** Diferencia en días de calendario entre dos ISO ymd, comparando al mediodía (evita saltos por DST). */
export function daysBetweenCalendar(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T12:00:00`)
  const b = Date.parse(`${toYmd}T12:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / MS_DAY))
}

/**
 * Decide la variante del recordatorio a partir del último check-in y el día de hoy.
 * `lastCheckInDate` = fecha del check-in más reciente (ISO date o timestamp; se toma el ymd), o null.
 */
export function computeCheckInReminder(lastCheckInDate: string | null | undefined, todayIso: string): CheckInReminder {
  if (!lastCheckInDate) {
    return { variant: 'first', daysSince: null, lastDay: null }
  }
  const lastDay = String(lastCheckInDate).slice(0, 10)
  const daysSince = daysBetweenCalendar(lastDay, todayIso)
  const variant: CheckInVariant | null = daysSince > 7 ? 'overdue' : daysSince >= 3 ? 'warning' : null
  return { variant, daysSince, lastDay }
}
