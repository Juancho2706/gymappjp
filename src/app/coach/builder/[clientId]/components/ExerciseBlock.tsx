'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMuscleColor } from '../muscle-colors'
import type { BuilderBlock } from '../types'

interface ExerciseBlockProps {
    block: BuilderBlock
    dayId: number
    onEdit: (block: BuilderBlock) => void
    onRemove: (dayId: number, uid: string) => void
    onUpdate?: (block: BuilderBlock) => void
    onToggleSuperset?: () => void
}

export function ExerciseBlock({ block, dayId, onEdit, onRemove, onUpdate, onToggleSuperset }: ExerciseBlockProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: block.uid,
        data: {
            type: 'block',
            block,
            dayId
        }
    })

    const [isQuickEditing, setIsQuickEditing] = useState(false)
    const [quickSets, setQuickSets] = useState(block.sets ?? 3)
    const [quickReps, setQuickReps] = useState(block.reps ?? '8-12')

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    }

    const muscleColor = getMuscleColor(block.muscle_group)

    function handleQuickSave() {
        if (onUpdate) {
            onUpdate({ ...block, sets: quickSets, reps: quickReps })
        }
        setIsQuickEditing(false)
    }

    function handleQuickKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') handleQuickSave()
        if (e.key === 'Escape') {
            setQuickSets(block.sets ?? 3)
            setQuickReps(block.reps ?? '8-12')
            setIsQuickEditing(false)
        }
    }

    function startQuickEdit(e: React.MouseEvent) {
        e.stopPropagation()
        setQuickSets(block.sets ?? 3)
        setQuickReps(block.reps ?? '8-12')
        setIsQuickEditing(true)
    }

    return (
        <div ref={setNodeRef}
            className={cn(
                'group relative flex flex-col bg-background dark:bg-zinc-950/50 backdrop-blur-md border border-border dark:border-white/10 rounded-xl overflow-hidden transition-all duration-300 shadow-sm dark:shadow-none border-l-4',
                isDragging ? 'z-50 ring-4 ring-primary/20 shadow-2xl scale-105 opacity-50' : 'hover:border-primary/40 hover:bg-primary/5 hover:shadow-md dark:hover:border-primary/40 dark:hover:bg-primary/10'
            )}
            style={{
                ...style,
                borderLeftColor: isDragging ? 'var(--theme-primary)' : muscleColor,
            }}
        >
            <div className="flex items-center gap-3 p-3">
                <button {...attributes} {...listeners}
                    className="text-muted-foreground hover:text-primary cursor-grab active:cursor-grabbing p-1.5 -ml-1 rounded-lg hover:bg-muted dark:hover:bg-white/5 transition-colors flex-shrink-0">
                    <GripVertical className="w-4 h-4" />
                </button>

                <div
                    className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center overflow-hidden bg-muted relative border border-black/5 dark:border-white/5"
                    style={{ backgroundColor: `color-mix(in srgb, ${muscleColor} 15%, transparent)` }}
                >
                    {block.gif_url || (block.video_url && !block.video_url.includes('youtube') && !block.video_url.includes('youtu.be')) ? (
                        <img
                            src={block.gif_url || block.video_url!}
                            alt={block.exercise_name}
                            loading="lazy"
                            className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-screen opacity-90 group-hover:opacity-100 transition-opacity"
                        />
                    ) : (
                        <div className="w-full h-full opacity-20 bg-current"></div>
                    )}
                </div>

                <div
                    className="flex-1 min-w-0 cursor-pointer py-1"
                    onClick={() => !isQuickEditing && onEdit(block)}
                >
                    <div className="font-bold text-xs uppercase tracking-widest text-foreground truncate group-hover:text-primary transition-colors pr-2">
                        {block.exercise_name}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {isQuickEditing ? (
                            <div
                                className="flex items-center gap-1.5"
                                onClick={e => e.stopPropagation()}
                                onKeyDown={handleQuickKeyDown}
                            >
                                {/* Sets counter */}
                                <div className="flex items-center gap-1 bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">
                                    <button
                                        onClick={() => setQuickSets(s => Math.max(1, s - 1))}
                                        className="text-primary hover:text-primary/70 transition-colors"
                                    >
                                        <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className="text-[10px] font-bold text-foreground w-4 text-center">{quickSets}</span>
                                    <button
                                        onClick={() => setQuickSets(s => Math.min(20, s + 1))}
                                        className="text-primary hover:text-primary/70 transition-colors"
                                    >
                                        <Plus className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                                <span className="text-muted-foreground text-[10px]">×</span>
                                {/* Reps input */}
                                <input
                                    autoFocus
                                    value={quickReps}
                                    onChange={e => setQuickReps(e.target.value)}
                                    className="w-14 text-[10px] font-bold text-center bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary"
                                    placeholder="reps"
                                />
                                <button
                                    onClick={handleQuickSave}
                                    className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded hover:bg-primary/20 transition-colors uppercase tracking-wider"
                                >
                                    OK
                                </button>
                            </div>
                        ) : (
                            <>
                                {(block.sets || 0) > 0 && block.reps ? (
                                    <div
                                        className="flex items-center gap-1 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-bold text-foreground cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                                        title="Doble click para editar rápido"
                                        onDoubleClick={onUpdate ? startQuickEdit : undefined}
                                    >
                                        <span>{block.sets}</span>
                                        <span className="text-muted-foreground">×</span>
                                        <span>{block.reps}</span>
                                    </div>
                                ) : (
                                    <div
                                        className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold text-orange-500 cursor-pointer hover:bg-orange-500/20 transition-colors"
                                        onDoubleClick={onUpdate ? startQuickEdit : undefined}
                                    >
                                        INCOMPLETO
                                    </div>
                                )}
                                {block.rest_time && (
                                    <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-bold text-muted-foreground">
                                        ⏱ {block.rest_time}
                                    </div>
                                )}
                                {block.superset_group && (
                                    <div
                                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border cursor-pointer"
                                        style={{
                                            color: 'var(--theme-primary, #007AFF)',
                                            borderColor: 'color-mix(in srgb, var(--theme-primary, #007AFF) 30%, transparent)',
                                            backgroundColor: 'color-mix(in srgb, var(--theme-primary, #007AFF) 10%, transparent)',
                                        }}
                                        onClick={onToggleSuperset ? (e) => { e.stopPropagation(); onToggleSuperset() } : undefined}
                                        title="Quitar del superset"
                                    >
                                        SS·{block.superset_group}
                                    </div>
                                )}
                                {block.progression_type && (
                                    <div
                                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                                        title={`Progresión: +${block.progression_value ?? '?'}${block.progression_type === 'weight' ? 'kg/sem' : ' rep/ses'}`}
                                    >
                                        ↑{block.progression_type === 'weight' ? `${block.progression_value ?? '?'}kg` : `${block.progression_value ?? '?'}r`}
                                    </div>
                                )}
                                <div
                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest text-white shadow-sm"
                                    style={{ backgroundColor: muscleColor }}
                                >
                                    {block.muscle_group}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <button onClick={(e) => {
                    e.stopPropagation();
                    onRemove(dayId, block.uid);
                }}
                    className="p-2.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0"
                    title="Remover Unidad">
                    <X className="w-5 h-5 stroke-[2.5px]" />
                </button>
            </div>
        </div>
    )
}
