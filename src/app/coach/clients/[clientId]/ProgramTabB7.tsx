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
import { GlassCard } from '@/components/ui/glass-card'
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
import { resolveActiveWeekVariantForDisplay } from '@/lib/workout/programWeekVariant'
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
    const activeVariant = useMemo(
        () =>
            resolveActiveWeekVariantForDisplay(
                activeProgram,
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
            <GlassCard className="border-dashed border-border/50 p-10 text-center dark:border-white/10">
                <LayoutGrid className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                    No hay un programa de entrenamiento activo para este alumno.
                </p>
                <Link
                    href={`/coach/builder/${clientId}`}
                    className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'mt-4')}
                >
                    Crear o asignar programa
                </Link>
            </GlassCard>
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
                    'flex flex-col rounded-xl border p-3 transition-colors dark:border-white/10',
                    plan && blocks.length > 0
                        ? 'border-border/50 bg-secondary/20'
                        : 'border-dashed border-border/40 bg-muted/20',
                    isToday && 'ring-2 ring-primary/50'
                )}
            >
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                        className={cn(
                            'text-[10px] font-black uppercase tracking-widest',
                            isToday ? 'text-primary' : 'text-muted-foreground'
                        )}
                    >
                        {label}
                        {isToday ? ' · Hoy' : ''}
                    </span>
                </div>
                {!plan || blocks.length === 0 ? (
                    <p className="mt-auto text-xs font-bold text-muted-foreground">Descanso</p>
                ) : (
                    <>
                        <p className="text-xs font-black uppercase tracking-tight text-foreground line-clamp-2">
                            {plan.title || 'Entrenamiento'}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-muted-foreground">
                            {blocks.length} ej. · {groups.slice(0, 3).join(', ')}
                            {groups.length > 3 ? '…' : ''}
                        </p>
                        <button
                            type="button"
                            onClick={() => togglePlanList(key)}
                            className="mt-2 flex w-full items-center justify-between rounded-lg border border-border/40 bg-background/50 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 dark:border-white/10"
                        >
                            Ejercicios
                            {listOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                            )}
                        </button>
                        {listOpen && (
                            <ul className="mt-2 space-y-1 border-t border-border/30 pt-2 dark:border-white/10">
                                {blocks.map((block: any) => {
                                    const name = block.exercises?.name || 'Ejercicio'
                                    return (
                                        <li key={block.id}>
                                            <button
                                                type="button"
                                                onClick={() => openBlock(block)}
                                                className="w-full rounded-md px-2 py-1.5 text-left text-[11px] font-bold text-foreground hover:bg-primary/10"
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
            <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-6 dark:border-white/10 md:p-8">
                <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
                <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-black uppercase tracking-tight text-foreground md:text-xl">
                                {activeProgram.name}
                            </h2>
                            <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                                {isWeekly ? 'Semanal' : 'Cíclico'}
                            </span>
                            {abMode && (
                                <span
                                    className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400"
                                    title="Semanas impares del programa → A, pares → B"
                                >
                                    Variante {activeVariant} · esta semana
                                </span>
                            )}
                            <span className="rounded-md border border-border/50 bg-secondary/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground dark:border-white/10">
                                {weeksRepeat} sem. ciclo
                            </span>
                            {activeProgram.cycle_length ? (
                                <span className="rounded-md border border-border/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground dark:border-white/10">
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
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    <span>
                                        Semana {planCurrentWeek} / {planTotalWeeks}
                                    </span>
                                    {planDaysRemaining > 0 ? (
                                        <span>{planDaysRemaining} d restantes</span>
                                    ) : (
                                        <span>En curso</span>
                                    )}
                                </div>
                                <Progress value={weekProgressPct} className="h-1.5 bg-secondary" />
                            </div>
                        ) : (
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Sin fechas inicio/fin en el programa · progreso por semanas no disponible
                            </p>
                        )}
                    </div>
                    <Link
                        href={`/coach/builder/${clientId}`}
                        className={cn(
                            buttonVariants({ variant: 'outline', size: 'sm' }),
                            'shrink-0 gap-2 border-primary/30'
                        )}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar en builder
                    </Link>
                </div>
            </GlassCard>

            <GlassCard className="border-dashed border-border/50 p-5 dark:border-white/10 md:p-6">
                <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
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
                    <p className="text-sm text-muted-foreground">
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
            </GlassCard>

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
                        'w-full overflow-y-auto border-white/10 bg-zinc-950/95 text-white'
                    )}
                >
                    <SheetHeader>
                        <SheetTitle className="pr-10 normal-case">
                            {ex?.name || 'Ejercicio'}
                        </SheetTitle>
                        <SheetDescription className="text-left normal-case">
                            {ex?.muscle_group ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-300">
                                    <Target className="h-3 w-3" />
                                    {ex.muscle_group}
                                </span>
                            ) : null}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="space-y-4 px-6 pb-8">
                        {ex?.gif_url ? (
                            <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-xl border border-white/10 bg-black/40">
                                <Image
                                    src={ex.gif_url}
                                    alt=""
                                    fill
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                        ) : null}

                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                Prescripción
                            </p>
                            <ul className="space-y-1.5 text-xs font-semibold text-zinc-200">
                                <li className="flex items-center gap-2">
                                    <Dumbbell className="h-3.5 w-3.5 text-primary" />
                                    {sheetBlock?.sets ?? '—'} × {sheetBlock?.reps ?? '—'}
                                </li>
                                {sheetBlock?.tempo ? (
                                    <li className="flex items-center gap-2">
                                        <Timer className="h-3.5 w-3.5 text-amber-400" />
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
                                <p className="mt-3 border-t border-white/10 pt-3 text-xs font-medium leading-relaxed text-zinc-400">
                                    {sheetBlock.notes}
                                </p>
                            ) : null}
                        </div>

                        <div>
                            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                Historial reciente (logs)
                            </p>
                            {historySessions.length === 0 ? (
                                <p className="text-xs text-zinc-500">
                                    Sin series registradas para este ejercicio en el historial.
                                </p>
                            ) : (
                                <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                                    {historySessions.map((s, idx) => (
                                        <div
                                            key={`${s.assignedDate}-${idx}`}
                                            className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
                                        >
                                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                                {s.assignedDate
                                                    ? new Date(s.assignedDate).toLocaleDateString(
                                                          'es-ES',
                                                          {
                                                              day: '2-digit',
                                                              month: 'short',
                                                              year: 'numeric',
                                                          }
                                                      )
                                                    : '—'}{' '}
                                                · {s.planTitle}
                                            </p>
                                            <ul className="mt-2 space-y-1 text-[11px] font-mono text-zinc-300">
                                                {s.rows.map((r) => (
                                                    <li key={r.set}>
                                                        #{r.set} · {r.kg ?? '—'} kg · {r.reps ?? '—'} reps
                                                        {r.rpe != null ? ` · RPE ${r.rpe}` : ''}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            className="w-full border-white/20 text-white hover:bg-white/10"
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
