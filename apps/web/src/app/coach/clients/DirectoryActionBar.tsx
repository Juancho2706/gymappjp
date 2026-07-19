'use client'

import { useState } from 'react'
import {
    Search,
    SlidersHorizontal,
    ArrowUpDown,
    LayoutGrid,
    ListChecks,
    Table2,
    Check,
    X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type {
    DirectoryRiskFilter,
    DirectorySortKey,
    ProgramDirectoryFilter,
    StatusDirectoryFilter,
} from './directory-types'
import { SORT_OPTIONS } from './directory-types'

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-pill bg-[var(--ink-950)] pl-3 pr-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
            {label}
            <X className="h-[13px] w-[13px] opacity-70" />
        </button>
    )
}

// dirBarBtn del diseño: botón cuadrado 48px icon-only, borde 1.5, activo = relleno ink.
function BarButton({
    active,
    label,
    onClick,
    children,
}: {
    active?: boolean
    label: string
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={cn(
                'eva-press relative inline-flex size-12 shrink-0 items-center justify-center rounded-control border-[1.5px]',
                active
                    ? 'border-[var(--text-strong)] bg-[var(--text-strong)] text-[var(--surface-card)]'
                    : 'border-default bg-surface-card text-strong'
            )}
        >
            {children}
        </button>
    )
}

// Fila de check del sheet de filtros (DirFiltersMenu del diseño): check sport-600 +
// fondo sunken en la opción activa.
function SheetCheckRow({
    label,
    active,
    badge,
    onClick,
}: {
    label: string
    active: boolean
    badge?: number
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-left',
                active ? 'bg-surface-sunken' : 'bg-transparent'
            )}
        >
            <span className="inline-flex w-4 shrink-0 text-sport-600">
                {active && <Check className="h-[15px] w-[15px]" />}
            </span>
            <span className={cn('flex-1 text-[13.5px] text-strong', active ? 'font-bold' : 'font-medium')}>
                {label}
            </span>
            {badge != null && badge > 0 && (
                <span className="rounded-pill bg-surface-sunken px-[7px] py-px text-[11px] font-bold text-subtle">
                    {badge}
                </span>
            )}
        </button>
    )
}

function SheetGroupLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="px-3 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-subtle">
            {children}
        </div>
    )
}

interface DirectoryActionBarProps {
    className?: string
    search: string
    onSearchChange: (v: string) => void
    sortKey: DirectorySortKey
    onSortChange: (v: DirectorySortKey) => void
    view: 'cards' | 'table'
    onViewChange: (v: 'cards' | 'table') => void
    statusFilter: StatusDirectoryFilter
    onStatusFilterChange: (v: StatusDirectoryFilter) => void
    programFilter: ProgramDirectoryFilter
    onProgramFilterChange: (v: ProgramDirectoryFilter) => void
    riskFilter: DirectoryRiskFilter
    onRiskFilterChange: (v: DirectoryRiskFilter) => void
    archivedCount?: number
    resultCount: number
    selectMode: boolean
    onToggleSelectMode: () => void
}

export function DirectoryActionBar({
    className,
    search,
    onSearchChange,
    sortKey,
    onSortChange,
    view,
    onViewChange,
    statusFilter,
    onStatusFilterChange,
    programFilter,
    onProgramFilterChange,
    riskFilter,
    onRiskFilterChange,
    archivedCount = 0,
    resultCount,
    selectMode,
    onToggleSelectMode,
}: DirectoryActionBarProps) {
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [sortOpen, setSortOpen] = useState(false)

    const riskLabels: Partial<Record<DirectoryRiskFilter, string>> = {
        urgent: 'Atención urgente',
        review: 'En riesgo',
        on_track: 'On track',
        expired_program: 'Programa vencido',
        password_reset: 'Pendiente sync',
        nutrition_low: 'Nutrición baja',
    }
    const statusLabels: Partial<Record<StatusDirectoryFilter, string>> = {
        active: 'Activo',
        paused: 'Pausado',
        pending_sync: 'Pendiente sync',
        archived: 'Archivados',
    }
    const programLabels: Partial<Record<ProgramDirectoryFilter, string>> = {
        with_program: 'Con programa',
        no_program: 'Sin programa',
        expired: 'Programa vencido',
    }

    const chips: { key: string; label: string; onRemove: () => void }[] = []
    if (riskFilter !== 'all') {
        chips.push({
            key: `risk-${riskFilter}`,
            label: riskLabels[riskFilter] ?? riskFilter,
            onRemove: () => onRiskFilterChange('all'),
        })
    }
    if (statusFilter !== 'any') {
        chips.push({
            key: `st-${statusFilter}`,
            label: statusLabels[statusFilter] ?? statusFilter,
            onRemove: () => onStatusFilterChange('any'),
        })
    }
    if (programFilter !== 'any') {
        chips.push({
            key: `pr-${programFilter}`,
            label: programLabels[programFilter] ?? programFilter,
            onRemove: () => onProgramFilterChange('any'),
        })
    }
    if (search) {
        chips.push({
            key: 'q',
            label: `“${search}”`,
            onRemove: () => onSearchChange(''),
        })
    }

    const clearAll = () => {
        onRiskFilterChange('all')
        onStatusFilterChange('any')
        onProgramFilterChange('any')
        onSearchChange('')
    }

    const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? sortKey

    return (
        <div className={cn('min-w-0 max-w-full space-y-2.5', className)}>
            {/* Action bar: búsqueda + Filtros · Orden · Vista (fila sin contenedor, diseño) */}
            <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input
                        placeholder="Buscar alumno…"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <BarButton active={chips.length > 0} label="Filtros" onClick={() => setFiltersOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4" />
                    {chips.length > 0 && (
                        <span className="absolute -right-[5px] -top-[5px] inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-pill border-2 border-[var(--surface-card)] bg-sport-500 px-1 text-[10px] font-extrabold text-white">
                            {chips.length}
                        </span>
                    )}
                </BarButton>
                <BarButton label="Ordenar" onClick={() => setSortOpen(true)}>
                    <ArrowUpDown className="h-4 w-4" />
                </BarButton>
                <BarButton
                    label={view === 'cards' ? 'Ver como tabla' : 'Ver como tarjetas'}
                    onClick={() => onViewChange(view === 'cards' ? 'table' : 'cards')}
                >
                    {view === 'cards' ? <Table2 className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                </BarButton>
                <BarButton
                    active={selectMode}
                    label={selectMode ? 'Salir de selección' : 'Seleccionar alumnos'}
                    onClick={onToggleSelectMode}
                >
                    <ListChecks className="h-4 w-4" />
                </BarButton>
            </div>

            {/* Chips de filtros activos (removibles) + Limpiar global */}
            {chips.length > 0 && (
                <div className="flex flex-wrap items-center gap-[7px]">
                    {chips.map((c) => (
                        <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />
                    ))}
                    <button
                        type="button"
                        onClick={clearAll}
                        className="text-[12.5px] font-bold text-muted underline"
                    >
                        Limpiar
                    </button>
                </div>
            )}

            {/* Conteo de resultados · orden activo */}
            <div className="pl-0.5 text-xs text-muted">
                {resultCount} {resultCount === 1 ? 'alumno' : 'alumnos'}
                {statusFilter === 'archived' ? ' archivados' : ''}{' '}
                <span className="text-[var(--border-strong)]">·</span>{' '}
                <span className="text-subtle">{currentSortLabel}</span>
            </div>

            {/* Bottom-sheet de filtros — patrón filter-sheet de Nutrición */}
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetContent
                    side="bottom"
                    showCloseButton
                    className="max-h-[min(85dvh,620px)] rounded-t-sheet border-subtle bg-surface-card text-body shadow-lg"
                >
                    <SheetHeader className="flex-row items-center justify-between border-0 bg-surface-card px-6 pt-2">
                        <SheetTitle className="font-display font-extrabold normal-case tracking-[-0.02em] text-strong">
                            Filtros
                        </SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-4 pb-2">
                        <SheetGroupLabel>Estado</SheetGroupLabel>
                        {(
                            [
                                { v: 'active', l: 'Activo' },
                                { v: 'paused', l: 'Pausado' },
                                { v: 'pending_sync', l: 'Pendiente sync' },
                                { v: 'archived', l: 'Archivados', badge: archivedCount },
                            ] as { v: StatusDirectoryFilter; l: string; badge?: number }[]
                        ).map((it) => (
                            <SheetCheckRow
                                key={it.v}
                                label={it.l}
                                badge={it.badge}
                                active={statusFilter === it.v}
                                onClick={() =>
                                    onStatusFilterChange(statusFilter === it.v ? 'any' : it.v)
                                }
                            />
                        ))}
                        <div className="my-1 h-px bg-[var(--border-subtle)]" />
                        <SheetGroupLabel>Riesgo</SheetGroupLabel>
                        {(
                            [
                                { v: 'urgent', l: 'Atención urgente' },
                                { v: 'review', l: 'En riesgo' },
                                { v: 'on_track', l: 'On track' },
                                { v: 'nutrition_low', l: 'Nutrición baja (<60%)' },
                            ] as { v: DirectoryRiskFilter; l: string }[]
                        ).map((it) => (
                            <SheetCheckRow
                                key={it.v}
                                label={it.l}
                                active={riskFilter === it.v}
                                onClick={() => onRiskFilterChange(riskFilter === it.v ? 'all' : it.v)}
                            />
                        ))}
                        <div className="my-1 h-px bg-[var(--border-subtle)]" />
                        <SheetGroupLabel>Programa</SheetGroupLabel>
                        {(
                            [
                                { v: 'with_program', l: 'Con programa' },
                                { v: 'no_program', l: 'Sin programa' },
                                { v: 'expired', l: 'Vencido' },
                            ] as { v: ProgramDirectoryFilter; l: string }[]
                        ).map((it) => (
                            <SheetCheckRow
                                key={it.v}
                                label={it.l}
                                active={programFilter === it.v}
                                onClick={() =>
                                    onProgramFilterChange(programFilter === it.v ? 'any' : it.v)
                                }
                            />
                        ))}
                    </div>
                    <SheetFooter className="border-subtle bg-surface-card">
                        <Button type="button" variant="sport" className="w-full" onClick={() => setFiltersOpen(false)}>
                            Ver resultados
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* Bottom-sheet de orden */}
            <Sheet open={sortOpen} onOpenChange={setSortOpen}>
                <SheetContent
                    side="bottom"
                    showCloseButton
                    className="max-h-[min(85dvh,520px)] rounded-t-sheet border-subtle bg-surface-card text-body shadow-lg"
                >
                    <SheetHeader className="flex-row items-center justify-between border-0 bg-surface-card px-6 pt-2">
                        <SheetTitle className="font-display font-extrabold normal-case tracking-[-0.02em] text-strong">
                            Ordenar por
                        </SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-4 pb-6">
                        {SORT_OPTIONS.map((opt) => (
                            <SheetCheckRow
                                key={opt.value}
                                label={opt.label}
                                active={sortKey === opt.value}
                                onClick={() => {
                                    onSortChange(opt.value)
                                    setSortOpen(false)
                                }}
                            />
                        ))}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
