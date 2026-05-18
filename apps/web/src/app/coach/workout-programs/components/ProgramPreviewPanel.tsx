'use client'

import { Dumbbell, Eye, Flame, Wind } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
    effectiveWorkoutSection,
    groupContiguousSupersetRuns,
    WORKOUT_SECTION_ORDER,
    type WorkoutSectionKey,
} from '@/lib/workout-block-grouping'
import { useSyncExternalStore } from 'react'
import type { ProgramListModel } from '../libraryStats'

type BlockSection = 'warmup' | 'main' | 'cooldown'

const SECTION_META: Record<BlockSection, { label: string; icon: React.ReactNode; className: string }> = {
    warmup: {
        label: 'Calentamiento',
        icon: <Flame className="size-3" />,
        className: 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    main: {
        label: 'Bloque principal',
        icon: <Dumbbell className="size-3" />,
        className: 'text-primary bg-primary/10 border-primary/20',
    },
    cooldown: {
        label: 'Enfriamiento',
        icon: <Wind className="size-3" />,
        className: 'text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/20',
    },
}

type LibraryPlanBlock = NonNullable<
    NonNullable<ProgramListModel['workout_plans']>[number]['workout_blocks']
>[number]

type LibraryBlockRow = LibraryPlanBlock & {
    id: string
    order_index: number
    superset_group: string | null
}

function librarySectionHeader(sectionKey: WorkoutSectionKey): {
    short: string
    label: string
    icon: React.ReactNode
    className: string
} {
    const short =
        sectionKey === 'warmup' ? 'CAL' : sectionKey === 'main' ? 'PRI' : sectionKey === 'cooldown' ? 'ENF' : 'OTR'
    if (sectionKey === 'other') {
        return {
            short,
            label: 'Otros bloques',
            icon: <Dumbbell className="size-3" />,
            className: 'text-muted-foreground bg-muted/30 border-border/40',
        }
    }
    const m = SECTION_META[sectionKey]
    return { short, label: m.label, icon: m.icon, className: m.className }
}

function renderLibraryExerciseRow(block: LibraryPlanBlock) {
    const chips = [
        block.tempo && `Tempo ${block.tempo}`,
        block.rir && `${block.rir} RIR`,
        block.rest_time && `Desc. ${block.rest_time}`,
    ].filter(Boolean)

    return (
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{block.exercise.name}</p>
                {chips.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{chips.join(' · ')}</p>
                )}
                {block.notes && (
                    <p className="mt-0.5 truncate text-[11px] italic text-muted-foreground/80">{block.notes}</p>
                )}
            </div>
            <div className="shrink-0 rounded-md border border-border/80 bg-muted/30 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground">
                {block.sets}×{block.reps}
            </div>
        </div>
    )
}

function subscribeMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 768px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}

function getMdSnapshot() {
    return window.matchMedia('(min-width: 768px)').matches
}

function getMdServerSnapshot() {
    return true
}

function useIsDesktopMd() {
    return useSyncExternalStore(subscribeMd, getMdSnapshot, getMdServerSnapshot)
}

export function ProgramPreviewBody({ program }: { program: ProgramListModel }) {
    const plans = [...(program.workout_plans ?? [])].sort((a, b) => a.day_of_week - b.day_of_week)
    const phases = program.program_phases ?? []

    return (
        <div className="flex max-h-[min(70vh,560px)] flex-col overflow-y-auto pb-4 sm:max-h-[min(75vh,640px)]">
            {/* Phases bar */}
            {phases.length > 0 && (
                <div className="space-y-1.5 border-b border-border/60 px-4 py-3 sm:px-6">
                    <p className="text-xs font-medium text-muted-foreground">Fases del programa</p>
                    <div className="flex h-2 w-full overflow-hidden rounded-full">
                        {phases.map((phase, i) => (
                            <div
                                key={i}
                                style={{ flex: phase.weeks, backgroundColor: phase.color || '#6b7280' }}
                                title={`${phase.name}: ${phase.weeks} sem.`}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {phases.map((phase, i) => (
                            <span key={i} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <span
                                    className="inline-block size-2 rounded-full"
                                    style={{ backgroundColor: phase.color || '#6b7280' }}
                                />
                                {phase.name} · {phase.weeks} sem.
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {plans.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="flex size-14 items-center justify-center rounded-full border border-dashed border-border bg-muted/30 text-muted-foreground">
                        <Dumbbell className="size-7 opacity-40" />
                    </div>
                    <p className="text-sm text-muted-foreground">Este programa aún no tiene días configurados.</p>
                </div>
            ) : (
                <div className="space-y-4 px-4 pt-4 sm:px-6">
                    {plans.map((plan) => {
                        const blocks = [...(plan.workout_blocks ?? [])].sort(
                            (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
                        )
                        const rows: LibraryBlockRow[] = blocks.map((b) => ({
                            ...b,
                            id: b.id,
                            order_index: b.order_index ?? 0,
                            superset_group: b.superset_group ?? null,
                        }))

                        return (
                            <div
                                key={plan.id}
                                className="overflow-hidden rounded-2xl border border-border/40 bg-card/40"
                            >
                                <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2.5 sm:px-4">
                                    <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                                            {plan.day_of_week}
                                        </span>
                                        <span className="truncate">
                                            Día {plan.day_of_week}: {plan.title}
                                        </span>
                                    </h3>
                                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                                        {blocks.length} ejercicios
                                    </Badge>
                                </div>
                                <div className="divide-y divide-border/50">
                                    {WORKOUT_SECTION_ORDER.map((sectionKey) => {
                                        const sectionBlocks = rows.filter(
                                            (b) => effectiveWorkoutSection(b.section) === sectionKey
                                        )
                                        if (sectionBlocks.length === 0) return null
                                        const header = librarySectionHeader(sectionKey)
                                        const groups = groupContiguousSupersetRuns(sectionBlocks)

                                        return (
                                            <div key={sectionKey} className="space-y-0">
                                                <div
                                                    className={cn(
                                                        'flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[11px] font-semibold sm:px-4',
                                                        header.className,
                                                    )}
                                                >
                                                    <span className="rounded border border-current/30 bg-background/40 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest">
                                                        {header.short}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        {header.icon}
                                                        {header.label}
                                                    </span>
                                                </div>
                                                <div className="space-y-2 bg-background/20 px-2 py-2 sm:px-3">
                                                    {groups.map((group) => (
                                                        <div
                                                            key={group.key}
                                                            className={cn(
                                                                'overflow-hidden rounded-xl border border-transparent',
                                                                group.type === 'superset' &&
                                                                    'border-primary/25 bg-primary/[0.06]',
                                                            )}
                                                        >
                                                            {group.type === 'superset' && (
                                                                <div className="border-b border-primary/15 bg-primary/[0.04] px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary/85">
                                                                    Superserie · grupo {group.supersetLetter ?? '?'}
                                                                </div>
                                                            )}
                                                            <div
                                                                className={cn(
                                                                    'divide-y divide-border/40',
                                                                    group.type === 'superset' && 'rounded-b-xl',
                                                                )}
                                                            >
                                                                {group.blocks.map((block) => (
                                                                    <div key={block.id}>{renderLibraryExerciseRow(block)}</div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

const shellDialogClass =
    'flex w-full max-w-none flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground shadow-xl sm:max-w-2xl md:max-h-[min(92vh,800px)] max-md:fixed max-md:inset-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0'

const shellSheetClass =
    'flex h-[min(92dvh,720px)] max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-2xl border-border bg-background p-0 text-foreground shadow-lg [&_[data-slot=sheet-close]]:border-border [&_[data-slot=sheet-close]]:bg-muted/50 [&_[data-slot=sheet-close]]:text-foreground'

export interface ProgramPreviewPanelProps {
    program: ProgramListModel | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ProgramPreviewPanel({ program, open, onOpenChange }: ProgramPreviewPanelProps) {
    const isDesktop = useIsDesktopMd()

    if (!program) return null

    const header = (
        <div className="flex items-start gap-3 border-b border-border/80 px-4 py-4 sm:px-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Eye className="size-5" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vista previa</p>
                <p className="truncate text-lg font-semibold text-foreground">{program.name}</p>
            </div>
        </div>
    )

    const footer = (
        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cerrar
        </Button>
    )

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent showCloseButton className={cn(shellDialogClass)}>
                    <DialogHeader className="sr-only">
                        <DialogTitle>Vista previa de {program.name}</DialogTitle>
                    </DialogHeader>
                    {header}
                    <ProgramPreviewBody program={program} />
                    <DialogFooter className="border-t border-border/80 bg-muted/10 px-4 py-3 sm:px-6">
                        {footer}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" showCloseButton className={shellSheetClass}>
                <SheetHeader className="border-0 bg-background p-0">
                    <SheetTitle className="sr-only">Vista previa de {program.name}</SheetTitle>
                    {header}
                </SheetHeader>
                <ProgramPreviewBody program={program} />
                <SheetFooter className="border-border bg-muted/10">{footer}</SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
