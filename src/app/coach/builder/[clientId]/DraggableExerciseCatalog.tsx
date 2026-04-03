'use client'

import { useState, useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Search, Dumbbell, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { filterExercises, cn } from '@/lib/utils'
import type { Tables } from '@/lib/database.types'

type Exercise = Tables<'exercises'>

interface DraggableExerciseItemProps {
    exercise: Exercise
    onSelect?: (exercise: Exercise) => void
}

function DraggableExerciseItem({ exercise, onSelect }: DraggableExerciseItemProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `catalog-${exercise.id}`,
        data: {
            type: 'new-exercise',
            exercise
        }
    })

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        touchAction: 'none'
    } : {
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
                "p-3 rounded-lg border bg-card hover:border-primary/50 transition-all cursor-grab active:cursor-grabbing group",
                isDragging && "opacity-50 ring-2 ring-primary border-primary",
                onSelect && "cursor-pointer active:scale-95 transition-transform"
            )}
        >
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Dumbbell className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{exercise.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{exercise.muscle_group}</p>
                </div>
            </div>
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

    const filteredExercises = useMemo(() => {
        return filterExercises(exercises, search, selectedMuscle)
    }, [exercises, search, selectedMuscle])

    return (
        <div className={cn("flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden shadow-sm", className)}>
            <div className="p-3 md:p-4 border-b border-border space-y-3 md:space-y-4 bg-muted/20">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold flex items-center gap-2 text-foreground">
                        <Dumbbell className="w-4 h-4 text-primary" />
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
                        />
                    </div>
                    
                    <Select value={selectedMuscle} onValueChange={(val) => setSelectedMuscle(val || 'Todos')}>
                        <SelectTrigger className="h-10 text-xs bg-background border-border rounded-xl focus:border-primary focus:ring-primary/20 transition-all text-foreground">
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

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar max-h-[25vh] md:max-h-none">
                {filteredExercises.length > 0 ? (
                    filteredExercises.map(ex => (
                        <DraggableExerciseItem key={ex.id} exercise={ex} onSelect={onSelect} />
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center opacity-40 text-foreground">
                        <Search className="w-8 h-8 mb-2" />
                        <p className="text-xs font-medium">No se encontraron<br/>ejercicios</p>
                    </div>
                )}
            </div>
            
            <div className="p-3 bg-muted/10 border-t border-border">
                <p className="text-[10px] text-muted-foreground text-center">
                    Arrastra un ejercicio al día deseado
                </p>
            </div>
        </div>
    )
}
