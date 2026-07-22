/**
 * Racha SEMANAL del ejecutor V3 (E4.4) — helpers PUROS (sin RN, sin queries) que derivan el estado de la
 * semana "sesiones hechas vs dias con plan" para pintar los dots Lun→Dom en el Inicio (SessionStart) y en
 * la pantalla Final (SessionCompleteV3). SIN rachas diarias ni guilt-copy: es una foto neutra de la semana.
 *
 * FUENTE DE VERDAD (documentada): el ejecutor NO tiene en memoria el calendario semanal (solo carga EL plan
 * en ejecucion). Para que la racha sea HONESTA y no inventada, `ExecutorV3` hace una lectura acotada a la
 * semana (best-effort, gateada por `clientId`) que espeja la atribucion del dashboard
 * (`home.tsx` momentumDays / web `weekPendingWorkouts`):
 *   · `plannedDates` = dias Lun→Dom con un `workout_plan` del alumno (por `day_of_week` 1..7 o `assigned_date`).
 *   · `doneDates`    = dias Lun→Dom con al menos un `workout_log` (fecha REAL del log en huso Santiago).
 * La racha cuenta la FECHA REAL del entreno (igual que momentumDays: "cuentan la fecha real by design"), no
 * la atribucion greedy por-plan de las day-cards. Si la lectura falla (offline) el ejecutor pasa `null` y la
 * UI oculta la racha — NUNCA se muestra un dato falso.
 */
import { isoDateAddDays } from '../../../../lib/date-utils'

/** Estado visual de un dot de la semana. */
export type WeekDotState = 'done' | 'today' | 'pending' | 'rest'

/** Un dia de la semana (Lun→Dom) ya resuelto para pintar. */
export interface WeekDot {
  /** Fecha ISO YYYY-MM-DD (huso Santiago). */
  iso: string
  /** Inicial del dia (L M X J V S D). */
  label: string
  state: WeekDotState
}

export interface WeeklyStreak {
  /** 7 dots Lun→Dom. */
  dots: WeekDot[]
  /** Sesiones hechas esta semana (fecha real). */
  doneCount: number
  /** Denominador honesto = dias con plan U dias con sesion (nunca menor que doneCount). */
  plannedCount: number
  /** Copy neutro "3 de 4 esta semana" (o variantes sin denominador). */
  copy: string
  /** Falso cuando no hay nada que mostrar (sin plan ni sesiones) → la UI oculta la racha. */
  hasSignal: boolean
}

/** Iniciales Lun→Dom (es), indexadas 0=Lunes..6=Domingo. */
export const WEEK_LETTERS_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

/** Dia de la semana 1..7 (1=Lunes..7=Domingo) de un ISO YYYY-MM-DD, estable via mediodia UTC. */
function isoWeekday1to7(iso: string): number {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() // 0=Dom..6=Sab
  return dow === 0 ? 7 : dow
}

/**
 * Las 7 fechas ISO (Lun→Dom) de la semana que contiene `todayIso` (ya en huso Santiago). Se ancla al lunes
 * restando (weekday-1) dias; toda la aritmetica pasa por `isoDateAddDays` (mediodia UTC, sin drift de TZ).
 */
export function weekDatesMondayToSunday(todayIso: string): string[] {
  const monday = isoDateAddDays(todayIso, -(isoWeekday1to7(todayIso) - 1))
  return Array.from({ length: 7 }, (_, i) => isoDateAddDays(monday, i))
}

/**
 * Dias de la semana con plan, a partir de las filas de plan del alumno. Un dia cuenta si algun plan cae en
 * su `day_of_week` (1..7) o su `assigned_date` coincide con la fecha (plan suelto de fecha fija).
 */
export function plannedDatesForWeek(
  plans: Array<{ day_of_week: number | null; assigned_date: string | null }>,
  weekDates: string[],
): Set<string> {
  const planned = new Set<string>()
  for (const iso of weekDates) {
    const dow = isoWeekday1to7(iso)
    if (plans.some((p) => p.day_of_week === dow || (p.assigned_date != null && p.assigned_date === iso))) {
      planned.add(iso)
    }
  }
  return planned
}

/**
 * Deriva la racha semanal. Estado por dia (Lun→Dom):
 *   · `done`    — hay sesion en esa fecha real.
 *   · `today`   — es hoy y no hay sesion (aun).
 *   · `pending` — hay plan ese dia (pasado o futuro) y no hay sesion.
 *   · `rest`    — sin plan y sin sesion (descanso).
 * Denominador honesto = |plannedDates ∪ doneDates| (una sesion extra fuera de plan suma al denominador, asi
 * doneCount nunca supera plannedCount). Copy neutro, sin culpa.
 */
export function deriveWeeklyStreak(input: {
  weekDates: string[]
  plannedDates: Set<string>
  doneDates: Set<string>
  todayIso: string
}): WeeklyStreak {
  const { weekDates, plannedDates, doneDates, todayIso } = input
  const expected = new Set<string>(plannedDates)
  for (const iso of doneDates) if (weekDates.includes(iso)) expected.add(iso)

  const dots: WeekDot[] = weekDates.map((iso, i) => {
    let state: WeekDotState
    if (doneDates.has(iso)) state = 'done'
    else if (iso === todayIso) state = 'today'
    else if (plannedDates.has(iso)) state = 'pending'
    else state = 'rest'
    return { iso, label: WEEK_LETTERS_ES[i], state }
  })

  const doneCount = dots.reduce((n, d) => n + (d.state === 'done' ? 1 : 0), 0)
  const plannedCount = expected.size
  const hasSignal = plannedCount > 0
  const copy = plannedCount > 0
    ? `${doneCount} de ${plannedCount} esta semana`
    : doneCount > 0
      ? `${doneCount} esta semana`
      : 'Sin sesiones esta semana'

  return { dots, doneCount, plannedCount, copy, hasSignal }
}
