'use client'

import { Calendar, ChevronRight, Dumbbell, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ProgramListModel } from '../libraryStats'
import { getProgramStats } from '../libraryStats'

export interface ProgramRowProps {
    program: ProgramListModel
    /** Abre la vista previa (hoja en móvil / diálogo en desktop) con las acciones. */
    onOpen: () => void
    isSelected?: boolean
}

/** Progreso real del plan asignado a partir de start_date + weeks_to_repeat. */
function assignedProgress(p: ProgramListModel): { curWeek: number; weeks: number; pct: number } | null {
    const weeks = p.weeks_to_repeat || 0
    if (!p.start_date || weeks <= 0) return null
    const start = new Date(p.start_date).getTime()
    if (Number.isNaN(start)) return null
    const diffWeeks = Math.floor((Date.now() - start) / (7 * 24 * 60 * 60 * 1000))
    const curWeek = Math.min(Math.max(diffWeeks + 1, 1), weeks)
    return { curWeek, weeks, pct: Math.round((curWeek / weeks) * 100) }
}

function StatusBadge({ program }: { program: ProgramListModel }) {
    const isTemplate = !program.client_id
    if (isTemplate) {
        return (
            <Badge tone="sport" variant="soft" size="sm" className="shrink-0">
                Plantilla
            </Badge>
        )
    }
    return program.is_active ? (
        <Badge tone="success" variant="soft" size="sm" dot className="shrink-0">
            Activo
        </Badge>
    ) : (
        <Badge tone="neutral" variant="soft" size="sm" className="shrink-0">
            Inactivo
        </Badge>
    )
}

/** Tarjeta horizontal — diseño móvil (eva-app ProgramasHome). */
export function ProgramRow({ program, onOpen, isSelected }: ProgramRowProps) {
    const stats = getProgramStats(program)
    const isTemplate = !program.client_id
    const clientName = program.client?.full_name
    const progress = !isTemplate ? assignedProgress(program) : null

    return (
        <div
            className={cn(
                'overflow-hidden rounded-card border border-subtle bg-surface-card shadow-sm transition-[box-shadow,border-color]',
                'hover:border-[var(--sport-300)] hover:shadow-md',
                isSelected && 'border-[var(--sport-300)] ring-2 ring-[var(--focus-ring)] ring-offset-2 ring-offset-[var(--surface-app)]'
            )}
        >
            <button
                type="button"
                onClick={onOpen}
                className="flex w-full items-center gap-3 px-3 py-3 text-left focus-visible:outline-none"
            >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[var(--sport-100)] text-[var(--sport-600)]">
                    <Dumbbell className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold text-strong">{program.name}</div>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                        <StatusBadge program={program} />
                        {clientName && (
                            <span className="truncate text-xs text-muted">· {clientName}</span>
                        )}
                    </div>
                    {progress ? (
                        <div className="mt-2">
                            <div className="mb-1 flex items-center justify-between">
                                <span className="font-mono text-[11px] text-muted">
                                    {stats.daysWithWork} días · {program.weeks_to_repeat} sem
                                </span>
                                <span className="font-mono text-[11px] font-bold text-strong">
                                    Sem {progress.curWeek}/{progress.weeks}
                                </span>
                            </div>
                            <div className="h-[5px] overflow-hidden rounded-full bg-surface-sunken">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-[width]',
                                        program.is_active ? 'bg-[var(--success-500)]' : 'bg-[var(--ink-300)]'
                                    )}
                                    style={{ width: `${progress.pct}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11.5px] text-muted">
                            <span>
                                <b className="text-strong">{stats.daysWithWork}</b> días
                            </span>
                            <span>
                                <b className="text-strong">{program.weeks_to_repeat}</b> sem
                            </span>
                            <span>
                                <b className="text-strong">{stats.blockCount}</b> bloques
                            </span>
                        </div>
                    )}
                </div>
                <ChevronRight className="size-[18px] shrink-0 text-[var(--ink-300)]" />
            </button>
        </div>
    )
}

/**
 * Badge de la tarjeta desktop — .dt-progcard-badge (pill 10px/800 uppercase, sport).
 * El diseño muestra siempre "Plantilla"; aquí varía el tono por estado real del programa.
 */
function CardBadge({ program }: { program: ProgramListModel }) {
    const base =
        'rounded-pill px-2 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.04em]'
    if (!program.client_id) {
        return <span className={cn(base, 'bg-[var(--sport-100)] text-[var(--sport-700)]')}>Plantilla</span>
    }
    return program.is_active ? (
        <span className={cn(base, 'bg-[var(--success-100)] text-[var(--success-700)]')}>Activo</span>
    ) : (
        <span className={cn(base, 'bg-surface-sunken text-muted')}>Inactivo</span>
    )
}

/** Tarjeta vertical — diseño desktop (eva-desktop DesktopPrograms · .dt-progcard). */
export function ProgramCard({ program, onOpen, isSelected }: ProgramRowProps) {
    const stats = getProgramStats(program)
    const isTemplate = !program.client_id
    // El diseño usa p.focus (taxonomía de objetivo); la data real no la expone →
    // mostramos el alumno (asignado) o un descriptor de plantilla en la misma línea.
    const focusLine = program.client?.full_name ?? (isTemplate ? 'Plantilla reutilizable' : 'Programa')

    return (
        <button
            type="button"
            onClick={onOpen}
            className={cn(
                // .dt-progcard
                'eva-press flex flex-col gap-[7px] rounded-card border border-subtle bg-surface-card p-4 text-left shadow-[var(--shadow-sm)] transition-[transform,box-shadow] duration-[140ms] ease-[var(--ease-out)]',
                'hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-none',
                isSelected && '-translate-y-0.5 shadow-[var(--shadow-md)] ring-2 ring-[var(--focus-ring)]'
            )}
        >
            {/* .dt-progcard-top */}
            <div className="mb-1 flex items-center justify-between">
                {/* .dt-progcard-ico (40px · radius-md) */}
                <span className="flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--sport-100)] text-[var(--sport-600)]">
                    <Dumbbell className="size-5" />
                </span>
                <CardBadge program={program} />
            </div>
            {/* .dt-progcard-name */}
            <div className="font-display text-base font-extrabold leading-[1.2] tracking-[-0.01em] text-strong">
                {program.name}
            </div>
            {/* .dt-progcard-focus */}
            <div className="truncate text-[12.5px] text-muted">{focusLine}</div>
            {/* .dt-progcard-meta */}
            <div className="mt-2 flex flex-wrap gap-3 border-t border-subtle pt-3">
                <span className="inline-flex items-center gap-[5px] text-xs font-semibold text-subtle">
                    <Calendar className="size-3.5" /> {program.weeks_to_repeat} sem
                </span>
                <span className="inline-flex items-center gap-[5px] text-xs font-semibold text-subtle">
                    <Layers className="size-3.5" /> {stats.daysWithWork} días
                </span>
                <span className="inline-flex items-center gap-[5px] text-xs font-semibold text-subtle">
                    <Dumbbell className="size-3.5" /> {stats.blockCount}
                </span>
            </div>
        </button>
    )
}
