'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, Dumbbell, Filter, Eye, Activity, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { filterExercises, cn } from '@/lib/utils'
import type { Tables } from '@/lib/database.types'
import { getMuscleColor } from './muscle-colors'

type Exercise = Tables<'exercises'>

interface DraggableExerciseItemProps {
    exercise: Exercise
    onSelect?: (exercise: Exercise) => void
    onPreview?: (exercise: Exercise) => void
    onTapAdd?: (exercise: Exercise) => void
}

function DraggableExerciseItem({ exercise, onSelect, onPreview, onTapAdd }: DraggableExerciseItemProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `catalog-${exercise.id}`,
        data: {
            type: 'new-exercise',
            exercise
        }
    })

    const style = {
        touchAction: 'pan-y'
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={() => onSelect?.(exercise)}
            className={cn(
                "p-3 rounded-lg border bg-card hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing group relative",
                isDragging && "opacity-50 ring-2 ring-primary border-primary",
                onSelect && "cursor-pointer active:scale-95 transition-transform"
            )}
        >
            <div className="flex items-center gap-3">
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center border border-border overflow-hidden shrink-0 group-hover:shadow-md transition-all relative"
                    style={{ backgroundColor: `color-mix(in srgb, ${getMuscleColor(exercise.muscle_group)} 15%, transparent)` }}
                >
                    {exercise.gif_url || (exercise.video_url && !exercise.video_url.includes('youtube') && !exercise.video_url.includes('youtu.be')) ? (
                        <img
                            src={exercise.gif_url || exercise.video_url!}
                            alt={exercise.name}
                            loading="lazy"
                            className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal"
                        />
                    ) : (
                        <Activity className="w-5 h-5 opacity-50" style={{ color: getMuscleColor(exercise.muscle_group) }} />
                    )}
                </div>
                <div className="flex-1 min-w-0 pr-8">
                    <p className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors truncate">{exercise.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getMuscleColor(exercise.muscle_group) }} />
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">{exercise.muscle_group}</p>
                    </div>
                </div>
            </div>

            {/* Hover Tooltip (Desktop) */}
            <div className="hidden lg:block absolute left-[105%] top-1/2 -translate-y-1/2 w-64 bg-background/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[100] translate-x-[-10px] group-hover:translate-x-0 pointer-events-none overflow-hidden">
                <div className="h-40 bg-muted/30 relative flex items-center justify-center">
                    {exercise.gif_url || (exercise.video_url && !exercise.video_url.includes('youtube') && !exercise.video_url.includes('youtu.be')) ? (
                        <img
                            src={exercise.gif_url || exercise.video_url!}
                            alt={exercise.name}
                            className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal"
                        />
                    ) : (
                        <Activity className="w-12 h-12 text-muted-foreground/30" />
                    )}
                    <div className="absolute top-3 left-3 bg-background/80 backdrop-blur-md px-2 py-1 rounded-md border border-border/50">
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: getMuscleColor(exercise.muscle_group) }}>
                            {exercise.muscle_group}
                        </span>
                    </div>
                </div>
                <div className="p-3">
                    <p className="text-sm font-bold leading-tight">{exercise.name}</p>
                </div>
            </div>

            {onTapAdd ? (
                <button
                    onClick={(e) => { e.stopPropagation(); onTapAdd(exercise) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-primary text-white shadow-md active:scale-95 transition-transform z-10"
                    style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                    title="Añadir al día"
                >
                    <Plus className="w-4 h-4" />
                </button>
            ) : onPreview ? (
                <button
                    onClick={(e) => { e.stopPropagation(); onPreview(exercise) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-primary transition-colors z-10"
                    title="Vista Previa"
                >
                    <Eye className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
                </button>
            ) : null}
        </div>
    )
}

// ─── List item types for virtualizer ────────────────────────────────────────

type ListItem =
    | { kind: 'header'; label: string }
    | { kind: 'separator' }
    | { kind: 'exercise'; exercise: Exercise; isRecent: boolean }

interface DraggableExerciseCatalogProps {
    exercises: Exercise[]
    className?: string
    onSelect?: (exercise: Exercise) => void
    onTapAdd?: (exercise: Exercise) => void
}

export function DraggableExerciseCatalog({ exercises, className, onSelect, onTapAdd }: DraggableExerciseCatalogProps) {
    const [search, setSearch] = useState('')
    const [selectedMuscle, setSelectedMuscle] = useState<string>('Todos')
    const [previewExercise, setPreviewExercise] = useState<Exercise | null>(null)
    const [recentIds, setRecentIds] = useState<string[]>([])

    useEffect(() => {
        const loadRecent = () => {
            try {
                const saved = localStorage.getItem('builder_recent_exercises')
                if (saved) setRecentIds(JSON.parse(saved))
            } catch { /* ignore */ }
        }
        loadRecent()
        window.addEventListener('recent_exercises_updated', loadRecent)
        window.addEventListener('storage', loadRecent)
        return () => {
            window.removeEventListener('recent_exercises_updated', loadRecent)
            window.removeEventListener('storage', loadRecent)
        }
    }, [])

    const recentExercises = useMemo(() => {
        return recentIds.map(id => exercises.find(e => e.id === id)).filter(Boolean) as Exercise[]
    }, [recentIds, exercises])

    const filteredExercises = useMemo(() => {
        return filterExercises(exercises, search, selectedMuscle)
    }, [exercises, search, selectedMuscle])

    // ── Flat list for virtualizer ──────────────────────────────────────────
    const listItems = useMemo((): ListItem[] => {
        const items: ListItem[] = []
        const showRecents = search === '' && selectedMuscle === 'Todos' && recentExercises.length > 0
        if (showRecents) {
            items.push({ kind: 'header', label: 'Usados Recientemente' })
            recentExercises.forEach(ex => items.push({ kind: 'exercise', exercise: ex, isRecent: true }))
            items.push({ kind: 'separator' })
            if (filteredExercises.length > 0) {
                items.push({ kind: 'header', label: 'Todos los Ejercicios' })
            }
        }
        filteredExercises.forEach(ex => items.push({ kind: 'exercise', exercise: ex, isRecent: false }))
        return items
    }, [search, selectedMuscle, recentExercises, filteredExercises])

    const parentRef = useRef<HTMLDivElement>(null)

    const rowVirtualizer = useVirtualizer({
        count: listItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (i) => {
            const item = listItems[i]
            if (!item) return 68
            if (item.kind === 'header') return 32
            if (item.kind === 'separator') return 17
            return 68 // exercise card height (p-3 + thumbnail row)
        },
        overscan: 5,
    })

    return (
        <div className={cn("flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden shadow-sm relative", className)}>
            {/* Header / Filters */}
            <div className="p-3 md:p-4 border-b border-border space-y-3 md:space-y-4 bg-muted/20 rounded-t-xl shrink-0">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold flex items-center gap-2 text-foreground">
                        <Activity className="w-4 h-4 text-primary" style={{ color: 'var(--theme-primary)' }} />
                        Catálogo de Ejercicios
                    </h2>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nombre..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-10 text-[16px] md:text-xs bg-background border-border rounded-xl focus:border-primary focus:ring-primary/20 transition-all text-foreground"
                            style={{ borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)' }}
                        />
                    </div>

                    <Select value={selectedMuscle} onValueChange={(val) => setSelectedMuscle(val || 'Todos')}>
                        <SelectTrigger
                            className="h-10 text-xs bg-background border-border rounded-xl focus:border-primary focus:ring-primary/20 transition-all text-foreground"
                            style={{ borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)' }}
                        >
                            <div className="flex items-center gap-2">
                                <Filter className="w-3 h-3 text-muted-foreground" />
                                <SelectValue placeholder="Filtrar por músculo" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-background text-foreground">
                            <SelectItem value="Todos" className="text-xs">Todos los músculos</SelectItem>
                            {MUSCLE_GROUPS.map(mg => (
                                <SelectItem key={mg} value={mg} className="text-xs">{mg}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Virtualized list */}
            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2"
                style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
                {listItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center opacity-40 text-foreground">
                        <Search className="w-8 h-8 mb-2" />
                        <p className="text-xs font-medium">No se encontraron<br />ejercicios</p>
                    </div>
                ) : (
                    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                        {rowVirtualizer.getVirtualItems().map(virtualRow => {
                            const item = listItems[virtualRow.index]
                            return (
                                <div
                                    key={virtualRow.key}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    {item.kind === 'header' && (
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 pt-2 pb-1">
                                            {item.label}
                                        </p>
                                    )}
                                    {item.kind === 'separator' && (
                                        <div className="h-px bg-border/50 my-2" />
                                    )}
                                    {item.kind === 'exercise' && (
                                        <DraggableExerciseItem
                                            exercise={item.exercise}
                                            onSelect={onSelect}
                                            onPreview={onTapAdd ? undefined : setPreviewExercise}
                                            onTapAdd={onTapAdd}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="hidden md:block p-3 bg-muted/10 border-t border-border shrink-0">
                <p className="text-[10px] text-muted-foreground text-center">
                    Arrastra un ejercicio al día deseado
                </p>
            </div>

            {/* Preview Modal */}
            <Dialog open={!!previewExercise} onOpenChange={() => setPreviewExercise(null)}>
                <DialogContent className="sm:max-w-md bg-background border-border overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-display uppercase tracking-tighter text-foreground">
                            {previewExercise?.name}
                        </DialogTitle>
                        <p className="text-xs font-bold text-primary uppercase tracking-[0.2em]" style={{ color: 'var(--theme-primary)' }}>
                            {previewExercise?.muscle_group}
                        </p>
                    </DialogHeader>
                    {previewExercise?.gif_url || (previewExercise?.video_url && !previewExercise.video_url.includes('youtube') && !previewExercise.video_url.includes('youtu.be')) ? (
                        <div className="aspect-video relative rounded-xl overflow-hidden bg-white mt-4 border border-border flex items-center justify-center">
                            <img
                                src={previewExercise.gif_url || previewExercise.video_url!}
                                alt={previewExercise.name}
                                className="w-full h-full object-contain"
                            />
                        </div>
                    ) : previewExercise?.video_url && (previewExercise.video_url.includes('youtube') || previewExercise.video_url.includes('youtu.be')) ? (
                        <div className="aspect-video relative rounded-xl overflow-hidden bg-muted mt-4 border border-border flex items-center justify-center">
                            <iframe
                                className="w-full h-full"
                                src={`https://www.youtube-nocookie.com/embed/${previewExercise.video_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1]}?autoplay=1&mute=1&loop=1&playlist=${previewExercise.video_url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1]}&modestbranding=1&rel=0&showinfo=0&controls=1`}
                                title={previewExercise.name}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                            />
                        </div>
                    ) : (
                        <div className="aspect-video flex items-center justify-center rounded-xl bg-muted mt-4 border border-border">
                            <Dumbbell className="w-12 h-12 text-muted-foreground opacity-20" />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
