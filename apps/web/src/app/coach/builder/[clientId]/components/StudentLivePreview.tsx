'use client'

import { useMemo } from 'react'
import { Dumbbell, Moon, Smartphone, Timer } from 'lucide-react'
import {
    executionAreaGroupsFor,
    groupContiguousSupersetRuns,
    type SupersetGroupRow,
    type WorkoutSectionKey,
} from '@eva/workout-engine'
import type { WorkoutArea } from '@/domain/workout/types'
import { EXERCISE_TYPE_META, effectiveExerciseType, typedBlockSummary } from '@/lib/workout-exercise-type'
import { cn } from '@/lib/utils'
import type { BuilderBlock, DayState } from '../types'

/**
 * «Así lo ve tu alumno» — vista del alumno EN VIVO dentro del builder (W4 F4.2).
 *
 * SPEC coach-onboarding-v2 §Diseño v2 (artboard T2): mientras el coach arma la rutina, a la
 * derecha (≥1024 px) ve la misma tarjeta de ejercicio que va a ver su alumno, con series ×
 * repeticiones y descanso. Se re-renderiza con el estado del builder: no hay fetch, no hay
 * guardado intermedio.
 *
 * Por qué NO se importa el ejecutor: `SingleExerciseCard` y `WorkoutExecutionClient`
 * (`app/c/[coach_slug]/workout/[planId]`) son la superficie del ALUMNO y piden ~30 props de
 * sesión viva — logs de la sesión, prefill «= última vez», refs de auto-scroll, providers de
 * teclado/timer y los handlers de logueo optimista. Montarlos acá exigiría fabricar una sesión
 * falsa y arrastraría el motor de logging al bundle del coach. Lo que SÍ se comparte es lo que
 * decide la FORMA: `executionAreaGroupsFor` y `groupContiguousSupersetRuns` (los mismos helpers
 * de `@eva/workout-engine` que agrupan la ejecución real) y `typedBlockSummary` (el mismo
 * resumen por tipo). Así la vista previa no puede quedar desalineada de la ejecución sin que
 * los helpers compartidos cambien.
 */

/** Títulos legacy, idénticos a los de la ejecución y el preview del builder. */
const SECTION_LABEL: Record<WorkoutSectionKey, string> = {
    warmup: 'Calentamiento',
    main: 'Principal',
    cooldown: 'Enfriamiento',
    other: 'Otros',
}

type PreviewRow = BuilderBlock & { id: string; order_index: number; superset_group: string | null }

export interface StudentPreviewGroup {
    key: string
    label: string
    runs: SupersetGroupRow<PreviewRow>[]
}

/**
 * Bloques del día → grupos de render (área o sección legacy) con las superseries contiguas ya
 * resueltas. Puro y exportado para el test: es el contrato de forma con la ejecución del alumno.
 */
export function buildStudentPreviewGroups(
    blocks: readonly BuilderBlock[],
    areas: readonly WorkoutArea[] = [],
): StudentPreviewGroup[] {
    const rows: PreviewRow[] = blocks.map((block, order_index) => ({
        ...block,
        id: block.uid,
        order_index,
        superset_group: block.superset_group ?? null,
    }))
    return executionAreaGroupsFor(rows, areas).map((group) => ({
        key: group.key,
        label: group.name ?? SECTION_LABEL[group.legacySection ?? 'main'],
        runs: groupContiguousSupersetRuns(group.blocks),
    }))
}

/** Objetivo prescrito en una línea: «4 × 8-10» en fuerza, resumen tipado en el resto. */
export function blockObjectiveLabel(block: BuilderBlock): string | null {
    const type = effectiveExerciseType(block, { exercise_type: block.exercise_type })
    if (type !== 'strength') {
        const distance = Number.parseFloat((block.distance_value ?? '').replace(',', '.'))
        return typedBlockSummary(
            { ...block, distance_value: Number.isFinite(distance) ? distance : null, load_value: null },
            type,
        )
    }
    if ((block.sets ?? 0) > 0 && block.reps?.trim()) return `${block.sets} × ${block.reps.trim()}`
    return null
}

function ExercisePreviewCard({ block, index }: { block: BuilderBlock; index: number }) {
    const type = effectiveExerciseType(block, { exercise_type: block.exercise_type })
    const objective = blockObjectiveLabel(block)
    const TypeIcon = EXERCISE_TYPE_META[type].icon
    return (
        <li className="flex items-start gap-2.5 rounded-control border border-subtle bg-surface-card p-2.5">
            <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-bold text-muted"
            >
                {index}
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-strong">{block.exercise_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {objective ? (
                        <span className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-[11.5px] font-bold text-strong">
                            <TypeIcon
                                className="size-3 shrink-0"
                                style={{ color: EXERCISE_TYPE_META[type].color }}
                                aria-hidden
                            />
                            {objective}
                        </span>
                    ) : (
                        <span className="inline-flex items-center rounded-pill bg-[var(--danger-100)] px-2 py-0.5 text-[11.5px] font-bold text-[var(--danger-600)]">
                            Sin prescripción
                        </span>
                    )}
                    {block.rest_time?.trim() ? (
                        <span className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                            <Timer className="size-3 shrink-0" aria-hidden />
                            {block.rest_time.trim()}
                        </span>
                    ) : null}
                </div>
            </div>
        </li>
    )
}

export interface StudentLivePreviewProps {
    /** Nombre del alumno del builder («Matías»). Vacío ⇒ copy genérico. */
    studentName?: string | null
    days: readonly DayState[]
    /** Día que se está mirando. `null` ⇒ el primero con contenido. */
    activeDayId?: number | null
    onSelectDay?: (dayId: number) => void
    areas?: readonly WorkoutArea[]
    /** Semana activa cuando el programa está en modo A/B. */
    variant?: 'A' | 'B' | null
    /**
     * Reserva al pie de la lista. En móvil el FAB «+» y el pill «Guardar» flotan sobre la esquina
     * inferior derecha: sin esta reserva taparían la última tarjeta de la vista previa.
     */
    floatingActionsBelow?: boolean
    className?: string
}

export function StudentLivePreview({
    studentName,
    days,
    activeDayId = null,
    onSelectDay,
    areas = [],
    variant = null,
    floatingActionsBelow = false,
    className,
}: StudentLivePreviewProps) {
    const firstName = studentName?.trim().split(/\s+/)[0] ?? ''
    const day = useMemo(() => {
        const byId = activeDayId == null ? undefined : days.find((d) => d.id === activeDayId)
        if (byId) return byId
        return days.find((d) => !d.is_rest && d.blocks.length > 0) ?? days[0] ?? null
    }, [days, activeDayId])

    const groups = useMemo(
        () => (day == null ? [] : buildStudentPreviewGroups(day.blocks, areas)),
        [day, areas],
    )
    const totalSets = day?.blocks.reduce((sum, b) => sum + (b.sets ?? 0), 0) ?? 0

    return (
        <aside
            aria-label={firstName ? `Vista de ${firstName}` : 'Vista del alumno'}
            className={cn('flex min-h-0 flex-col bg-surface-app', className)}
        >
            <header className="shrink-0 border-b border-subtle px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                    <Smartphone className="size-3.5" aria-hidden />
                    Así lo ve {firstName || 'tu alumno'}
                </p>
                <h2 className="mt-1 truncate font-display text-[16px] font-extrabold tracking-[-0.02em] text-strong">
                    {day ? day.title?.trim() || day.name : 'Sin días'}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                    {day?.is_rest
                        ? 'Día de descanso'
                        : `${day?.blocks.length ?? 0} ejercicios · ${totalSets} series`}
                    {variant ? ` · Semana ${variant}` : ''}
                </p>
            </header>

            {days.length > 1 && (
                <div className="shrink-0 overflow-x-auto border-b border-subtle px-3.5 py-2 [scrollbar-width:none]">
                    <div className="flex w-max gap-1.5">
                        {days.map((d) => {
                            const isActive = day?.id === d.id
                            return (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => onSelectDay?.(d.id)}
                                    aria-pressed={isActive}
                                    className={cn(
                                        'min-h-9 shrink-0 rounded-pill px-2.5 text-[11.5px] font-bold transition-colors',
                                        isActive
                                            ? 'bg-foreground text-background'
                                            : 'bg-surface-sunken text-muted hover:text-strong',
                                    )}
                                >
                                    {d.name.slice(0, 3)}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className={cn('min-h-0 flex-1 overflow-y-auto px-3.5 py-3', floatingActionsBelow && 'pb-24')}>
                {day == null || day.is_rest ? (
                    <p className="flex items-center gap-2 rounded-control border border-subtle bg-surface-card p-3 text-[12.5px] font-semibold text-muted">
                        <Moon className="size-4 shrink-0" aria-hidden />
                        {day == null ? 'Todavía no hay días en el programa.' : 'Descanso: no le aparece nada que hacer.'}
                    </p>
                ) : day.blocks.length === 0 ? (
                    <p className="flex items-center gap-2 rounded-control border border-subtle bg-surface-card p-3 text-[12.5px] font-semibold text-muted">
                        <Dumbbell className="size-4 shrink-0" aria-hidden />
                        Este día está vacío. Agrega un ejercicio y aparece acá al instante.
                    </p>
                ) : (
                    <div className="space-y-3.5">
                        {groups.map((group) => (
                            <section key={group.key}>
                                <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                                    {group.label}
                                </h3>
                                <ul className="list-none space-y-1.5">
                                    {group.runs.map((run) =>
                                        run.type === 'superset' ? (
                                            <li key={run.key}>
                                                <div className="rounded-control border border-[color:color-mix(in_srgb,var(--theme-primary,#007AFF)_30%,transparent)] bg-[color-mix(in_srgb,var(--theme-primary,#007AFF)_7%,transparent)] p-1.5">
                                                    <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary">
                                                        Superserie {run.supersetLetter}
                                                    </p>
                                                    <ul className="list-none space-y-1.5">
                                                        {run.blocks.map((block) => (
                                                            <ExercisePreviewCard
                                                                key={block.id}
                                                                block={block}
                                                                index={block.order_index + 1}
                                                            />
                                                        ))}
                                                    </ul>
                                                </div>
                                            </li>
                                        ) : (
                                            <ExercisePreviewCard
                                                key={run.blocks[0].id}
                                                block={run.blocks[0]}
                                                index={run.blocks[0].order_index + 1}
                                            />
                                        ),
                                    )}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </aside>
    )
}
