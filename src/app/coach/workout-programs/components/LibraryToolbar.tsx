'use client'

import { useState } from 'react'
import { Filter, LayoutGrid, List as ListIcon, Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { LibraryFilters } from '../libraryStats'

export interface LibraryToolbarProps {
    search: string
    onSearchChange: (v: string) => void
    filterType: LibraryFilters['filterType']
    onFilterTypeChange: (v: LibraryFilters['filterType']) => void
    filterStatus: LibraryFilters['filterStatus']
    onFilterStatusChange: (v: LibraryFilters['filterStatus']) => void
    filterStructure: LibraryFilters['filterStructure']
    onFilterStructureChange: (v: LibraryFilters['filterStructure']) => void
    filterHasPhases: LibraryFilters['filterHasPhases']
    onFilterHasPhasesChange: (v: LibraryFilters['filterHasPhases']) => void
    viewMode: 'comfortable' | 'compact'
    onViewModeChange: (v: 'comfortable' | 'compact') => void
    className?: string
}

function filterStatusLabel(v: LibraryFilters['filterStatus']) {
    if (v === 'all') return 'Estado: todos'
    if (v === 'active') return 'Activos'
    return 'Inactivos'
}

function filterStructureLabel(v: LibraryFilters['filterStructure']) {
    if (v === 'all') return 'Estructura: todas'
    if (v === 'weekly') return 'Semanal'
    return 'Ciclo'
}

function filterPhasesLabel(v: LibraryFilters['filterHasPhases']) {
    if (v === 'all') return 'Fases: todas'
    if (v === 'with') return 'Con fases'
    return 'Sin fases'
}

function FiltersForm({
    filterStatus,
    onFilterStatusChange,
    filterStructure,
    onFilterStructureChange,
    filterHasPhases,
    onFilterHasPhasesChange,
    className,
}: Pick<
    LibraryToolbarProps,
    | 'filterStatus'
    | 'onFilterStatusChange'
    | 'filterStructure'
    | 'onFilterStructureChange'
    | 'filterHasPhases'
    | 'onFilterHasPhasesChange'
> & { className?: string }) {
    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Estado</span>
                <Select value={filterStatus} onValueChange={(v) => onFilterStatusChange(v as LibraryFilters['filterStatus'])}>
                    <SelectTrigger className="h-10 w-full bg-background">
                        <SelectValue>{filterStatusLabel(filterStatus)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Estado: todos</SelectItem>
                        <SelectItem value="active">Activos</SelectItem>
                        <SelectItem value="inactive">Inactivos</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Estructura</span>
                <Select
                    value={filterStructure}
                    onValueChange={(v) => onFilterStructureChange(v as LibraryFilters['filterStructure'])}
                >
                    <SelectTrigger className="h-10 w-full bg-background">
                        <SelectValue>{filterStructureLabel(filterStructure)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Estructura: todas</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="cycle">Ciclo</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Fases</span>
                <Select
                    value={filterHasPhases}
                    onValueChange={(v) => onFilterHasPhasesChange(v as LibraryFilters['filterHasPhases'])}
                >
                    <SelectTrigger className="h-10 w-full bg-background">
                        <SelectValue>{filterPhasesLabel(filterHasPhases)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Fases: todas</SelectItem>
                        <SelectItem value="with">Con fases</SelectItem>
                        <SelectItem value="without">Sin fases</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}

const segmentedTabsListClass =
    'h-11 w-full justify-start gap-0.5 overflow-x-auto rounded-full border border-border/50 bg-muted/35 p-1 shadow-inner [-ms-overflow-style:none] [scrollbar-width:none] dark:bg-muted/20 [&::-webkit-scrollbar]:hidden'

const segmentedTabsTriggerClass =
    'shrink-0 rounded-full border-0 px-3.5 py-2 text-xs font-semibold shadow-none after:hidden sm:px-4 sm:text-sm data-active:bg-primary/12 data-active:text-foreground dark:data-active:bg-primary/20'

export function LibraryToolbar({
    search,
    onSearchChange,
    filterType,
    onFilterTypeChange,
    filterStatus,
    onFilterStatusChange,
    filterStructure,
    onFilterStructureChange,
    filterHasPhases,
    onFilterHasPhasesChange,
    viewMode,
    onViewModeChange,
    className,
}: LibraryToolbarProps) {
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por programa o alumno…"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-11 rounded-full border-border/50 bg-background/90 pl-10 text-base shadow-sm placeholder:text-muted-foreground/80 md:text-sm dark:bg-background/60"
                        aria-label="Buscar programas"
                    />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11 shrink-0 gap-2 rounded-full border-border/50 px-3 shadow-sm md:hidden"
                        onClick={() => setMobileFiltersOpen(true)}
                    >
                        <SlidersHorizontal className="size-4" />
                        Filtros
                    </Button>
                    <Popover>
                        <PopoverTrigger
                            type="button"
                            className="hidden h-11 shrink-0 items-center gap-2 rounded-full border border-border/50 bg-background/90 px-4 text-sm font-medium text-foreground shadow-sm hover:bg-muted/50 md:inline-flex dark:bg-background/60"
                        >
                            <Filter className="size-4 shrink-0" />
                            Filtros
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-[min(100vw-2rem,320px)] border-border bg-popover p-4"
                            align="end"
                        >
                            <FiltersForm
                                filterStatus={filterStatus}
                                onFilterStatusChange={onFilterStatusChange}
                                filterStructure={filterStructure}
                                onFilterStructureChange={onFilterStructureChange}
                                filterHasPhases={filterHasPhases}
                                onFilterHasPhasesChange={onFilterHasPhasesChange}
                            />
                        </PopoverContent>
                    </Popover>
                    <div className="flex items-center rounded-full border border-border/50 bg-muted/35 p-1 shadow-inner dark:bg-muted/20">
                        <Button
                            type="button"
                            variant={viewMode === 'comfortable' ? 'secondary' : 'ghost'}
                            size="icon"
                            className="size-9 shrink-0 rounded-full"
                            onClick={() => onViewModeChange('comfortable')}
                            title="Vista cómoda"
                        >
                            <LayoutGrid className="size-4" />
                        </Button>
                        <Button
                            type="button"
                            variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
                            size="icon"
                            className="size-9 shrink-0 rounded-full"
                            onClick={() => onViewModeChange('compact')}
                            title="Vista compacta"
                        >
                            <ListIcon className="size-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs
                value={filterType}
                onValueChange={(val) => onFilterTypeChange(val as LibraryFilters['filterType'])}
                className="w-full"
            >
                <TabsList className={segmentedTabsListClass}>
                    <TabsTrigger value="all" className={segmentedTabsTriggerClass}>
                        Todos
                    </TabsTrigger>
                    <TabsTrigger value="templates" className={segmentedTabsTriggerClass}>
                        Plantillas
                    </TabsTrigger>
                    <TabsTrigger value="assigned" className={segmentedTabsTriggerClass}>
                        En curso
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetContent
                    side="bottom"
                    showCloseButton
                    className="max-h-[min(85dvh,560px)] rounded-t-2xl border-border bg-background text-foreground shadow-lg [&_[data-slot=sheet-close]]:border-border [&_[data-slot=sheet-close]]:bg-muted/40 [&_[data-slot=sheet-close]]:text-foreground"
                >
                    <SheetHeader className="border-0 bg-background px-6 pt-2">
                        <SheetTitle className="font-semibold normal-case tracking-normal text-foreground">
                            Filtros
                        </SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto px-6 pb-2">
                        <FiltersForm
                            filterStatus={filterStatus}
                            onFilterStatusChange={onFilterStatusChange}
                            filterStructure={filterStructure}
                            onFilterStructureChange={onFilterStructureChange}
                            filterHasPhases={filterHasPhases}
                            onFilterHasPhasesChange={onFilterHasPhasesChange}
                        />
                    </div>
                    <SheetFooter className="border-border bg-background">
                        <Button type="button" className="w-full" onClick={() => setMobileFiltersOpen(false)}>
                            Listo
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    )
}
