import Link from 'next/link'
import { Calendar } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { getActiveProgram, getClientWorkoutPlans, getRecentWorkoutLogs } from '../../_data/dashboard.queries'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveActiveWeekVariantForDisplay,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import { ProgramPhaseBar, type PhaseSeg } from './ProgramPhaseBar'
import { WorkoutPlanCards } from './WorkoutPlanCard'

export async function ActiveProgramSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const [program, allPlans, logs] = await Promise.all([
        getActiveProgram(userId),
        getClientWorkoutPlans(userId),
        getRecentWorkoutLogs(userId),
    ])

    if (!program) {
        return (
            <GlassCard className="p-5 text-center">
                <Calendar className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
                <p className="font-semibold">Sin programa activo</p>
                <p className="mt-1 text-xs text-muted-foreground">Pídele a tu coach que te asigne uno</p>
            </GlassCard>
        )
    }

    const { date: userLocalDate, iso: today, dayOfWeek: todayDow } = getTodayInSantiago()
    const abMode = !!program.ab_mode
    const weekIdx = programWeekIndex1Based(program, userLocalDate)
    const activeVariant = resolveActiveWeekVariantForDisplay(program, weekIdx, userLocalDate)

    const programPlans = allPlans
        .filter((p) => p.program_id === program.id && workoutPlanMatchesVariant(p, activeVariant, abMode))
        .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))

    if (programPlans.length === 0) {
        return (
            <GlassCard className="p-5 text-center">
                <p className="text-sm text-muted-foreground">No hay días visibles para esta semana del programa.</p>
            </GlassCard>
        )
    }

    let todayPlan = allPlans.find((p) => p.assigned_date === today) ?? null
    if (!todayPlan) {
        todayPlan =
            allPlans.find(
                (p) =>
                    p.program_id === program.id &&
                    p.day_of_week === todayDow &&
                    workoutPlanMatchesVariant(p, activeVariant, abMode)
            ) ?? null
    }

    const nestedPlan = program.workout_plans?.find((p) => p.id === todayPlan?.id)
    const blockIds = new Set((nestedPlan?.workout_blocks ?? []).map((b) => b.id))
    const workoutLoggedToday =
        !!todayPlan &&
        logs.some((l) => l.logged_at.startsWith(today) && (blockIds.size === 0 || blockIds.has(l.block_id)))

    const totalWeeks = Math.max(1, program.weeks_to_repeat ?? 1)
    const currentWeek = weekIdx ?? 1
    const phasesRaw = program.program_phases
    const phases: PhaseSeg[] | null = Array.isArray(phasesRaw) ? (phasesRaw as unknown as PhaseSeg[]) : null

    return (
        <GlassCard className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Calendar className="h-4 w-4" style={{ color: 'var(--theme-primary)' }} />
                    <span className="truncate">{program.name}</span>
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Semana {currentWeek} de {totalWeeks}
                    {abMode ? ` · Semana ${activeVariant}` : ''}
                </span>
            </div>
            <ProgramPhaseBar phases={phases} currentWeek={currentWeek} totalWeeks={totalWeeks} />
            <WorkoutPlanCards coachSlug={coachSlug} plans={programPlans} todayDow={todayDow} workoutLoggedToday={workoutLoggedToday} />
            {todayPlan ? (
                <Link href={`/c/${coachSlug}/workout/${todayPlan.id}`} className="block text-center text-[10px] font-semibold text-[color:var(--theme-primary)]">
                    Ver entreno de hoy →
                </Link>
            ) : null}
        </GlassCard>
    )
}
