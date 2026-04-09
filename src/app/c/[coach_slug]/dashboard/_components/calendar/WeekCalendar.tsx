import {
    getActiveProgram,
    getClientWorkoutPlans,
    getRecentWorkoutLogs,
} from '../../_data/dashboard.queries'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveActiveWeekVariantForDisplay,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import { CalendarDaysRow, type CalendarDayProps } from './CalendarDay'

export async function WeekCalendar({ userId }: { userId: string }) {
    const [program, allPlans, logs] = await Promise.all([
        getActiveProgram(userId),
        getClientWorkoutPlans(userId),
        getRecentWorkoutLogs(userId),
    ])

    const { date: userLocalDate, iso: today } = getTodayInSantiago()
    const abMode = !!program?.ab_mode
    const weekIdx = program ? programWeekIndex1Based(program, userLocalDate) : null
    const activeVariant = resolveActiveWeekVariantForDisplay(program, weekIdx, userLocalDate)

    const logDates = new Set(logs.map((l) => l.logged_at.split('T')[0]))

    const curr = userLocalDate
    const firstDay = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1)
    const days: CalendarDayProps[] = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(curr)
        d.setDate(firstDay + i)
        const dYear = d.getFullYear()
        const dMonth = String(d.getMonth() + 1).padStart(2, '0')
        const dDay = String(d.getDate()).padStart(2, '0')
        const dStr = `${dYear}-${dMonth}-${dDay}`
        const dDow = d.getDay() === 0 ? 7 : d.getDay()

        const hasAssigned = allPlans.some((p) => p.assigned_date === dStr)
        const hasProgram =
            !!program &&
            allPlans.some(
                (p) =>
                    p.program_id === program.id &&
                    p.day_of_week === dDow &&
                    workoutPlanMatchesVariant(p, activeVariant, abMode)
            )
        const hasWorkout = hasAssigned || hasProgram

        const isToday = dStr === today
        const isPast = dStr < today
        const isCompleted = hasWorkout && logDates.has(dStr)

        return {
            dayLabel: d.toLocaleDateString('es-ES', { weekday: 'narrow' }).toUpperCase(),
            dayNumber: d.getDate(),
            isToday,
            hasWorkout,
            isCompleted,
            isPast,
        }
    })

    return (
        <div className="rounded-2xl border border-border bg-card px-3 py-3 shadow-sm">
            <CalendarDaysRow days={days} />
        </div>
    )
}
