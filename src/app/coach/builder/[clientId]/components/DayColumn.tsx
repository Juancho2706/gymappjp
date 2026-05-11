'use client'

import React, { useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Edit2, Search, Copy, Moon, Sun, Link2, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getMuscleColor } from '../muscle-colors'
import { cn, filterExercises } from '@/lib/utils'
import { ExerciseBlock } from './ExerciseBlock'
import { DAYS_OF_WEEK } from '../hooks/usePlanBuilder'
import type { BuilderBlock, BuilderSection, DayState } from '../types'
import type { Tables } from '@/lib/database.types'

type Exercise = Tables<'exercises'>

function normSection(b: BuilderBlock): BuilderSection {
    return b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main'
}

function SectionDropZone({
    dayId,
    section,
    label,
    showDropHint = true,
}: {
    dayId: number
    section: BuilderSection
    label: string
    showDropHint?: boolean
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: `section-${dayId}-${section}`,
        data: { type: 'section', dayId, section },
    })
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded-lg border border-dashed mb-1 transition-colors select-none',
                section === 'warmup' &&
                    'border-amber-500/45 bg-amber-500/[0.07] text-amber-950/85 dark:text-amber-100/90',
                section === 'main' && 'border-border/80 bg-muted/15 text-muted-foreground/85',
                section === 'cooldown' &&
                    'border-sky-500/45 bg-sky-500/[0.07] text-sky-950/85 dark:text-sky-100/90',
                isOver && 'border-primary bg-primary/10 text-primary ring-1 ring-primary/25',
            )}
        >
            {label}
            {showDropHint && (
                <span className="font-normal normal-case opacity-60 ml-1">· soltar</span>
            )}
        </div>
    )
}

interface DayColumnProps {
    day: DayState
    exercises: Exercise[]
    allDays?: DayState[]
    isCycleMode?: boolean
    isDragPending?: boolean
    onAddExercise: (dayId: number, exercise: Exercise) => void
    onEditBlock: (block: BuilderBlock) => void
    onRemoveBlock: (dayId: number, uid: string) => void
    onUpdateBlock: (block: BuilderBlock) => void
    onUpdateTitle: (dayId: number, title: string) => void
    onCopyDay: (sourceId: number, targets: number[]) => void
    onToggleRest: (dayId: number) => void
    onToggleSuperset: (dayId: number, uid: string) => void
    onSetBlockSection?: (dayId: number, uid: string, section: BuilderSection) => void
    onToggleBlockOverride?: (uid: string) => void
    templateLinked?: boolean
    /** Viewport estrecho (mismo criterio que md en Tailwind): microcopia sin arrastrar/soltar a secciones */
    narrowLayout?: boolean
    /** Modo simple móvil: oculta meta del día y reduce padding del header */
    compact?: boolean
}

function DayColumnInner({
    day,
    exercises,
    allDays,
    isCycleMode = false,
    isDragPending,
    onAddExercise,
    onEditBlock,
    onRemoveBlock,
    onUpdateBlock,
    onUpdateTitle,
    onCopyDay,
    onToggleRest,
    onToggleSuperset,
    onSetBlockSection,
    onToggleBlockOverride,
    templateLinked,
    narrowLayout = false,
    compact = false,
}: DayColumnProps) {
    const { id: dayId, title, blocks, name, is_rest } = day
    const dayLabel = isCycleMode ? `Día ${dayId}` : name

    const [search, setSearch] = useState('')
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [selectedDaysToCopy, setSelectedDaysToCopy] = useState<number[]>([])

    const totalSets = useMemo(() => blocks.reduce((sum, b) => sum + (b.sets || 0), 0), [blocks])
    const uniqueMuscles = useMemo(
        () => Array.from(new Set(blocks.map(b => b.muscle_group).filter(Boolean))),
        [blocks]
    )

    const filtered = useMemo(() => {
        if (!search) return []
        return filterExercises(exercises, search, 'Todos').slice(0, 5)
    }, [exercises, search])

    const { setNodeRef } = useDroppable({
        id: `day-${dayId}`,
        data: {
            type: 'day',
            dayId
        }
    })

    return (
        <div className={cn(
            'flex min-w-0 max-w-full flex-col h-full backdrop-blur-xl border border-border rounded-2xl overflow-hidden shadow-sm transition-colors duration-300',
            // Ancho fijo en desktop para que nombres largos hagan wrap y no estiren el tablero
            'w-full min-w-[200px] max-w-full md:w-[300px] md:max-w-[300px] md:flex-shrink-0 lg:w-[320px] lg:max-w-[320px]',
            is_rest
                ? 'bg-muted/30 dark:bg-muted/20'
                : 'bg-card dark:bg-card/80'
        )}>
            {!compact && (
            <div className={cn(
                'border-b border-border p-4',
                is_rest ? 'bg-muted/40' : 'bg-muted/30'
            )}>
                <div className={cn('flex items-center justify-between', compact ? 'mb-2' : 'mb-4')}>
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                        {dayLabel}
                        {is_rest && (
                            <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
                                DESCANSO
                            </span>
                        )}
                        {!is_rest && blocks.length > 0 && (
                            <Popover>
                                <PopoverTrigger className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors text-muted-foreground hover:text-foreground">
                                    <Copy className="w-3.5 h-3.5" />
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-3 bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl">
                                    <h4 className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground">Copiar a otro día</h4>
                                    <div className="space-y-2 mb-4">
                                        {(allDays || DAYS_OF_WEEK).map(d => d.id !== dayId && (
                                            <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1.5 rounded-md">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-border accent-primary"
                                                    checked={selectedDaysToCopy.includes(d.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedDaysToCopy(prev => [...prev, d.id])
                                                        else setSelectedDaysToCopy(prev => prev.filter(x => x !== d.id))
                                                    }}
                                                />
                                                <span className="font-medium text-xs">
                                                    {isCycleMode ? `Día ${d.id}` : (d as DayState).name || `Día ${d.id}`}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <Button
                                        size="sm"
                                        className="w-full text-xs font-bold uppercase tracking-widest"
                                        disabled={selectedDaysToCopy.length === 0}
                                        onClick={() => {
                                            onCopyDay(dayId, selectedDaysToCopy)
                                            setSelectedDaysToCopy([])
                                        }}
                                    >
                                        Copiar Bloques
                                    </Button>
                                </PopoverContent>
                            </Popover>
                        )}
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onToggleRest(dayId)}
                            title={is_rest ? 'Marcar como día activo' : 'Marcar como descanso'}
                            className={cn(
                                'p-1.5 rounded-lg transition-colors text-xs min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center',
                                is_rest
                                    ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20'
                                    : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-indigo-400'
                            )}
                        >
                            {is_rest ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                        </button>
                        {!is_rest && (
                            <Badge variant="outline" className="text-muted-foreground border-border font-bold">
                                {blocks.length} UNITS
                            </Badge>
                        )}
                    </div>
                </div>

                {!is_rest && (
                    <>
                        <div className={cn('relative group', compact ? 'mb-1' : 'mb-3')}>
                            <Edit2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                            <input
                                value={title}
                                onChange={(e) => onUpdateTitle(dayId, e.target.value)}
                                placeholder="TITULO DEL DIA (EJ: EMPUJE)"
                                maxLength={100}
                                autoComplete="off"
                                className="w-full h-9 pl-9 pr-3 text-[10px] font-bold uppercase tracking-widest rounded-lg bg-black/5 dark:bg-black/20 border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground text-[16px] md:text-[10px]"
                            />
                        </div>

                        {/* Contador de Volumen por Día */}
                        {!compact && (
                        <div className="flex items-center gap-2 flex-wrap mb-4">
                            <div className="flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-md border border-border shadow-sm">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Ej.</span>
                                <span className="text-[10px] font-bold text-foreground">{blocks.length}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-md border border-border shadow-sm">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Series</span>
                                <span className="text-[10px] font-bold text-foreground">{totalSets}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {uniqueMuscles.map(m => (
                                    <div key={m} className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: getMuscleColor(m) }} title={m} />
                                ))}
                            </div>
                        </div>
                        )}

                        {/* Búsqueda rápida — solo desktop */}
                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value)
                                    setIsSearchOpen(true)
                                }}
                                onFocus={() => setIsSearchOpen(true)}
                                placeholder="BUSCAR EJERCICIO..."
                                className="w-full h-11 pl-10 pr-4 text-[11px] font-bold uppercase tracking-widest rounded-xl bg-black/10 dark:bg-black/40 border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground"
                            />

                            {search && isSearchOpen && (
                                <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl overflow-hidden z-50">
                                    {filtered.length > 0 ? (
                                        <div className="py-2">
                                            <div className="px-3 pb-2 mb-2 border-b border-border text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                                                Resultados Rápidos
                                            </div>
                                            {filtered.map(ex => (
                                                <button
                                                    key={ex.id}
                                                    onClick={() => {
                                                        onAddExercise(dayId, ex)
                                                        setSearch('')
                                                        setIsSearchOpen(false)
                                                    }}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-muted text-sm flex font-bold uppercase tracking-widest text-foreground transition-colors group"
                                                >
                                                    <span className="truncate group-hover:text-primary transition-colors">{ex.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-4 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            No se encontraron ejercicios
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            )}

            <div
                ref={setNodeRef}
                className="flex-1 p-4 space-y-2 overflow-y-auto min-h-[200px] pb-safe"
                style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
                {/* Overlay para cerrar sugerencias */}
                {isSearchOpen && (
                    <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setIsSearchOpen(false)} />
                )}

                {is_rest ? (
                    <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-muted-foreground">
                        <Moon className="w-10 h-10 mb-3 text-indigo-400/40" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400/60">DÍA DE DESCANSO</p>
                        <p className="text-[9px] mt-2 opacity-40 px-4">Recuperación activa y descanso</p>
                        <button
                            onClick={() => onToggleRest(dayId)}
                            className="mt-4 text-[9px] font-bold uppercase tracking-widest text-indigo-400/60 hover:text-indigo-400 transition-colors border border-indigo-400/20 hover:border-indigo-400/40 px-3 py-1.5 rounded-lg"
                        >
                            Añadir ejercicios
                        </button>
                    </div>
                ) : (
                    <SortableContext
                        items={blocks.map(b => b.uid)}
                        strategy={verticalListSortingStrategy}
                    >
                        {blocks.map((block, idx) => {
                            const nextBlock = blocks[idx + 1]
                            const linkedToNext = !!block.superset_group && block.superset_group === nextBlock?.superset_group
                            const isLastBlock = idx === blocks.length - 1
                            const canLinkSuperset =
                                !isLastBlock && !!nextBlock && normSection(block) === normSection(nextBlock)
                            const prevSec = idx > 0 ? normSection(blocks[idx - 1]) : null
                            const thisSec = normSection(block)
                            const showSecHeader = thisSec !== prevSec

                            return (
                                <div key={block.uid}>
                                    {showSecHeader && (
                                        <SectionDropZone
                                            dayId={dayId}
                                            section={thisSec}
                                            label={
                                                thisSec === 'warmup'
                                                    ? 'Calentamiento'
                                                    : thisSec === 'main'
                                                      ? 'Principal'
                                                      : 'Enfriamiento'
                                            }
                                            showDropHint={!narrowLayout}
                                        />
                                    )}
                                    <ExerciseBlock
                                        block={block}
                                        dayId={dayId}
                                        onEdit={onEditBlock}
                                        onRemove={onRemoveBlock}
                                        onUpdate={onUpdateBlock}
                                        onToggleSuperset={
                                            block.superset_group
                                                ? () => onToggleSuperset(dayId, block.uid)
                                                : undefined
                                        }
                                        onSetSection={
                                            onSetBlockSection
                                                ? (s) => onSetBlockSection(dayId, block.uid, s)
                                                : undefined
                                        }
                                        onToggleOverride={
                                            templateLinked && onToggleBlockOverride
                                                ? () => onToggleBlockOverride(block.uid)
                                                : undefined
                                        }
                                        showTemplateLink={!!templateLinked}
                                        isDragPending={isDragPending}
                                        narrowLayout={narrowLayout}
                                    />
                                    {/* Superset connector */}
                                    {!isLastBlock && (
                                        linkedToNext ? (
                                            <div className="flex items-center gap-2 px-3 min-h-[32px] max-md:min-h-[40px] group/ss">
                                                <div className="h-full w-px bg-primary/30 ml-3" />
                                                <div className="flex items-center gap-1.5 flex-1">
                                                    <div className="flex-1 h-px bg-primary/20" />
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary/70 bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                                                        SS · {block.superset_group}
                                                    </span>
                                                    <div className="flex-1 h-px bg-primary/20" />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => onToggleSuperset(dayId, block.uid)}
                                                    title="Desagrupar superserie"
                                                    aria-label="Desagrupar superserie"
                                                    className="max-md:opacity-100 opacity-0 group-hover/ss:opacity-100 transition-opacity p-2 max-md:p-2 md:p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 flex items-center justify-center shrink-0"
                                                >
                                                    <Unlink className="w-4 h-4 md:w-3 md:h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center min-h-[40px] max-md:min-h-[44px] max-md:opacity-100 opacity-0 md:hover:opacity-100 transition-opacity group/link">
                                                <button
                                                    type="button"
                                                    disabled={!canLinkSuperset}
                                                    onClick={() => {
                                                        if (canLinkSuperset) onToggleSuperset(dayId, block.uid)
                                                    }}
                                                    title={
                                                        canLinkSuperset
                                                            ? 'Agrupar como superserie con el siguiente ejercicio'
                                                            : 'Solo puedes enlazar con el siguiente ejercicio de la misma sección (CAL, PRI o ENF)'
                                                    }
                                                    aria-label={
                                                        canLinkSuperset
                                                            ? 'Agrupar como superserie con el siguiente ejercicio'
                                                            : 'Superserie no disponible: el siguiente ejercicio es de otra sección'
                                                    }
                                                    className={cn(
                                                        'flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest px-3 py-2 max-md:py-2.5 rounded-full border border-dashed transition-colors',
                                                        canLinkSuperset
                                                            ? 'text-muted-foreground max-md:text-foreground/80 border-border/70 max-md:border-primary/30 hover:text-primary hover:bg-primary/5 max-md:bg-primary/5'
                                                            : 'text-muted-foreground/50 border-border/40 cursor-not-allowed opacity-60',
                                                    )}
                                                >
                                                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                                                    <span>Superserie</span>
                                                </button>
                                            </div>
                                        )
                                    )}
                                </div>
                            )
                        })}

                        {blocks.length === 0 && (
                            <div className="space-y-1">
                                <SectionDropZone
                                    dayId={dayId}
                                    section="warmup"
                                    label="Calentamiento"
                                    showDropHint={!narrowLayout}
                                />
                                <SectionDropZone
                                    dayId={dayId}
                                    section="main"
                                    label="Principal"
                                    showDropHint={!narrowLayout}
                                />
                                <SectionDropZone
                                    dayId={dayId}
                                    section="cooldown"
                                    label="Enfriamiento"
                                    showDropHint={!narrowLayout}
                                />
                                <p className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-30 text-center pt-2 px-4">
                                    {narrowLayout
                                        ? 'Añade ejercicios desde el menú inferior o con la lupa del día'
                                        : 'Arrastra un ejercicio o usa la búsqueda'}
                                </p>
                            </div>
                        )}
                    </SortableContext>
                )}
            </div>
        </div>
    )
}

export const DayColumn = React.memo(DayColumnInner)
