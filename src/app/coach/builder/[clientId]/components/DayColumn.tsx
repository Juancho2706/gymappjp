'use client'

import { useState, useMemo } from 'react'
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

function SectionDropZone({ dayId, section, label }: { dayId: number; section: BuilderSection; label: string }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `section-${dayId}-${section}`,
        data: { type: 'section', dayId, section },
    })
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70 px-2 py-1 rounded-lg border border-dashed border-border/80 mb-1 transition-colors select-none',
                isOver && 'border-primary bg-primary/10 text-primary'
            )}
        >
            {label}
            <span className="font-normal normal-case opacity-60 ml-1">· soltar</span>
        </div>
    )
}

interface DayColumnProps {
    day: DayState
    exercises: Exercise[]
    allDays?: DayState[]
    isCycleMode?: boolean
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
}

export function DayColumn({
    day,
    exercises,
    allDays,
    isCycleMode = false,
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
}: DayColumnProps) {
    const { id: dayId, title, blocks, name, is_rest } = day
    const dayLabel = isCycleMode ? `Día ${dayId}` : name

    const [search, setSearch] = useState('')
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [selectedDaysToCopy, setSelectedDaysToCopy] = useState<number[]>([])

    const totalSets = blocks.reduce((sum, b) => sum + (b.sets || 0), 0)
    const uniqueMuscles = Array.from(new Set(blocks.map(b => b.muscle_group).filter(Boolean)))

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
        <div className={`flex flex-col h-full backdrop-blur-xl border border-border dark:border-white/10 rounded-2xl min-w-[280px] xl:min-w-[320px] w-full md:w-auto overflow-hidden shadow-sm dark:shadow-2xl transition-colors duration-300 ${
            is_rest
                ? 'bg-muted/30 dark:bg-zinc-900/50'
                : 'bg-card dark:bg-zinc-950/30'
        }`}>
            <div className={`p-4 border-b border-border dark:border-white/10 ${is_rest ? 'bg-muted/40 dark:bg-white/[0.01]' : 'bg-muted/50 dark:bg-white/[0.02]'}`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-2">
                        {dayLabel}
                        {is_rest && (
                            <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
                                DESCANSO
                            </span>
                        )}
                        {!is_rest && blocks.length > 0 && (
                            <Popover>
                                <PopoverTrigger className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors text-zinc-400 hover:text-foreground">
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
                            className={`p-1.5 rounded-lg transition-colors text-xs ${
                                is_rest
                                    ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20'
                                    : 'text-zinc-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-indigo-400'
                            }`}
                        >
                            {is_rest ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                        </button>
                        {!is_rest && (
                            <Badge variant="outline" className="bg-white/5 text-zinc-500 border-white/10 font-bold">
                                {blocks.length} UNITS
                            </Badge>
                        )}
                    </div>
                </div>

                {!is_rest && (
                    <>
                        <div className="relative mb-3 group">
                            <Edit2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 group-hover:text-primary transition-colors" />
                            <input
                                value={title}
                                onChange={(e) => onUpdateTitle(dayId, e.target.value)}
                                placeholder="TITULO DEL DIA (EJ: EMPUJE)"
                                className="w-full h-9 pl-9 pr-3 text-[10px] font-bold uppercase tracking-widest rounded-lg bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground"
                            />
                        </div>

                        {/* Contador de Volumen por Día */}
                        <div className="flex items-center gap-2 flex-wrap mb-4">
                            <div className="flex items-center gap-1.5 bg-muted dark:bg-black/30 px-2 py-0.5 rounded-md border border-border shadow-sm">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Ejercicios</span>
                                <span className="text-[10px] font-bold text-foreground">{blocks.length}</span>
                            </div>
                            <div className="flex items-center gap-1.5 bg-muted dark:bg-black/30 px-2 py-0.5 rounded-md border border-border shadow-sm">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Series</span>
                                <span className="text-[10px] font-bold text-foreground">{totalSets}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {uniqueMuscles.map(m => (
                                    <div key={m} className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: getMuscleColor(m) }} title={m} />
                                ))}
                            </div>
                        </div>

                        <div className="relative hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                            <input
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value)
                                    setIsSearchOpen(true)
                                }}
                                onFocus={() => setIsSearchOpen(true)}
                                placeholder="BUSCAR PROTOCOLO..."
                                className="w-full h-11 pl-10 pr-4 text-[11px] font-bold uppercase tracking-widest rounded-xl bg-black/10 dark:bg-black/40 border border-black/10 dark:border-white/10 text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground"
                            />

                            {search && isSearchOpen && (
                                <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl overflow-hidden z-50">
                                    {filtered.length > 0 ? (
                                        <div className="py-2">
                                            <div className="px-3 pb-2 mb-2 border-b border-border text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                                                Resultados Rápido
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
                                            No se encontraron protocolos
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div
                ref={setNodeRef}
                className="flex-1 p-4 space-y-2 overflow-y-auto min-h-[200px]"
            >
                {/* Capa de overlay para cerrar sugerencias */}
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
                                        />
                                    )}
                                    <ExerciseBlock
                                        block={block}
                                        dayId={dayId}
                                        onEdit={onEditBlock}
                                        onRemove={onRemoveBlock}
                                        onUpdate={onUpdateBlock}
                                        onToggleSuperset={isLastBlock ? undefined : () => onToggleSuperset(dayId, block.uid)}
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
                                    />
                                    {/* Superset connector between this block and the next */}
                                    {!isLastBlock && (
                                        linkedToNext ? (
                                            <div className="flex items-center gap-2 px-3 h-6 group/ss">
                                                <div className="h-full w-px bg-primary/30 ml-3" />
                                                <div className="flex items-center gap-1.5 flex-1">
                                                    <div className="flex-1 h-px bg-primary/20" />
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary/70 bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                                                        SS · {block.superset_group}
                                                    </span>
                                                    <div className="flex-1 h-px bg-primary/20" />
                                                </div>
                                                <button
                                                    onClick={() => onToggleSuperset(dayId, block.uid)}
                                                    title="Desagrupar superset"
                                                    className="opacity-0 group-hover/ss:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    <Unlink className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-4 group/link opacity-0 hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => onToggleSuperset(dayId, block.uid)}
                                                    title="Agrupar como superset con el siguiente"
                                                    className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:text-primary transition-colors px-2 py-0.5 rounded-full hover:bg-primary/5"
                                                >
                                                    <Link2 className="w-3 h-3" />
                                                    <span>Superset</span>
                                                </button>
                                            </div>
                                        )
                                    )}
                                </div>
                            )
                        })}

                        {blocks.length === 0 && (
                            <div className="space-y-1">
                                <SectionDropZone dayId={dayId} section="warmup" label="Calentamiento" />
                                <SectionDropZone dayId={dayId} section="main" label="Principal" />
                                <SectionDropZone dayId={dayId} section="cooldown" label="Enfriamiento" />
                                <p className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-30 text-center pt-2 px-4">
                                    Arrastra un ejercicio o usa la búsqueda
                                </p>
                            </div>
                        )}
                    </SortableContext>
                )}
            </div>
        </div>
    )
}
