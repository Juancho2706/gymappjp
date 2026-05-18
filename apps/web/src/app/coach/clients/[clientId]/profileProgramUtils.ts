import type { SharedProgramPhase } from '@/components/shared/ProgramPhasesBar'
import {
    resolveActiveWeekVariantForDisplay,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'

const WEEKDAY_NAMES = [
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo',
]

/** ISO 1 = Lunes … 7 = Domingo (misma convención que dashboard cliente). */
export function mondayBasedDayOfWeek(d: Date): number {
    const js = d.getDay()
    return js === 0 ? 7 : js
}

export function parseProgramPhases(raw: unknown): SharedProgramPhase[] {
    if (!raw || !Array.isArray(raw)) return []
    return raw
        .map((p: any) => ({
            name: String(p?.name ?? 'Fase'),
            weeks: Math.max(1, Number(p?.weeks) || 1),
            color: typeof p?.color === 'string' ? p.color : undefined,
        }))
        .filter((p) => p.name)
}

export type NextProgramWorkoutInfo = {
    dayOfWeek: number
    dayName: string
    title: string
    exerciseCount: number
    isToday: boolean
}

/**
 * Próximo entreno del microciclo semanal (días 1–7). Si hay días >7, usa el menor `day_of_week` no alcanzado esta “semana lógica” como fallback.
 * Con `ab_mode`, solo considera la variante A/B que toque según semana del programa.
 */
export function resolveNextProgramWorkout(
    program: {
        workout_plans?: any[]
        ab_mode?: boolean | null
        start_date?: string | null
        weeks_to_repeat?: number | null
    } | null | undefined,
    now: Date = new Date(),
    planCurrentWeekFromCompliance?: number | null
): NextProgramWorkoutInfo | null {
    const plans = program?.workout_plans
    if (!program || !plans?.length) return null

    const ab = !!program.ab_mode
    const v = resolveActiveWeekVariantForDisplay(program, planCurrentWeekFromCompliance, now)
    const withBlocks = plans.filter(
        (p: any) =>
            p?.workout_blocks?.length > 0 &&
            p.day_of_week != null &&
            workoutPlanMatchesVariant(p, v, ab)
    )
    if (!withBlocks.length) return null

    const todayDow = mondayBasedDayOfWeek(now)

    const weekly = withBlocks.filter((p: any) => {
        const d = Number(p.day_of_week)
        return d >= 1 && d <= 7
    })

    const pick = (p: any): NextProgramWorkoutInfo => {
        const dow = Number(p.day_of_week)
        const name =
            dow >= 1 && dow <= 7 ? WEEKDAY_NAMES[dow - 1]! : `Día ${dow}`
        return {
            dayOfWeek: dow,
            dayName: name,
            title: String(p.title || 'Entrenamiento'),
            exerciseCount: p.workout_blocks?.length ?? 0,
            isToday: dow >= 1 && dow <= 7 && dow === todayDow,
        }
    }

    if (weekly.length) {
        const sorted = [...weekly].sort(
            (a, b) => Number(a.day_of_week) - Number(b.day_of_week)
        )
        const upcoming = sorted.find((p) => Number(p.day_of_week) >= todayDow)
        const next = upcoming || sorted[0]
        if (!next) return null
        const info = pick(next)
        return { ...info, isToday: info.dayOfWeek === todayDow }
    }

    const sorted = [...withBlocks].sort(
        (a, b) => Number(a.day_of_week) - Number(b.day_of_week)
    )
    const upcoming = sorted.find((p) => Number(p.day_of_week) >= todayDow)
    const next = upcoming || sorted[0]
    return next ? pick(next) : null
}
