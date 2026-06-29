'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
    LayoutGrid,
    ChevronDown,
    ChevronUp,
    Pencil,
    Dumbbell,
    Timer,
    Target,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { ProgramPhasesBar } from '@/components/shared/ProgramPhasesBar'
import { mondayBasedDayOfWeek, parseProgramPhases } from './profileProgramUtils'
import {
    collectLogsForExercise,
    filterPlansForStructureView,
    uniqueMuscleGroupsFromBlocks,
} from './profileProgramStructureUtils'
import { resolveEffectiveWeekVariant } from '@/lib/workout/programWeekVariant'
import { cn } from '@/lib/utils'

const WEEKDAY_LONG = [
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
    'Domingo',
]

type ProgramTabB7Props = {
    clientId: string
    activeProgram: any | null | undefined
    workoutHistory: any[]
    planCurrentWeek: number
    planTotalWeeks: number
    planDaysRemaining: number
}

function useSheetSide(): 'bottom' | 'right' {
    const [side, setSide] = useState<'bottom' | 'right'>('right')
    useEffect(() => {
        const q = window.matchMedia('(max-width: 767px)')
        const fn = () => setSide(q.matches ? 'bottom' : 'right')
        fn()
        q.addEventListener('change', fn)
        return () => q.removeEventListener('change', fn)
    }, [])
    return side
}

export function ProgramTabB7({
    clientId,
    activeProgram,
    workoutHistory,
    planCurrentWeek,
    planTotalWeeks,
    planDaysRemaining,
}: ProgramTabB7Props) {
    const sheetSide = useSheetSide()
    const [sheetOpen, setSheetOpen] = useState(false)
    const [sheetBlock, setSheetBlock] = useState<any | null>(null)
    const [planOpen, setPlanOpen] = useState<Record<string, boolean>>({})

    const structure = (activeProgram?.program_structure_type as 'weekly' | 'cycle' | null) || 'weekly'
    const isWeekly = structure === 'weekly'

    const abMode = !!activeProgram?.ab_mode
    // Variante EFECTIVA (cae a la que tenga planes si la del ciclo está vacía) — el badge y los días
    // mostrados coinciden, y un A/B mal armado de una sola semana no muestra "sin días".
    const activeVariant = useMemo(
        () =>
            resolveEffectiveWeekVariant(
                activeProgram,
                (activeProgram?.workout_plans as { week_variant?: string | null }[] | undefined) ?? [],
                planCurrentWeek > 0 ? planCurrentWeek : null,
                new Date()
            ),
        [activeProgram, planCurrentWeek]
    )

    const plansView = useMemo(
        () =>
            filterPlansForStructureView(activeProgram?.workout_plans, structure, {
                abMode,
                activeVariant,
            }),
        [activeProgram?.workout_plans, structure, abMode, activeVariant]
    )

    const planByDow = useMemo(() => {
        const m = new Map<number, any>()
        for (const p of plansView) {
            const d = Number(p.day_of_week)
            if (!m.has(d)) m.set(d, p)
        }
        return m
    }, [plansView])

    const todayDow = mondayBasedDayOfWeek(new Date())

    const phases = useMemo(
        () => parseProgramPhases(activeProgram?.program_phases),
        [activeProgram?.program_phases]
    )

    const weeksRepeat = Math.max(1, Number(activeProgram?.weeks_to_repeat) || 1)
    const hasSchedule = !!(activeProgram?.start_date && activeProgram?.end_date)
    const weekProgressPct =
        hasSchedule && planTotalWeeks > 0
            ? Math.min(100, Math.round((planCurrentWeek / planTotalWeeks) * 100))
            : 0

    const exerciseIdForSheet = sheetBlock?.exercise_id ?? sheetBlock?.exercises?.id
    const historySessions = useMemo(
        () => collectLogsForExercise(workoutHistory, String(exerciseIdForSheet || '')),
        [workoutHistory, exerciseIdForSheet]
    )

    const openBlock = (block: any) => {
        setSheetBlock(block)
        setSheetOpen(true)
    }

    const togglePlanList = (key: string) => {
        setPlanOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }))
    }

    if (!activeProgram) {
        return (
            <Card padding="lg" className="items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-subtle">
                    <LayoutGrid className="h-6 w-6" />
                </div>
                <p className="text-base font-extrabold text-strong">Sin programa asignado</p>
                <p className="text-sm font-medium text-muted">
                    No hay un programa de entrenamiento activo para este alumno.
                </p>
                <Link
                    href={`/coach/builder/${clientId}`}
                    className={cn(buttonVariants({ variant: 'sport', size: 'md' }), 'mt-2')}
                >
                    Crear o asignar programa
                </Link>
            </Card>
        )
    }

    const renderDayCard = (plan: any | undefined, opts: { dow: number; label: string }) => {
        const { dow, label } = opts
        const key = plan?.id ?? `rest-${dow}`
        const blocks = [...(plan?.workout_blocks || [])].sort(
            (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
        )
        const groups = uniqueMuscleGroupsFromBlocks(blocks)
        const isToday = isWeekly && dow >= 1 && dow <= 7 && dow === todayDow
        const listOpen = planOpen[key] ?? false

        return (
            <div
                key={key}
                className={cn(
                    'flex flex-col rounded-control border p-3 transition-colors',
                    plan && blocks.length > 0
                        ? 'border-subtle bg-surface-sunken'
                        : 'border-subtle bg-surface-sunken/50',
                    isToday && 'ring-2 ring-sport-400'
                )}
            >
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                        className={cn(
                            'text-[10px] font-black uppercase tracking-widest',
                            isToday ? 'text-sport-600' : 'text-muted'
                        )}
                    >
                        {label}
                        {isToday ? ' · Hoy' : ''}
                    </span>
                </div>
                {!plan || blocks.length === 0 ? (
                    <p className="mt-auto text-xs font-bold text-muted">Descanso</p>
                ) : (
                    <>
                        <p className="line-clamp-2 text-xs font-black uppercase tracking-tight text-strong">
                            {plan.title || 'Entrenamiento'}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-muted">
                            {blocks.length} ej. · {groups.slice(0, 3).join(', ')}
                            {groups.length > 3 ? '…' : ''}
                        </p>
                        <button
                            type="button"
                            onClick={() => togglePlanList(key)}
                            className="mt-2 flex w-full items-center justify-between rounded-control border border-subtle bg-surface-card px-2 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-sport-100"
                        >
                            Ejercicios
                            {listOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                            )}
                        </button>
                        {listOpen && (
                            <ul className="mt-2 space-y-1 border-t border-subtle pt-2">
                                {blocks.map((block: any) => {
                                    const name = block.exercises?.name || 'Ejercicio'
                                    return (
                                        <li key={block.id}>
                                            <button
                                                type="button"
                                                onClick={() => openBlock(block)}
                                                className="w-full rounded-[10px] px-2 py-1.5 text-left text-[11px] font-bold text-strong hover:bg-sport-100"
                                            >
                                                {name}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </>
                )}
            </div>
        )
    }

    const ex = sheetBlock?.exercises

    return (
        <div className="space-y-6">
            <Card variant="inverse" padding="lg">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-black uppercase tracking-tight text-on-dark md:text-xl">
                                {activeProgram.name}
                            </h2>
                            <Badge tone="sport" variant="solid" size="sm">
                                {isWeekly ? 'Semanal' : 'Cíclico'}
                            </Badge>
                            {abMode && (
                                <Badge tone="sport" size="sm" title="Semanas impares del programa → A, pares → B">
                                    Variante {activeVariant} · esta semana
                                </Badge>
                            )}
                            <span className="rounded-[10px] border border-[var(--border-inverse)] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-on-dark-muted">
                                {weeksRepeat} sem. ciclo
                            </span>
                            {activeProgram.cycle_length ? (
                                <span className="rounded-[10px] border border-[var(--border-inverse)] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-on-dark-muted">
                                    {activeProgram.cycle_length} días / ciclo
                                </span>
                            ) : null}
                        </div>
                        {phases.length > 0 && (
                            <div className="max-w-xl">
                                <ProgramPhasesBar phases={phases} compact />
                            </div>
                        )}
                        {hasSchedule ? (
                            <div className="max-w-md space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-on-dark-muted">
                                    <span>
                                        Semana {planCurrentWeek} / {planTotalWeeks}
                                    </span>
                                    {planDaysRemaining > 0 ? (
                                        <span>{planDaysRemaining} d restantes</span>
                                    ) : (
                                        <span>En curso</span>
                                    )}
                                </div>
                                <Progress value={weekProgressPct} className="h-1.5 bg-[var(--border-inverse)]" />
                            </div>
                        ) : (
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-dark-muted">
                                Sin fechas inicio/fin en el programa · progreso por semanas no disponible
                            </p>
                        )}
                    </div>
                    <Link
                        href={`/coach/builder/${clientId}`}
                        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-control border-[1.5px] border-[var(--border-inverse)] bg-white/[0.07] px-3.5 text-sm font-bold text-on-dark transition-colors hover:bg-white/[0.12]"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar en builder
                    </Link>
                </div>
            </Card>

            <Card padding="md">
                <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sport-600">
                    <LayoutGrid className="h-4 w-4" />
                    {isWeekly ? 'Microciclo (L–D)' : 'Días del programa'}
                </h3>
                {isWeekly ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
                        {Array.from({ length: 7 }, (_, i) => {
                            const dow = i + 1
                            const plan = planByDow.get(dow)
                            return renderDayCard(plan, {
                                dow,
                                label: WEEKDAY_LONG[dow - 1] ?? `Día ${dow}`,
                            })
                        })}
                    </div>
                ) : plansView.length === 0 ? (
                    <p className="text-sm text-muted">
                        No hay días con ejercicios en este programa (revisa variantes de semana en el
                        builder).
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {plansView.map((plan: any) => {
                            const dow = Number(plan.day_of_week)
                            return renderDayCard(plan, {
                                dow,
                                label: `Día ${dow}`,
                            })
                        })}
                    </div>
                )}
            </Card>

            <Sheet
                open={sheetOpen}
                onOpenChange={(o) => {
                    setSheetOpen(o)
                    if (!o) setSheetBlock(null)
                }}
            >
                <SheetContent
                    side={sheetSide}
                    className={cn(
                        sheetSide === 'bottom' ? 'max-h-[92vh]' : 'sm:max-w-md',
                        'w-full overflow-y-auto border-subtle bg-surface-card text-body'
                    )}
                >
                    <SheetHeader>
                        <SheetTitle className="pr-10 normal-case text-strong">
                            {ex?.name || 'Ejercicio'}
                        </SheetTitle>
                        <SheetDescription className="text-left normal-case">
                            {ex?.muscle_group ? (
                                <span className="inline-flex items-center gap-1 rounded-[10px] border border-subtle bg-surface-sunken px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-muted">
                                    <Target className="h-3 w-3" />
                                    {ex.muscle_group}
                                </span>
                            ) : null}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="space-y-4 px-6 pb-8">
                        {ex?.gif_url ? (
                            <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-control border border-subtle bg-surface-sunken">
                                <Image
                                    src={ex.gif_url}
                                    alt=""
                                    fill
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                        ) : null}

                        <div className="rounded-control border border-subtle bg-surface-sunken p-4 text-sm">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-subtle">
                                Prescripción
                            </p>
                            <ul className="space-y-1.5 text-xs font-semibold text-body">
                                <li className="flex items-center gap-2">
                                    <Dumbbell className="h-3.5 w-3.5 text-sport-600" />
                                    {sheetBlock?.sets ?? '—'} × {sheetBlock?.reps ?? '—'}
                                </li>
                                {sheetBlock?.tempo ? (
                                    <li className="flex items-center gap-2">
                                        <Timer className="h-3.5 w-3.5 text-[var(--ember-500)]" />
                                        Tempo {sheetBlock.tempo}
                                    </li>
                                ) : null}
                                {sheetBlock?.rir ? (
                                    <li>RIR {sheetBlock.rir}</li>
                                ) : null}
                                {sheetBlock?.rest_time ? (
                                    <li>Descanso {sheetBlock.rest_time}</li>
                                ) : null}
                                {sheetBlock?.target_weight_kg != null ? (
                                    <li>Obj. peso {sheetBlock.target_weight_kg} kg</li>
                                ) : null}
                            </ul>
                            {sheetBlock?.notes ? (
                                <p className="mt-3 border-t border-subtle pt-3 text-xs font-medium leading-relaxed text-muted">
                                    {sheetBlock.notes}
                                </p>
                            ) : null}
                        </div>

                        <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => setSheetOpen(false)}
                        >
                            Cerrar
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
