'use client'

import { Calendar, Clock, Dumbbell, ListChecks } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { Progress } from '@/components/ui/progress'
import { ProgramPhasesBar } from '@/components/shared/ProgramPhasesBar'
import { cn } from '@/lib/utils'
import {
    parseProgramPhases,
    resolveNextProgramWorkout,
    type NextProgramWorkoutInfo,
} from './profileProgramUtils'

type ComplianceSlice = {
    planCurrentWeek?: number
    planTotalWeeks?: number
    planDaysRemaining?: number
}

type ProfileProgramSummaryCardProps = {
    activeProgram: any | null | undefined
    compliance: ComplianceSlice
    isNutritionAtRisk?: boolean
}

export function ProfileProgramSummaryCard({
    activeProgram,
    compliance,
    isNutritionAtRisk = false,
}: ProfileProgramSummaryCardProps) {
    const phases = parseProgramPhases(activeProgram?.program_phases)
    const planCur = compliance.planCurrentWeek ?? 1
    const planTot = Math.max(1, compliance.planTotalWeeks ?? 4)
    const daysLeft = Math.max(0, compliance.planDaysRemaining ?? 0)

    const next: NextProgramWorkoutInfo | null = resolveNextProgramWorkout(
        activeProgram,
        new Date(),
        compliance.planCurrentWeek != null && compliance.planCurrentWeek > 0
            ? compliance.planCurrentWeek
            : null
    )

    if (!activeProgram) {
        return (
            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10">
                <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <ListChecks className="w-4 h-4 shrink-0" />
                    Sin programa activo asignado.
                </div>
            </GlassCard>
        )
    }

    return (
        <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden flex flex-col gap-5">
            <div className="absolute bottom-0 right-0 -mr-10 -mb-10 w-36 h-36 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-1">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <ListChecks className="w-4 h-4" />
                    {activeProgram.name}
                </h3>
                {phases.length > 0 && (
                    <div className="pt-2">
                        <ProgramPhasesBar phases={phases} compact />
                    </div>
                )}
            </div>

            <div className="relative z-10 space-y-3">
                <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                    <span>Semana ciclo</span>
                    <span className="text-foreground font-black">
                        {planCur} / {planTot}
                    </span>
                </div>
                <Progress
                    value={Math.min(100, (planCur / planTot) * 100)}
                    className="h-2 bg-secondary"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span>
                            <span className="text-foreground tabular-nums">{daysLeft}</span> días
                            restantes
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div
                            className={cn(
                                'w-2 h-2 rounded-full',
                                isNutritionAtRisk ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
                            )}
                        />
                        <span
                            className={cn(
                                'text-[10px] font-bold uppercase tracking-widest',
                                isNutritionAtRisk ? 'text-red-500' : 'text-emerald-500'
                            )}
                        >
                            {isNutritionAtRisk ? 'Nutri. en riesgo' : 'En track'}
                        </span>
                    </div>
                </div>
            </div>

            {next && (
                <div className="relative z-10 rounded-xl border border-border/60 dark:border-white/10 bg-secondary/20 dark:bg-white/[0.04] p-4 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Dumbbell className="w-3.5 h-3.5 text-primary" />
                        Próximo entrenamiento
                    </p>
                    <p className="text-sm font-black text-foreground leading-tight">{next.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground font-semibold">
                        <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {next.dayName}
                            {next.isToday && (
                                <span className="text-primary font-black uppercase tracking-wider text-[9px]">
                                    · Hoy
                                </span>
                            )}
                        </span>
                        <span className="text-muted-foreground/80">
                            {next.exerciseCount} ejercicio
                            {next.exerciseCount === 1 ? '' : 's'}
                        </span>
                    </div>
                </div>
            )}
        </GlassCard>
    )
}
