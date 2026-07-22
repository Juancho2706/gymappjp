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
    /** El plan de ese día tiene un log en CUALQUIER día de esta semana (atribución al plan). */
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
    /**
     * Si el día quedó `done` por una sesión hecha en OTRO día de esta semana (recuperación),
     * fecha ISO `YYYY-MM-DD` de esa sesión. `null` cuando se hizo en su propia fecha (o no está hecho).
     */
    doneOnDate: string | null
    /**
     * Nombre completo del día de `doneOnDate` (p. ej. "Jueves"), para el copy "Hecho el jueves".
     * `null` en los mismos casos que `doneOnDate`. Campo aditivo: la UI del label llega en E1.6.
     */
    doneOnLabel: string | null
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
 * `dayPlan` / variante A-B que `MomentumCard` y `computeWorkoutScore30d`.
 *
 * Atribución al PLAN (fix del gap real, CEO decisión 10, 2026-07-22): un día X queda `done` si SU
 * plan (`dayPlan.id`) tiene un log en CUALQUIER día de esta semana Santiago — no sólo en su propia
 * fecha calendario. Así, recuperar el martes un jueves marca el martes (`doneOnDate`/`doneOnLabel` =
 * "Hecho el jueves") y limpia el pendiente. Reglas de la atribución greedy por plan:
 *   1) cada día completado en SU MISMA fecha consume su propio log primero (done "en fecha", sin
 *      `doneOn` ajeno);
 *   2) los logs sobrantes cierran el día PENDIENTE MÁS ANTIGUO del mismo plan (recuperación);
 *      un mismo log jamás marca dos días → plan repetido en 2+ días necesita 1 log por día.
 * Los días FUTUROS nunca son elegibles (jamás `done`). Sólo cuentan logs cuyo día real Santiago cae
 * dentro de estos 7 días (el caller trae más historial del necesario).
 *
 * OJO: esto NO toca `computeWorkoutScore30d`/momentum ni la racha — ésos cuentan la fecha real by
 * design. Es sólo DESCUBRIBILIDAD + estado visual del dashboard; la ejecución no tiene candado de
 * fecha (`/workout/[planId]`). Sin programa activo → semana vacía y cero pendientes (nada cambia).
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

    type DaySlot = {
        dateIso: string
        dayOfWeek: number
        dayPlan: WeekPlanRow | null
        isToday: boolean
        isFuture: boolean
    }

    // Paso 1: resolver el plan de cada día de la semana (Lun→Dom) — resolución idéntica a la previa.
    const slots: DaySlot[] = []
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

        slots.push({
            dateIso: dStr,
            dayOfWeek: dDow,
            dayPlan,
            isToday: dStr === todayIso,
            isFuture: dStr > todayIso,
        })
    }

    // Paso 2: logs de ESTA semana por plan, con su día real Santiago (asc). Sólo los que caen en los
    // 7 días de la semana cuentan para la atribución (el caller trae más historial del necesario).
    const weekDateSet = new Set(slots.map((s) => s.dateIso))
    const weekLogsByPlan = new Map<string, string[]>()
    for (const l of logs) {
        const planId = l.workout_blocks?.plan_id
        if (!planId) continue
        const ymd = getSantiagoIsoYmdForUtcInstant(l.logged_at)
        if (!weekDateSet.has(ymd)) continue
        const arr = weekLogsByPlan.get(planId)
        if (arr) arr.push(ymd)
        else weekLogsByPlan.set(planId, [ymd])
    }
    for (const arr of weekLogsByPlan.values()) arr.sort()

    // Paso 3: atribución greedy por plan. `doneOnByDate` mapea el día cerrado → fecha real del log que
    // lo cerró (`null` = hecho en su propia fecha). Los días futuros nunca son elegibles.
    const doneOnByDate = new Map<string, string | null>()
    const slotsByPlan = new Map<string, DaySlot[]>()
    for (const s of slots) {
        if (s.isFuture || !s.dayPlan) continue
        const arr = slotsByPlan.get(s.dayPlan.id)
        if (arr) arr.push(s)
        else slotsByPlan.set(s.dayPlan.id, [s])
    }
    for (const [planId, planSlots] of slotsByPlan) {
        const remaining = [...(weekLogsByPlan.get(planId) ?? [])] // fechas ymd asc
        if (remaining.length === 0) continue

        // Fase 1: match exacto en la propia fecha (completado en su día) — consume su log primero.
        for (const s of planSlots) {
            const idx = remaining.indexOf(s.dateIso)
            if (idx !== -1) {
                remaining.splice(idx, 1)
                doneOnByDate.set(s.dateIso, null)
            }
        }
        // Fase 2: logs sobrantes → día pendiente más antiguo del plan sin cerrar (recuperación).
        let li = 0
        for (const s of planSlots) {
            if (li >= remaining.length) break
            if (doneOnByDate.has(s.dateIso)) continue
            doneOnByDate.set(s.dateIso, remaining[li])
            li++
        }
    }

    const dowByDate = new Map(slots.map((s) => [s.dateIso, s.dayOfWeek]))

    const days: WeekDay[] = slots.map((s) => {
        const isDone = !!s.dayPlan && doneOnByDate.has(s.dateIso)
        const doneOnDate = isDone ? (doneOnByDate.get(s.dateIso) ?? null) : null

        let status: WeekDayStatus
        if (!s.dayPlan) status = 'rest'
        else if (isDone) status = 'done'
        else if (s.isToday) status = 'today'
        else if (s.isFuture) status = 'upcoming'
        else status = 'pending'

        const doneOnLabel = doneOnDate ? DAY_NAMES_FULL[(dowByDate.get(doneOnDate) ?? 1) - 1] : null

        return {
            dateIso: s.dateIso,
            dayOfWeek: s.dayOfWeek,
            planId: s.dayPlan?.id ?? null,
            title: s.dayPlan?.title ?? null,
            status,
            isToday: s.isToday,
            doneOnDate,
            doneOnLabel,
        }
    })

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
