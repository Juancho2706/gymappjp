'use client'

import { useState, useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Search, Dumbbell, Filter, Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { filterExercises, cn } from '@/lib/utils'
import type { Tables } from '@/lib/database.types'

type Exercise = Tables<'exercises'>

interface DraggableExerciseItemProps {
    exercise: Exercise
    onSelect?: (exercise: Exercise) => void
    onPreview?: (exercise: Exercise) => void
}

function DraggableExerciseItem({ exercise, onSelect, onPreview }: DraggableExerciseItemProps) {
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
                "p-3 rounded-lg border bg-card dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing group relative",
                isDragging && "opacity-50 ring-2 ring-primary border-primary",
                onSelect && "cursor-pointer active:scale-95 transition-transform"
            )}
        >
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Dumbbell className="w-4 h-4 text-primary" style={{ color: 'var(--theme-primary)' }} />
                </div>
                <div className="flex-1 min-w-0 pr-8">
                    <p className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors" style={{ color: 'inherit' }}>{exercise.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{exercise.muscle_group}</p>
                </div>
            </div>
            {onPreview && (
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onPreview(exercise);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-primary transition-colors z-10"
                    title="Vista Previa"
                >
                    <Eye className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
                </button>
            )}
        </div>
    )
}

interface DraggableExerciseCatalogProps {
    exercises: Exercise[]
    className?: string
    onSelect?: (exercise: Exercise) => void
}

export function DraggableExerciseCatalog({ exercises, className, onSelect }: DraggableExerciseCatalogProps) {
    const [search, setSearch] = useState('')
    const [selectedMuscle, setSelectedMuscle] = useState<string>('Todos')
    const [previewExercise, setPreviewExercise] = useState<Exercise | null>(null)

    const filteredExercises = useMemo(() => {
        return filterExercises(exercises, search, selectedMuscle)
    }, [exercises, search, selectedMuscle])

    return (
        <div className={cn("flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden shadow-sm relative", className)}>
            <div className="p-3 md:p-4 border-b border-border space-y-3 md:space-y-4 bg-muted/20 rounded-t-xl">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold flex items-center gap-2 text-foreground">
                        <Dumbbell className="w-4 h-4 text-primary" style={{ color: 'var(--theme-primary)' }} />
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
                            className="pl-9 h-10 text-xs bg-background border-border rounded-xl focus:border-primary focus:ring-primary/20 transition-all text-foreground"
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

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {filteredExercises.length > 0 ? (
                    filteredExercises.map(ex => (
                        <DraggableExerciseItem key={ex.id} exercise={ex} onSelect={onSelect} onPreview={setPreviewExercise} />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center opacity-40 text-foreground">
                        <Search className="w-8 h-8 mb-2" />
                        <p className="text-xs font-medium">No se encontraron<br/>ejercicios</p>
                    </div>
                )}
            </div>
            
            <div className="hidden md:block p-3 bg-muted/10 border-t border-border">
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

