import Link from 'next/link'
import { Calendar } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getActiveProgram, getClientWorkoutPlans, getRecentWorkoutLogs } from '../../_data/dashboard.queries'
import { getSantiagoIsoYmdForUtcInstant, getTodayInSantiago } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import { ProgramPhaseBar, type PhaseSeg } from './ProgramPhaseBar'
import { WorkoutPlanCards } from './WorkoutPlanCard'
import { getClientBasePath } from '@/lib/client/base-path'

export async function ActiveProgramSection({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const base = await getClientBasePath(coachSlug)
    const [program, allPlans, logs] = await Promise.all([
        getActiveProgram(userId),
        getClientWorkoutPlans(userId),
        getRecentWorkoutLogs(userId),
    ])
    const activePlans = allPlans.filter((p) => !p.program_id || p.program_id === program?.id)

    if (!program) {
        return (
            <Card padding="lg" className="text-center">
                <Calendar className="mx-auto h-10 w-10 text-muted" />
                <p className="font-bold text-strong">Sin programa activo</p>
                <p className="-mt-2 text-xs text-muted">Pídele a tu coach que te asigne uno</p>
            </Card>
        )
    }

    const { date: userLocalDate, iso: today, dayOfWeek: todayDow } = getTodayInSantiago()
    const abMode = !!program.ab_mode
    const weekIdx = programWeekIndex1Based(program, userLocalDate)
    // Variante EFECTIVA: cae a la que tiene planes si la del ciclo está vacía (A/B mal armado),
    // así una sola semana cargada no deja al alumno con el dashboard vacío en semanas "B".
    const activeVariant = resolveEffectiveWeekVariant(
        program,
        activePlans.filter((p) => p.program_id === program.id),
        weekIdx,
        userLocalDate
    )

    const programPlans = activePlans
        .filter((p) => p.program_id === program.id && workoutPlanMatchesVariant(p, activeVariant, abMode))
        .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))

    if (programPlans.length === 0) {
        return (
            <Card padding="lg" className="text-center">
                <p className="text-sm text-muted">No hay días visibles para esta semana del programa.</p>
            </Card>
        )
    }

    let todayPlan = activePlans.find((p) => p.assigned_date === today) ?? null
    if (!todayPlan) {
        todayPlan =
            activePlans.find(
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
        logs.some(
            (l) =>
                getSantiagoIsoYmdForUtcInstant(l.logged_at) === today &&
                (blockIds.size === 0 || blockIds.has(l.block_id))
        )

    const totalWeeks = Math.max(1, program.weeks_to_repeat ?? 1)
    const currentWeek = weekIdx ?? 1
    const phasesRaw = program.program_phases
    const phases: PhaseSeg[] | null = Array.isArray(phasesRaw) ? (phasesRaw as unknown as PhaseSeg[]) : null

    return (
        <Card padding="md" className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-2 font-display text-base font-bold text-strong">
                    <Calendar className="h-4 w-4 shrink-0 text-sport-500" />
                    <span className="truncate">{program.name}</span>
                </h2>
                <Badge tone="sport" variant="soft">
                    Semana {currentWeek} de {totalWeeks}
                    {abMode ? ` · Sem ${activeVariant}` : ''}
                </Badge>
            </div>
            <ProgramPhaseBar phases={phases} currentWeek={currentWeek} totalWeeks={totalWeeks} />
            <WorkoutPlanCards coachSlug={coachSlug} plans={programPlans} todayDow={todayDow} workoutLoggedToday={workoutLoggedToday} />
            {todayPlan ? (
                <Link href={`${base}/workout/${todayPlan.id}`} className="block text-center text-[11px] font-bold text-sport-600">
                    Ver entreno de hoy →
                </Link>
            ) : null}
        </Card>
    )
}
