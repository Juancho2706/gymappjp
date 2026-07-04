import { getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'

/** Nombres completos 1=Lun … 7=Dom (convención DB). */
const DAY_NAMES_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Fila mínima de plan (espejo de `getClientWorkoutPlans` + filtros del dashboard). */
export type WeekPlanRow = {
    id: string
    title: string
    assigned_date: string | null
    program_id: string | null
    day_of_week: number | null
    week_variant?: string | null
}

export type WeekLogRow = {
    logged_at: string
    workout_blocks: { plan_id: string | null } | null
}

export type WeekProgramRow = {
    id: string
    ab_mode?: boolean | null
    start_date?: string | null
    weeks_to_repeat?: number | null
}

/** Estado de un día de la semana actual del alumno. */
export type WeekDayStatus =
    /** No hay plan para ese día = descanso (nunca pendiente). */
    | 'rest'
    /** Hay log del plan en ese mismo día calendario Santiago. */
    | 'done'
    /** Es HOY y aún sin completar (lo gestiona el hero). */
    | 'today'
    /** Día pasado con plan y sin log → recuperable. */
    | 'pending'
    /** Día futuro con plan. */
    | 'upcoming'

export type WeekDay = {
    dateIso: string
    dayOfWeek: number
    planId: string | null
    title: string | null
    status: WeekDayStatus
    isToday: boolean
}

export type PendingWorkout = {
    planId: string
    title: string
    /** 1=Lun … 7=Dom. */
    dayOfWeek: number
    /** Fecha YYYY-MM-DD de esa ocurrencia en la semana actual. */
    dateIso: string
    /** "Martes". */
    dayLabel: string
    /** "Mar". */
    shortLabel: string
}

export type WeekWorkoutStatus = {
    /** Los 7 días de la semana actual (Lun→Dom) con su estado. */
    days: WeekDay[]
    /** Sólo los días PASADOS con plan sin registrar, del más antiguo al más nuevo. */
    pending: PendingWorkout[]
}

function pad(n: number): string {
    return String(n).padStart(2, '0')
}

/**
 * Deriva el estado de cada día de la semana ACTUAL del alumno y la cola de días PENDIENTES
 * (días pasados de esta semana con plan y sin registro). Función PURA — misma resolución de
 * `dayPlan` / variante A-B / completado que `MomentumCard` y `computeWorkoutScore30d`, para que
 * las tres superficies (tira semanal, adherencia y esta cola) coincidan al día.
 *
 * Decisión de producto (CEO 2026-07-04): el log cuenta el DÍA REAL en que se hizo (cero re-mapeo,
 * cero cambios al motor de adherencia/racha). Esto es sólo DESCUBRIBILIDAD + estado visual: expone
 * el pendiente y deja recuperarlo hoy vía su `/workout/[planId]` (la ejecución no tiene candado de
 * fecha). Sin programa activo → semana vacía y cero pendientes (nada cambia).
 *
 * Un día de DESCANSO (sin plan) NUNCA es pendiente. HOY nunca es pendiente (es trabajo del hero).
 */
export function deriveWeekWorkoutStatus(input: {
    /** Fecha local Santiago de hoy (de `getTodayInSantiago().date`). */
    userLocalDate: Date
    /** ISO YYYY-MM-DD de hoy en Santiago. */
    todayIso: string
    program: WeekProgramRow | null
    activePlans: WeekPlanRow[]
    logs: WeekLogRow[]
}): WeekWorkoutStatus {
    const { userLocalDate, todayIso, program, activePlans, logs } = input

    if (!program) {
        return { days: [], pending: [] }
    }

    const abMode = !!program.ab_mode
    const weekIdx = programWeekIndex1Based(program, userLocalDate)
    // Variante EFECTIVA del ciclo (cae a la que tiene planes si A/B mal armado) — idéntica a la
    // que usa el carrusel y la tira, para no divergir en semanas "B" de una sola semana cargada.
    const activeVariant = resolveEffectiveWeekVariant(
        program,
        activePlans.filter((p) => p.program_id === program.id),
        weekIdx,
        userLocalDate
    )

    // Lunes de la semana que contiene hoy (misma fórmula que MomentumCard/WeekCalendar).
    const curr = userLocalDate
    const firstDay = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1)

    const days: WeekDay[] = []
    for (let i = 0; i < 7; i++) {
        const d = new Date(curr)
        d.setDate(firstDay + i)
        const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        const dDow = d.getDay() === 0 ? 7 : d.getDay()

        const assignedPlan = activePlans.find((p) => p.assigned_date === dStr) ?? null
        const programPlan =
            activePlans.find(
                (p) =>
                    p.program_id === program.id &&
                    p.day_of_week === dDow &&
                    workoutPlanMatchesVariant(p, activeVariant, abMode)
            ) ?? null
        const dayPlan = assignedPlan ?? programPlan

        const isToday = dStr === todayIso
        const isFuture = dStr > todayIso
        const isCompleted =
            !!dayPlan &&
            !isFuture &&
            logs.some(
                (l) =>
                    l.workout_blocks?.plan_id === dayPlan.id &&
                    getSantiagoIsoYmdForUtcInstant(l.logged_at) === dStr
            )

        let status: WeekDayStatus
        if (!dayPlan) status = 'rest'
        else if (isCompleted) status = 'done'
        else if (isToday) status = 'today'
        else if (isFuture) status = 'upcoming'
        else status = 'pending'

        days.push({
            dateIso: dStr,
            dayOfWeek: dDow,
            planId: dayPlan?.id ?? null,
            title: dayPlan?.title ?? null,
            status,
            isToday,
        })
    }

    const pending: PendingWorkout[] = days
        .filter((d): d is WeekDay & { planId: string; title: string } => d.status === 'pending' && !!d.planId)
        .sort((a, b) => (a.dateIso < b.dateIso ? -1 : 1))
        .map((d) => ({
            planId: d.planId,
            title: d.title,
            dayOfWeek: d.dayOfWeek,
            dateIso: d.dateIso,
            dayLabel: DAY_NAMES_FULL[d.dayOfWeek - 1],
            shortLabel: DAY_NAMES_SHORT[d.dayOfWeek - 1],
        }))

    return { days, pending }
}
