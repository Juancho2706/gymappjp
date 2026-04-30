'use client'

import { useEffect, useRef } from 'react'
import {
    Search,
    SlidersHorizontal,
    ArrowUpDown,
    LayoutGrid,
    Table2,
    X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { glassButtonVariants } from '@/components/ui/glass-button'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary transition-colors hover:bg-primary/20"
            style={{ color: 'var(--theme-primary)', borderColor: 'color-mix(in srgb, var(--theme-primary) 25%, transparent)' }}
        >
            {label}
            <X className="w-3 h-3 opacity-70" />
        </button>
    )
}

interface DirectoryActionBarProps {
    className?: string
    search: string
    onSearchChange: (v: string) => void
    sortKey: DirectorySortKey
    onSortChange: (v: DirectorySortKey) => void
    view: 'grid' | 'table'
    onViewChange: (v: 'grid' | 'table') => void
    statusFilter: StatusDirectoryFilter
    onStatusFilterChange: (v: StatusDirectoryFilter) => void
    programFilter: ProgramDirectoryFilter
    onProgramFilterChange: (v: ProgramDirectoryFilter) => void
    riskFilter: DirectoryRiskFilter
    onRiskFilterChange: (v: DirectoryRiskFilter) => void
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
}: DirectoryActionBarProps) {
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                inputRef.current?.focus()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const chips: { key: string; label: string; onRemove: () => void }[] = []

    if (riskFilter === 'urgent') {
        chips.push({
            key: 'risk-urgent',
            label: 'Atención urgente',
            onRemove: () => onRiskFilterChange('all'),
        })
    } else if (riskFilter === 'review') {
        chips.push({
            key: 'risk-review',
            label: 'En revisión',
            onRemove: () => onRiskFilterChange('all'),
        })
    } else if (riskFilter === 'on_track') {
        chips.push({
            key: 'risk-ontrack',
            label: 'On track',
            onRemove: () => onRiskFilterChange('all'),
        })
    } else if (riskFilter === 'expired_program') {
        chips.push({
            key: 'risk-exp',
            label: 'Programa vencido',
            onRemove: () => onRiskFilterChange('all'),
        })
    } else if (riskFilter === 'password_reset') {
        chips.push({
            key: 'risk-pw',
            label: 'Pendiente sync',
            onRemove: () => onRiskFilterChange('all'),
        })
    } else if (riskFilter === 'nutrition_low') {
        chips.push({
            key: 'risk-nutri',
            label: 'Nutrición baja',
            onRemove: () => onRiskFilterChange('all'),
        })
    }

    if (statusFilter === 'active') {
        chips.push({
            key: 'st-active',
            label: 'Activo',
            onRemove: () => onStatusFilterChange('any'),
        })
    } else if (statusFilter === 'paused') {
        chips.push({
            key: 'st-paused',
            label: 'Pausado',
            onRemove: () => onStatusFilterChange('any'),
        })
    } else if (statusFilter === 'pending_sync') {
        chips.push({
            key: 'st-sync',
            label: 'Pendiente sync',
            onRemove: () => onStatusFilterChange('any'),
        })
    }

    if (programFilter === 'with_program') {
        chips.push({
            key: 'pr-with',
            label: 'Con programa',
            onRemove: () => onProgramFilterChange('any'),
        })
    } else if (programFilter === 'no_program') {
        chips.push({
            key: 'pr-no',
            label: 'Sin programa',
            onRemove: () => onProgramFilterChange('any'),
        })
    } else if (programFilter === 'expired') {
        chips.push({
            key: 'pr-ex',
            label: 'Programa vencido',
            onRemove: () => onProgramFilterChange('any'),
        })
    }

    const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? sortKey

    return (
        <div
            className={cn(
                'sticky top-0 z-10 mx-0 w-full max-w-full min-w-0 rounded-2xl border border-border/60 bg-background/75 px-3 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/70 sm:px-4',
                className
            )}
        >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        ref={inputRef}
                        placeholder="Buscar alumno... (⌘K)"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-11 rounded-xl border-border/50 bg-white/60 pl-10 pr-14 text-sm dark:bg-white/[0.04]"
                    />
                    <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground sm:inline">
                        ⌘K
                    </kbd>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger
                            type="button"
                            className={cn(
                                glassButtonVariants({ variant: 'outline', size: 'default' }),
                                'h-11 gap-2 rounded-xl px-4 text-[10px] font-black tracking-widest'
                            )}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            Filtros
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="min-w-[14rem] w-[min(100vw-2rem,20rem)] rounded-xl"
                            align="start"
                        >
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest">
                                    Estado
                                </DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => onStatusFilterChange('active')}>
                                    Activo
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onStatusFilterChange('paused')}>
                                    Pausado
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onStatusFilterChange('pending_sync')}>
                                    Pendiente Sync
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest">
                                    Riesgo
                                </DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => onRiskFilterChange('urgent')}>
                                    Atención Urgente
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onRiskFilterChange('review')}>
                                    En Riesgo
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onRiskFilterChange('on_track')}>
                                    On Track
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onRiskFilterChange('nutrition_low')}>
                                    {'Nutrición baja (<60%)'}
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest">
                                    Programa
                                </DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => onProgramFilterChange('with_program')}>
                                    Con Programa
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onProgramFilterChange('no_program')}>
                                    Sin Programa
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onProgramFilterChange('expired')}>
                                    Vencido
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger
                            type="button"
                            className={cn(
                                glassButtonVariants({ variant: 'outline', size: 'default' }),
                                'h-11 max-w-[220px] gap-2 truncate rounded-xl px-4 text-[10px] font-black tracking-widest'
                            )}
                        >
                            <ArrowUpDown className="h-4 w-4 shrink-0" />
                            <span className="truncate">{currentSortLabel}</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="min-w-[14rem] w-[min(100vw-2rem,20rem)] rounded-xl"
                            align="start"
                        >
                            <DropdownMenuGroup>
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest">
                                    Ordenar
                                </DropdownMenuLabel>
                                {SORT_OPTIONS.map((opt) => (
                                    <DropdownMenuItem
                                        key={opt.value}
                                        onClick={() => onSortChange(opt.value)}
                                        className={sortKey === opt.value ? 'bg-primary/10' : ''}
                                    >
                                        {opt.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex rounded-xl border border-border/50 p-0.5 dark:border-white/10">
                        <button
                            type="button"
                            onClick={() => onViewChange('grid')}
                            className={cn(
                                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                                view === 'grid' ?
                                    'bg-primary/15 text-primary'
                                :   'text-muted-foreground hover:bg-white/50 dark:hover:bg-white/5'
                            )}
                            aria-label="Vista cuadrícula"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewChange('table')}
                            className={cn(
                                'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                                view === 'table' ?
                                    'bg-primary/15 text-primary'
                                :   'text-muted-foreground hover:bg-white/50 dark:hover:bg-white/5'
                            )}
                            aria-label="Vista tabla"
                        >
                            <Table2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {chips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3 dark:border-white/10">
                    {chips.map((c) => (
                        <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />
                    ))}
                </div>
            )}
        </div>
    )
}
