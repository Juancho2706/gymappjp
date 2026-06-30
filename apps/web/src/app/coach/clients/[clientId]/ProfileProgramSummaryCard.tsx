'use client'

import Link from 'next/link'
import { CalendarCheck, Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
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
    /** Para el deep-link de "Asignar programa" cuando no hay ciclo activo. */
    clientId: string
    /** Deep-link a la Zona A (Progreso) del hogar único de nutrición. La señal de
     *  nutrición vive ahora FUERA de la tarjeta de entrenamiento. */
    onViewNutrition?: () => void
    /** Click en toda la tarjeta → abre la pestaña Programa (1:1 con el diseño nuevo). */
    onOpenProgram?: () => void
}

export function ProfileProgramSummaryCard({
    activeProgram,
    compliance,
    isNutritionAtRisk = false,
    clientId,
    onViewNutrition,
    onOpenProgram,
}: ProfileProgramSummaryCardProps) {
    const phases = parseProgramPhases(activeProgram?.program_phases)
    const planCur = compliance.planCurrentWeek ?? 1
    const planTot = Math.max(1, compliance.planTotalWeeks ?? 4)
    const daysLeft = Math.max(0, compliance.planDaysRemaining ?? 0)
    const pct = Math.min(100, Math.round((planCur / planTot) * 100))
    const vencido = (compliance.planDaysRemaining ?? 0) <= 0

    const next: NextProgramWorkoutInfo | null = resolveNextProgramWorkout(
        activeProgram,
        new Date(),
        compliance.planCurrentWeek != null && compliance.planCurrentWeek > 0
            ? compliance.planCurrentWeek
            : null
    )

    if (!activeProgram) {
        return (
            <Card padding="md" className="items-stretch text-center">
                <p className="text-[13.5px] font-medium text-muted">
                    Sin programa activo asignado.
                </p>
                <Link
                    href={`/coach/builder/${clientId}`}
                    className={cn(buttonVariants({ variant: 'sport', size: 'md' }), 'w-full')}
                >
                    <Plus className="h-[18px] w-[18px]" />
                    Asignar programa
                </Link>
            </Card>
        )
    }

    return (
        <Card
            padding="md"
            interactive={!!onOpenProgram}
            onClick={onOpenProgram}
            className="gap-0"
        >
            {/* Nombre + badge En track / Ciclo vencido */}
            <div className="mb-2.5 flex items-start justify-between gap-3">
                <h4 className="font-display text-[15px] font-black leading-tight text-strong">
                    {activeProgram.name}
                </h4>
                <Badge tone={vencido ? 'warning' : 'success'} size="sm">
                    {vencido ? 'Ciclo vencido' : 'En track'}
                </Badge>
            </div>

            {/* Barra de fases */}
            {phases.length > 0 && (
                <div className="mb-1">
                    <ProgramPhasesBar phases={phases} compact />
                </div>
            )}

            {/* Semana X de Y · N días restantes */}
            <div className="mb-1.5 mt-2 flex items-center justify-between text-xs text-muted">
                <span>
                    Semana {planCur} de {planTot}
                </span>
                <span>{daysLeft} d restantes</span>
            </div>

            {/* Progreso del ciclo */}
            <div className="mb-3 h-[7px] overflow-hidden rounded-pill bg-surface-sunken">
                <div
                    className="h-full rounded-pill bg-sport-500"
                    style={{ width: `${pct}%` }}
                />
            </div>

            {/* Señal de nutrición — SEPARADA del entreno. Deep-link a Zona A; no
                recomputa adherencia, solo navega al hogar de nutrición. */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onViewNutrition?.()
                }}
                disabled={!onViewNutrition}
                className={cn(
                    'mb-2.5 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[12.5px] font-bold transition-[filter]',
                    isNutritionAtRisk
                        ? 'bg-[var(--danger-100)] text-[var(--danger-700)]'
                        : 'bg-[var(--success-100)] text-[var(--success-700)]',
                    onViewNutrition ? 'hover:brightness-95' : 'cursor-default'
                )}
            >
                <span
                    className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        isNutritionAtRisk
                            ? 'animate-pulse bg-[var(--danger-500)]'
                            : 'bg-[var(--success-500)]'
                    )}
                />
                {isNutritionAtRisk ? 'Nutrición en riesgo' : 'Nutrición en track'}
            </button>

            {/* Próximo entreno */}
            {next && (
                <div className="flex items-center gap-2.5 rounded-md bg-sport-100 px-3 py-2.5">
                    <CalendarCheck className="h-[18px] w-[18px] shrink-0 text-sport-600" />
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--sport-700)]">
                            Próximo entreno · {next.dayName}
                            {next.isToday ? ' · Hoy' : ''}
                        </p>
                        <p className="truncate text-sm font-bold text-strong">
                            {next.title} · {next.exerciseCount} ejercicio
                            {next.exerciseCount === 1 ? '' : 's'}
                        </p>
                    </div>
                </div>
            )}
        </Card>
    )
}
