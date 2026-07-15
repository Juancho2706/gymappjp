'use client'

import { Copy, Dumbbell, Flame, GitMerge, Layers, Pencil, Trash2, UserPlus, Wind } from 'lucide-react'
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
    groupContiguousSupersetRuns,
    type SupersetGroupRow,
    type WorkoutSectionKey,
    executionAreaGroupsFor,
} from '@eva/workout-engine'
import { buildAreaVMs } from '@/app/coach/builder/[clientId]/area-ui'
import type { WorkoutArea } from '@/domain/workout/types'
import { useSyncExternalStore } from 'react'
import type { ProgramListModel } from '../libraryStats'
import { getProgramStats } from '../libraryStats'
import { StatusBadge, assignedProgress } from './ProgramRow'

type BlockSection = 'warmup' | 'main' | 'cooldown'

const SECTION_META: Record<BlockSection, { label: string; icon: React.ReactNode; className: string }> = {
    warmup: {
        label: 'Calentamiento',
        icon: <Flame className="size-3" />,
        className: 'text-[var(--warning-700)] bg-[var(--warning-100)] border-[var(--warning-500)]/25',
    },
    main: {
        label: 'Bloque principal',
        icon: <Dumbbell className="size-3" />,
        className: 'text-[var(--sport-700)] bg-[var(--sport-100)] border-[var(--sport-300)]/40',
    },
    cooldown: {
        label: 'Enfriamiento',
        icon: <Wind className="size-3" />,
        className: 'text-[var(--aqua-700)] bg-[var(--aqua-100)] border-[var(--aqua-500)]/25',
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
            className: 'text-muted bg-surface-sunken border-subtle',
        }
    }
    const m = SECTION_META[sectionKey]
    return { short, label: m.label, icon: m.icon, className: m.className }
}

export type LibrarySectionVM<T extends { id: string; order_index: number; superset_group: string | null }> = {
    key: string
    short: string
    label: string
    icon: React.ReactNode
    className: string
    groups: SupersetGroupRow<T>[]
}

/**
 * Secciones del preview de la biblioteca agrupadas por AREA con fallback legacy
 * (mismo helper que la ejecucion del alumno, `executionAreaGroupsFor`):
 * - Programa SOLO clasico → exactamente los headers de siempre (CAL/PRI/ENF via
 *   `librarySectionHeader`, contrato anti-regresion).
 * - Bloques en areas custom/extra → header con el nombre real del area, estilo de
 *   `buildAreaVMs` (mismos colores que el builder), intercalados por sort_order.
 * - Ids no resueltos (area borrada / otro contexto) caen a la seccion legacy.
 * Exportada solo para tests.
 */
export function buildLibrarySections<
    T extends {
        id: string
        order_index: number
        superset_group: string | null
        section?: string | null
        section_template_id?: string | null
    },
>(rows: T[], areas: readonly WorkoutArea[]): LibrarySectionVM<T>[] {
    const vmById = new Map(buildAreaVMs(areas).map((vm) => [vm.id, vm]))
    return executionAreaGroupsFor(rows, areas).map((areaGroup) => {
        const groups = groupContiguousSupersetRuns(areaGroup.blocks)
        if (areaGroup.legacySection) {
            const header = librarySectionHeader(areaGroup.legacySection)
            return { key: areaGroup.key, ...header, groups }
        }
        const vm = vmById.get(areaGroup.key)
        return {
            key: areaGroup.key,
            short: vm?.shortLabel ?? '???',
            label: areaGroup.name ?? 'Área',
            icon: <Layers className="size-3" />,
            className: vm?.badgeClass ?? 'text-muted bg-surface-sunken border-subtle',
            groups,
        }
    })
}

function renderLibraryExerciseRow(block: LibraryPlanBlock, ordinal?: string) {
    const chips = [
        block.tempo && `Tempo ${block.tempo}`,
        block.rir && `${block.rir} RIR`,
        block.rest_time && `Desc. ${block.rest_time}`,
    ].filter(Boolean)

    return (
        <div className="flex items-start justify-between gap-3 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 flex-1 items-start gap-2">
                {ordinal && (
                    <span className="mt-0.5 inline-flex h-5 min-w-[22px] shrink-0 items-center justify-center rounded px-1 text-[10px] font-black tabular-nums text-[var(--sport-700)] bg-[var(--sport-100)]">
                        {ordinal}
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-strong">{block.exercise.name}</p>
                    {chips.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-muted">{chips.join(' · ')}</p>
                    )}
                    {block.notes && (
                        <p className="mt-0.5 truncate text-[11px] italic text-muted">{block.notes}</p>
                    )}
                </div>
            </div>
            <div className="shrink-0 rounded-control border border-subtle bg-surface-sunken px-2.5 py-1 text-xs font-semibold tabular-nums text-strong">
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

export function ProgramPreviewBody({ program, areas = [] }: { program: ProgramListModel; areas?: WorkoutArea[] }) {
    const plans = [...(program.workout_plans ?? [])].sort((a, b) => a.day_of_week - b.day_of_week)
    const phases = program.program_phases ?? []

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-4">
            {/* Phases bar */}
            {phases.length > 0 && (
                <div className="space-y-1.5 border-b border-subtle px-4 py-3 sm:px-6">
                    <p className="text-xs font-medium text-muted">Fases del programa</p>
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
                            <span key={i} className="flex items-center gap-1 text-[11px] text-muted">
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
                    <div className="flex size-14 items-center justify-center rounded-full border border-dashed border-default bg-surface-sunken text-muted">
                        <Dumbbell className="size-7 opacity-40" />
                    </div>
                    <p className="text-sm text-muted">Este programa aún no tiene días configurados.</p>
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
                                className="overflow-hidden rounded-card border border-subtle bg-surface-sunken/40"
                            >
                                <div className="flex items-center justify-between gap-2 border-b border-subtle bg-surface-sunken px-3 py-2.5 sm:px-4">
                                    <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-strong">
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-sport-500 text-xs font-bold text-[var(--text-on-sport)]">
                                            {plan.day_of_week}
                                        </span>
                                        <span className="truncate">
                                            Día {plan.day_of_week}: {plan.title}
                                        </span>
                                    </h3>
                                    <Badge tone="neutral" variant="soft" size="sm" className="shrink-0">
                                        {blocks.length} ejercicios
                                    </Badge>
                                </div>
                                <div className="divide-y divide-[var(--border-subtle)]">
                                    {buildLibrarySections(rows, areas).map((section) => {
                                        return (
                                            <div key={section.key} className="space-y-0">
                                                <div
                                                    className={cn(
                                                        'flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-1.5 text-[11px] font-semibold sm:px-4',
                                                        section.className,
                                                    )}
                                                >
                                                    <span className="rounded border border-current/30 bg-[var(--surface-card)]/40 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest">
                                                        {section.short}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        {section.icon}
                                                        {section.label}
                                                    </span>
                                                </div>
                                                <div className="space-y-2 bg-[var(--surface-card)]/20 px-2 py-2 sm:px-3">
                                                    {section.groups.map((group) => (
                                                        <div
                                                            key={group.key}
                                                            className={cn(
                                                                'overflow-hidden rounded-card border border-transparent',
                                                                group.type === 'superset' &&
                                                                    'border-[var(--sport-300)]/45 border-l-[3px] border-l-[var(--sport-500)] bg-[var(--sport-100)]/50',
                                                            )}
                                                        >
                                                            {group.type === 'superset' && (
                                                                <div className="border-b border-[var(--sport-300)]/30 bg-[var(--sport-100)]/40 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--sport-700)]">
                                                                    Superserie {group.supersetLetter ?? '?'} · {group.blocks.length} ejercicios
                                                                </div>
                                                            )}
                                                            <div
                                                                className={cn(
                                                                    'divide-y divide-[var(--border-subtle)]',
                                                                    group.type === 'superset' && 'rounded-b-card',
                                                                )}
                                                            >
                                                                {group.blocks.map((block, bi) => (
                                                                    <div key={block.id}>
                                                                        {renderLibraryExerciseRow(
                                                                            block,
                                                                            group.type === 'superset'
                                                                                ? `${group.supersetLetter ?? '?'}${bi + 1}`
                                                                                : undefined,
                                                                        )}
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
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

const shellDialogClass =
    'flex w-full max-w-none flex-col gap-0 overflow-hidden border-subtle bg-surface-app p-0 text-body shadow-xl sm:max-w-2xl md:max-h-[min(92vh,800px)] max-md:fixed max-md:inset-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0'

const shellSheetClass =
    'flex data-[side=bottom]:h-[min(92dvh,720px)] max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-sheet border-subtle bg-surface-app p-0 text-body shadow-lg'

/** Stat-tile sunken del preview (eva-app ProgramPreviewSheet · stat). */
function PreviewStat({ value, label }: { value: number; label: string }) {
    return (
        <div className="flex-1 rounded-control bg-surface-sunken px-2 py-2.5 text-center">
            <div className="eva-metric text-lg leading-tight text-strong">{value}</div>
            <div className="mt-px text-[10.5px] font-semibold text-muted">{label}</div>
        </div>
    )
}

export interface ProgramPreviewPanelProps {
    program: ProgramListModel | null
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Areas visibles del workspace activo — resuelve nombres de areas custom/extra (fallback legacy si falta). */
    areas?: WorkoutArea[]
    /** Acciones (diseño: hoja de vista previa con botonera). Opcionales: si faltan, sólo se muestra «Cerrar». */
    onEdit?: () => void
    onAssign?: () => void
    onDuplicate?: () => void
    onSync?: () => void
    onDelete?: () => void
}

function PreviewActions({
    program,
    onEdit,
    onAssign,
    onDuplicate,
    onSync,
    onDelete,
}: {
    program: ProgramListModel
    onEdit?: () => void
    onAssign?: () => void
    onDuplicate?: () => void
    onSync?: () => void
    onDelete?: () => void
}) {
    const isTemplate = !program.client_id
    const hasAny = onEdit || onAssign || onDuplicate || onSync || onDelete
    if (!hasAny) return null

    return (
        <div className="flex w-full flex-col gap-2.5">
            {isTemplate ? (
                onAssign && (
                    <Button type="button" variant="sport" size="lg" className="w-full gap-2" onClick={onAssign}>
                        <UserPlus className="size-[18px]" />
                        Asignar a alumnos
                    </Button>
                )
            ) : (
                onEdit && (
                    <Button type="button" variant="sport" size="lg" className="w-full gap-2" onClick={onEdit}>
                        <Pencil className="size-[18px]" />
                        Editar plan
                    </Button>
                )
            )}
            <div className="grid grid-cols-3 gap-2">
                {isTemplate
                    ? onEdit && (
                          <Button type="button" variant="secondary" className="h-auto flex-col gap-1.5 py-3" onClick={onEdit}>
                              <Pencil className="size-[18px] text-muted" />
                              <span className="text-xs font-bold">Editar</span>
                          </Button>
                      )
                    : program.source_template_id &&
                      onSync && (
                          <Button
                              type="button"
                              variant="secondary"
                              className="h-auto flex-col gap-1.5 py-3"
                              onClick={onSync}
                              title="Trae los últimos cambios de la plantilla base a este programa. Los ejercicios personalizados (override) se conservan."
                          >
                              <GitMerge className="size-[18px] text-muted" />
                              <span className="text-xs font-bold">Sincronizar</span>
                          </Button>
                      )}
                {onDuplicate && (
                    <Button type="button" variant="secondary" className="h-auto flex-col gap-1.5 py-3" onClick={onDuplicate}>
                        <Copy className="size-[18px] text-muted" />
                        <span className="text-xs font-bold">Duplicar</span>
                    </Button>
                )}
                {onDelete && (
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-auto flex-col gap-1.5 py-3 text-[var(--danger-600)] hover:bg-[var(--danger-100)] hover:text-[var(--danger-600)]"
                        onClick={onDelete}
                    >
                        <Trash2 className="size-[18px] text-[var(--danger-500)]" />
                        <span className="text-xs font-bold">Eliminar</span>
                    </Button>
                )}
            </div>
        </div>
    )
}

export function ProgramPreviewPanel({
    program,
    open,
    onOpenChange,
    areas = [],
    onEdit,
    onAssign,
    onDuplicate,
    onSync,
    onDelete,
}: ProgramPreviewPanelProps) {
    const isDesktop = useIsDesktopMd()

    if (!program) return null

    const hasActions = !!(onEdit || onAssign || onDuplicate || onSync || onDelete)

    const stats = getProgramStats(program)
    const progress = program.client_id ? assignedProgress(program) : null
    const clientName = program.client?.full_name

    const header = (
        <div className="shrink-0 space-y-3.5 border-b border-subtle px-4 py-4 sm:px-6">
            {/* Identidad — tile 52px + nombre display + badge de estado + cliente (kit ProgramPreviewSheet) */}
            <div className="flex items-center gap-3">
                <div className="flex size-[52px] shrink-0 items-center justify-center rounded-card bg-[var(--sport-100)] text-[var(--sport-600)]">
                    <Dumbbell className="size-[25px]" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[19px] font-extrabold leading-[1.15] tracking-[-0.01em] text-strong">
                        {program.name}
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                        <StatusBadge program={program} />
                        {clientName && (
                            <span className="truncate text-[12.5px] text-muted">· {clientName}</span>
                        )}
                    </div>
                </div>
            </div>
            {/* Strip de stats sunken */}
            <div className="flex gap-2">
                <PreviewStat value={stats.daysWithWork} label="días" />
                <PreviewStat value={program.weeks_to_repeat} label="semanas" />
                {progress ? (
                    <PreviewStat value={progress.curWeek} label="sem. actual" />
                ) : (
                    <PreviewStat value={stats.blockCount} label="bloques" />
                )}
            </div>
            {/* Progreso del plan (solo asignados con fecha de inicio) */}
            {progress && (
                <div>
                    <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted">Progreso del plan</span>
                        <span className="eva-mono text-xs font-bold text-strong">{progress.pct}%</span>
                    </div>
                    <div className="h-[7px] overflow-hidden rounded-full bg-surface-sunken">
                        <div
                            className={cn(
                                'h-full rounded-full',
                                program.is_active ? 'bg-[var(--success-500)]' : 'bg-[var(--ink-300)]'
                            )}
                            style={{ width: `${progress.pct}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    )

    const footer = hasActions ? (
        <PreviewActions
            program={program}
            onEdit={onEdit}
            onAssign={onAssign}
            onDuplicate={onDuplicate}
            onSync={onSync}
            onDelete={onDelete}
        />
    ) : (
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
                    {/* Columna acotada: header fijo arriba, cuerpo scrolleable, footer fijo.
                        El wrapper interno de DialogContent es un `block` sin altura, así que
                        el layout de scroll se controla acá con max-h propio. */}
                    <div className="flex min-h-0 max-h-[min(92vh,800px)] flex-1 flex-col overflow-hidden">
                        {header}
                        <ProgramPreviewBody program={program} areas={areas} />
                        <DialogFooter className="m-0 shrink-0 border-t border-subtle bg-surface-sunken/30 px-4 py-3 sm:px-6">
                            {footer}
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" showCloseButton={false} className={shellSheetClass}>
                <div
                    className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]"
                    aria-hidden="true"
                />
                <SheetHeader className="shrink-0 border-0 bg-surface-app p-0">
                    <SheetTitle className="sr-only">Vista previa de {program.name}</SheetTitle>
                    {header}
                </SheetHeader>
                <ProgramPreviewBody program={program} areas={areas} />
                <SheetFooter className="shrink-0 border-subtle bg-surface-sunken/30">{footer}</SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
