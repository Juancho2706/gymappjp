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
 * COSTO / DECISIÓN: son 3 lecturas indexadas extra. Por eso la `page.tsx` sólo la invoca cuando el
 * flag `executor_v3` viene ON del server (Edge Config, hoy OFF por defecto) → cero costo para V2 y
 * mientras V3 no esté desplegado. Si el override QA `eva:executor-v3=on` enciende V3 en cliente con el
 * flag server OFF, este dato no viaja y la racha simplemente NO se muestra (degradación honesta, jamás
 * dato falso). Sin programa activo ⇒ `null` (la UI omite la racha).
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
