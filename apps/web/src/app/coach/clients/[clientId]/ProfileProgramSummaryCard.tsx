'use client'

import { Calendar, Clock, Dumbbell, ListChecks } from 'lucide-react'
import { Card } from '@/components/ui/card'
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
    /** Deep-link a la Zona A (Progreso) del hogar único de nutrición. La señal de
     *  nutrición vive ahora FUERA de la tarjeta de entrenamiento. */
    onViewNutrition?: () => void
}

export function ProfileProgramSummaryCard({
    activeProgram,
    compliance,
    isNutritionAtRisk = false,
    onViewNutrition,
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
            <Card padding="md">
                <div className="flex items-center gap-2 text-sm font-medium text-muted">
                    <ListChecks className="h-4 w-4 shrink-0" />
                    Sin programa activo asignado.
                </div>
            </Card>
        )
    }

    return (
        <Card padding="md" className="flex flex-col gap-5">
            <div className="space-y-1">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sport-600">
                    <ListChecks className="h-4 w-4" />
                    {activeProgram.name}
                </h3>
                {phases.length > 0 && (
                    <div className="pt-2">
                        <ProgramPhasesBar phases={phases} compact />
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted">
                    <span>Semana ciclo</span>
                    <span className="font-black text-strong">
                        {planCur} / {planTot}
                    </span>
                </div>
                <Progress
                    value={Math.min(100, (planCur / planTot) * 100)}
                    className="h-2 bg-surface-sunken"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                        <Clock className="h-3.5 w-3.5 text-sport-600" />
                        <span>
                            <span className="tabular-nums text-strong">{daysLeft}</span> días
                            restantes
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div
                            className={cn(
                                'h-2 w-2 rounded-full',
                                daysLeft > 0 ? 'bg-[var(--success-500)]' : 'bg-[var(--warning-500)]'
                            )}
                        />
                        <span
                            className={cn(
                                'text-[10px] font-bold uppercase tracking-widest',
                                daysLeft > 0 ? 'text-[var(--success-600)]' : 'text-[var(--warning-600)]'
                            )}
                        >
                            {daysLeft > 0 ? 'En track' : 'Ciclo vencido'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Señal de nutrición — SEPARADA del entreno. Deep-link a Zona A; no
                recomputa adherencia, solo navega al hogar de nutrición. */}
            <button
                type="button"
                onClick={onViewNutrition}
                disabled={!onViewNutrition}
                className={cn(
                    'flex items-center justify-between gap-2 rounded-control px-3 py-2.5 text-left transition-colors',
                    isNutritionAtRisk
                        ? 'bg-[var(--danger-100)] hover:brightness-95'
                        : 'bg-[var(--success-100)] hover:brightness-95',
                    onViewNutrition && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                    !onViewNutrition && 'cursor-default'
                )}
            >
                <span className="flex items-center gap-2">
                    <span
                        className={cn(
                            'h-2 w-2 rounded-full',
                            isNutritionAtRisk ? 'animate-pulse bg-[var(--danger-500)]' : 'bg-[var(--success-500)]'
                        )}
                    />
                    <span
                        className={cn(
                            'text-[10px] font-bold uppercase tracking-widest',
                            isNutritionAtRisk ? 'text-[var(--danger-700)]' : 'text-[var(--success-700)]'
                        )}
                    >
                        {isNutritionAtRisk ? 'Nutrición en riesgo' : 'Nutrición en track'}
                    </span>
                </span>
                {onViewNutrition ? (
                    <span className="text-[10px] font-bold text-sport-600">Ver nutrición →</span>
                ) : null}
            </button>

            {next && (
                <div className="space-y-2 rounded-control bg-sport-100 p-4">
                    <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-sport-700">
                        <Dumbbell className="h-3.5 w-3.5" />
                        Próximo entrenamiento
                    </p>
                    <p className="text-sm font-black leading-tight text-strong">{next.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted">
                        <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {next.dayName}
                            {next.isToday && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-sport-700">
                                    · Hoy
                                </span>
                            )}
                        </span>
                        <span className="text-subtle">
                            {next.exerciseCount} ejercicio
                            {next.exerciseCount === 1 ? '' : 's'}
                        </span>
                    </div>
                </div>
            )}
        </Card>
    )
}
