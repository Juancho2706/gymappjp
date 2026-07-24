import Link from 'next/link'
import { Calendar } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getActiveProgram, getClientWorkoutPlans, getRecentWorkoutLogs } from '../../_data/dashboard.queries'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import { deriveWeekWorkoutStatus } from '../../_data/weekPendingWorkouts'
import { ProgramPhaseBar, type PhaseSeg } from './ProgramPhaseBar'
import { WorkoutPlanCards, type WorkoutPlanCardItem } from './WorkoutPlanCard'
import { WorkoutRecoverBanner } from './WorkoutRecoverBanner'
import { getClientBasePath } from '@/lib/client/base-path'
import { buildWorkoutRecoverHref } from '@/lib/workout/executor-recovery'

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

    // Estado por día de la semana + cola de pendientes (misma resolución que la tira/adherencia).
    const week = deriveWeekWorkoutStatus({ userLocalDate, todayIso: today, program, activePlans, logs })
    const dayByDow = new Map<number, (typeof week.days)[number]>()
    for (const d of week.days) dayByDow.set(d.dayOfWeek, d)

    const cardPlans: WorkoutPlanCardItem[] = programPlans.map((p) => {
        const dow = p.day_of_week ?? 0
        const day = dayByDow.get(dow) ?? null
        return {
            id: p.id,
            title: p.title,
            day_of_week: p.day_of_week,
            status: day?.status ?? 'upcoming',
            isToday: dow === todayDow,
            // Atribución (E1.6): fecha de la celda + fecha/label del día en que realmente se registró.
            dateIso: day?.dateIso ?? '',
            doneOnDate: day?.doneOnDate ?? null,
            doneOnLabel: day?.doneOnLabel ?? null,
        }
    })

    const pending = week.pending
    const oldestPending = pending[0] ?? null

    const todayPlanId = week.days.find((d) => d.isToday)?.planId ?? null

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

            {/* Cola de pendientes: días de esta semana ya pasados sin registrar → recuperables HOY.
                CTA al más antiguo; la ejecución no tiene candado de fecha (el log cuenta el día real). */}
            {oldestPending ? (
                <WorkoutRecoverBanner
                    href={buildWorkoutRecoverHref(base, oldestPending.planId, oldestPending.dateIso)}
                    pendingCount={pending.length}
                    dayOfWeek={oldestPending.dayOfWeek}
                    dayLabel={oldestPending.dayLabel}
                />
            ) : null}

            <WorkoutPlanCards coachSlug={coachSlug} plans={cardPlans} />
            {todayPlanId ? (
                <Link href={`${base}/workout/${todayPlanId}`} className="block text-center text-[11px] font-bold text-sport-600">
                    Ver entreno de hoy →
                </Link>
            ) : null}
        </Card>
    )
}
