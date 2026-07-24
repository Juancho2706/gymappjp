import { getTodayInSantiago } from '@/lib/date-utils'
import {
    getActiveProgram,
    getClientWorkoutPlans,
    getRecentWorkoutLogs,
} from '@/app/c/[coach_slug]/dashboard/_data/dashboard.queries'
import { deriveWeekWorkoutStatus } from '@/app/c/[coach_slug]/dashboard/_data/weekPendingWorkouts'
import type { WeekStatusDaySource } from '../v3/weekly-streak'

/**
 * Ejecutor V3 (E4.4) — estado de la semana ACTUAL para alimentar la RACHA SEMANAL del ejecutor
 * (Inicio + Final V3). Reusa la MISMA derivación del dashboard (`deriveWeekWorkoutStatus`) y sus
 * queries cacheadas (`getActiveProgram` / `getClientWorkoutPlans` / `getRecentWorkoutLogs`) — cero
 * lógica duplicada — y proyecta sólo el shape mínimo (día/estado/hoy) que consume `computeWeeklyStreak`.
 *
 * COSTO: son 3 lecturas indexadas extra. El ejecutor V3 es el único camino (decisión CEO 2026-07-23:
 * se eliminó el flag `executor_v3`), así que `page.tsx` siempre la invoca. Sin programa activo ⇒
 * `null` (la UI omite la racha; jamás dato falso).
 */
export async function getExecutorWeekStatusDays(clientId: string): Promise<WeekStatusDaySource[] | null> {
    const [program, allPlans, logs] = await Promise.all([
        getActiveProgram(clientId),
        getClientWorkoutPlans(clientId),
        getRecentWorkoutLogs(clientId),
    ])
    if (!program) return null

    const activePlans = allPlans.filter((p) => !p.program_id || p.program_id === program.id)
    const { date: userLocalDate, iso: todayIso } = getTodayInSantiago()
    const week = deriveWeekWorkoutStatus({ userLocalDate, todayIso, program, activePlans, logs })

    return week.days.map((d) => ({ dayOfWeek: d.dayOfWeek, status: d.status, isToday: d.isToday }))
}
