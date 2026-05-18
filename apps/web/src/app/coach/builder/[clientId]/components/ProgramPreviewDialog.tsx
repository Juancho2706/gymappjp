'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
    effectiveWorkoutSection,
    groupContiguousSupersetRuns,
    WORKOUT_SECTION_ORDER,
    type WorkoutSectionKey,
} from '@/lib/workout-block-grouping'
import { getMuscleColor } from '../muscle-colors'
import type { BuilderBlock, DayState } from '../types'

const PREVIEW_SECTION_LABEL: Record<WorkoutSectionKey, string> = {
    warmup: 'Calentamiento',
    main: 'Principal',
    cooldown: 'Enfriamiento',
    other: 'Otros',
}

type PreviewRow = BuilderBlock & { id: string; order_index: number; superset_group: string | null }

function buildDayPreviewSections(blocks: BuilderBlock[]) {
    const rows: PreviewRow[] = blocks.map((b, order_index) => ({
        ...b,
        id: b.uid,
        order_index,
        superset_group: b.superset_group ?? null,
    }))
    return WORKOUT_SECTION_ORDER.map((sectionKey) => {
        const sectionBlocks = rows.filter((b) => effectiveWorkoutSection(b.section) === sectionKey)
        if (sectionBlocks.length === 0) return null
        const groups = groupContiguousSupersetRuns(sectionBlocks)
        return { sectionKey, label: PREVIEW_SECTION_LABEL[sectionKey], groups }
    }).filter(Boolean) as Array<{
        sectionKey: WorkoutSectionKey
        label: string
        groups: ReturnType<typeof groupContiguousSupersetRuns<PreviewRow>>
    }>
}

interface ProgramPreviewDialogProps {
    open: boolean
    onClose: () => void
    programName: string
    days: DayState[]
    weeksToRepeat: number
    durationType: string
    durationDays: number | null
    programNotes: string
    clientName?: string | null
}

export function ProgramPreviewDialog({
    open, onClose,
    programName, days, weeksToRepeat, durationType, durationDays,
    programNotes, clientName,
}: ProgramPreviewDialogProps) {
    const activeDays = days.filter(d => !d.is_rest && d.blocks.length > 0)
    const restDays = days.filter(d => d.is_rest)
    const totalExercises = activeDays.reduce((sum, d) => sum + d.blocks.length, 0)
    const totalSets = activeDays.reduce((sum, d) => sum + d.blocks.reduce((s, b) => s + (b.sets || 0), 0), 0)

    const allMuscles = Array.from(new Set(
        activeDays.flatMap(d => d.blocks.map(b => b.muscle_group).filter(Boolean))
    ))

    function durationLabel() {
        if (durationType === 'calendar_days' && durationDays) return `Duración: ${durationDays} días corridos`
        if (durationType === 'async') return `Duración: ${durationDays || weeksToRepeat * 7} días (sin semana fija)`
        return `Duración: ${weeksToRepeat} semana${weeksToRepeat !== 1 ? 's' : ''}`
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-2xl border border-border shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-sm font-display uppercase tracking-[0.2em] text-foreground">
                        Vista previa del programa
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-4 space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                    {/* Header del programa */}
                    <div className="p-5 rounded-2xl border border-border bg-muted/30">
                        <h2 className="text-xl font-display font-bold uppercase tracking-widest text-foreground">
                            {programName || 'Sin nombre'}
                        </h2>
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                                {durationLabel()}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                                {activeDays.length} días activos
                            </span>
                            {restDays.length > 0 && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-lg">
                                    {restDays.length} descansos
                                </span>
                            )}
                            {clientName && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg">
                                    Para: {clientName}
                                </span>
                            )}
                        </div>

                        {/* Stats rápidos */}
                        <div className="grid grid-cols-3 gap-2 mt-4">
                            {[
                                { label: 'Ejercicios', value: totalExercises },
                                { label: 'Series', value: totalSets },
                                { label: 'Días activos', value: activeDays.length },
                            ].map(stat => (
                                <div key={stat.label} className="text-center p-3 bg-background rounded-xl border border-border overflow-hidden">
                                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                                    <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mt-0.5 leading-tight break-words">{stat.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Grupos musculares */}
                        {allMuscles.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-4">
                                {allMuscles.map(m => (
                                    <span
                                        key={m}
                                        className="text-[9px] font-bold uppercase tracking-widest text-white px-2 py-0.5 rounded-full shadow-sm"
                                        style={{ backgroundColor: getMuscleColor(m) }}
                                    >
                                        {m}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Días activos */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {days.map(day => {
                            if (day.is_rest) return (
                                <div key={day.id} className="p-3 rounded-xl border border-border bg-muted/10 opacity-50">
                                    <div className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                        {day.name} — Descanso
                                    </div>
                                </div>
                            )
                            if (day.blocks.length === 0) return null
                            return (
                                <div key={day.id} className="p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-foreground">
                                            {day.name}
                                            {day.title && (
                                                <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
                                                    — {day.title}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {Array.from(new Set(day.blocks.map(b => b.muscle_group).filter(Boolean))).map(m => (
                                                <div key={m} className="w-2 h-2 rounded-full" style={{ backgroundColor: getMuscleColor(m) }} title={m} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {buildDayPreviewSections(day.blocks).map((sec) => (
                                            <div key={sec.sectionKey} className="space-y-1.5">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border/60 pb-0.5">
                                                    {sec.label}
                                                </div>
                                                <div className="space-y-2 pl-0.5">
                                                    {sec.groups.map((group) => (
                                                        <div
                                                            key={group.key}
                                                            className={cn(
                                                                'rounded-lg border border-transparent',
                                                                group.type === 'superset' &&
                                                                    'border-primary/25 bg-primary/[0.06] p-2 space-y-1',
                                                            )}
                                                        >
                                                            {group.type === 'superset' && (
                                                                <div className="text-[8px] font-black uppercase tracking-widest text-primary/80 px-0.5">
                                                                    Superserie · grupo {group.supersetLetter ?? '?'}
                                                                </div>
                                                            )}
                                                            <div className={cn('space-y-1', group.type === 'superset' && 'pl-1')}>
                                                                {group.blocks.map((block) => (
                                                                    <div
                                                                        key={block.uid}
                                                                        className="flex items-center gap-2 text-[10px] text-muted-foreground"
                                                                    >
                                                                        <div
                                                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                                            style={{
                                                                                backgroundColor: getMuscleColor(block.muscle_group),
                                                                            }}
                                                                        />
                                                                        <span className="font-bold text-foreground/80 truncate">
                                                                            {block.exercise_name}
                                                                        </span>
                                                                        {block.sets && block.reps && (
                                                                            <span className="ml-auto shrink-0 bg-muted px-1.5 py-0.5 rounded font-bold">
                                                                                {block.sets}×{block.reps}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Notas del programa */}
                    {programNotes && (
                        <div className="p-4 rounded-xl border border-border bg-muted/20">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Notas del Programa</div>
                            <p className="text-xs text-foreground/80 leading-relaxed">{programNotes}</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
