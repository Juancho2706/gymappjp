'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    GripVertical, Plus, X, Save, ArrowLeft, Search,
    Loader2, ChevronDown, ChevronUp, Dumbbell,
} from 'lucide-react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createPlanAction } from './actions'
import type { Client, Exercise } from '@/lib/database.types'

// ─── Types ──────────────────────────────────────────────────────
interface BuilderBlock {
    uid: string
    exercise_id: string
    exercise_name: string
    muscle_group: string
    sets: number
    reps: string
    target_weight_kg: string
    tempo: string
    rir: string
    rest_time: string
    notes: string
}

// ─── Sortable Block Component ────────────────────────────────────
function SortableBlock({
    block,
    index,
    onChange,
    onRemove,
}: {
    block: BuilderBlock
    index: number
    onChange: (uid: string, field: keyof BuilderBlock, value: string | number) => void
    onRemove: (uid: string) => void
}) {
    const [expanded, setExpanded] = useState(true)
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: block.uid })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    return (
        <div ref={setNodeRef} style={style}
            className={cn(
                'bg-card border rounded-2xl overflow-hidden transition-all shadow-sm',
                isDragging ? 'border-primary shadow-lg shadow-primary/20' : 'border-border'
            )}>
            {/* Block header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <button {...attributes} {...listeners}
                    className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
                    <GripVertical className="w-4 h-4" />
                </button>
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{index + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{block.exercise_name}</p>
                    <p className="text-xs text-muted-foreground">{block.muscle_group}</p>
                </div>
                <span className="text-xs text-muted-foreground hidden sm:block">
                    {block.sets} × {block.reps || '–'}
                </span>
                <button onClick={() => setExpanded(e => !e)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <button onClick={() => onRemove(block.uid)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Expanded fields */}
            {expanded && (
                <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-medium">Series</label>
                        <input type="number" min={1} max={20} value={block.sets}
                            onChange={e => onChange(block.uid, 'sets', parseInt(e.target.value) || 1)}
                            className="w-full h-8 px-2.5 text-sm rounded-lg bg-secondary border border-border text-foreground focus:border-primary focus:outline-none" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-medium">Reps</label>
                        <input type="text" placeholder="8-12" value={block.reps}
                            onChange={e => onChange(block.uid, 'reps', e.target.value)}
                            className="w-full h-8 px-2.5 text-sm rounded-lg bg-secondary border border-border text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-medium">Peso Sugerido (Kg)</label>
                        <input type="number" step="0.5" placeholder="Ej: 50" value={block.target_weight_kg}
                            onChange={e => onChange(block.uid, 'target_weight_kg', e.target.value)}
                            className="w-full h-8 px-2.5 text-sm rounded-lg bg-secondary border border-border text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-medium">Tempo</label>
                        <input type="text" placeholder="Ej: 3-0-1-0" value={block.tempo}
                            onChange={e => onChange(block.uid, 'tempo', e.target.value)}
                            className="w-full h-8 px-2.5 text-sm rounded-lg bg-secondary border border-border text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-medium">RIR / RPE</label>
                        <input type="text" placeholder="2 RIR" value={block.rir}
                            onChange={e => onChange(block.uid, 'rir', e.target.value)}
                            className="w-full h-8 px-2.5 text-sm rounded-lg bg-secondary border border-border text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-medium">Descanso</label>
                        <input type="text" placeholder="90s" value={block.rest_time}
                            onChange={e => onChange(block.uid, 'rest_time', e.target.value)}
                            className="w-full h-8 px-2.5 text-sm rounded-lg bg-secondary border border-border text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1 col-span-2 sm:col-span-3">
                        <label className="text-xs text-muted-foreground font-medium">Notas</label>
                        <input type="text" placeholder="Ej: Bajar lento en excéntrico" value={block.notes}
                            onChange={e => onChange(block.uid, 'notes', e.target.value)}
                            className="w-full h-8 px-2.5 text-sm rounded-lg bg-secondary border border-border text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/50" />
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Main Builder ────────────────────────────────────────────────
export function PlanBuilder({
    client,
    exercises,
}: {
    client: Pick<Client, 'id' | 'full_name' | 'email'>
    exercises: Exercise[]
}) {
    const router = useRouter()
    const [title, setTitle] = useState('')
    const [blocks, setBlocks] = useState<BuilderBlock[]>([])
    const [search, setSearch] = useState('')
    const [selectedMuscle, setSelectedMuscle] = useState<string>('Todos')
    const [error, setError] = useState<string>()
    const [isPending, startTransition] = useTransition()

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const muscleGroups = ['Todos', ...Array.from(new Set(exercises.map(e => e.muscle_group))).sort()]

    const filteredExercises = exercises.filter(ex => {
        const matchesMuscle = selectedMuscle === 'Todos' || ex.muscle_group === selectedMuscle
        const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase())
        return matchesMuscle && matchesSearch
    })

    const addExercise = useCallback((exercise: Exercise) => {
        setBlocks(prev => [...prev, {
            uid: `${exercise.id}-${Date.now()}`,
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            muscle_group: exercise.muscle_group,
            sets: 3,
            reps: '8-12',
            target_weight_kg: '',
            tempo: '',
            rir: '',
            rest_time: '90s',
            notes: '',
        }])
    }, [])

    const handleBlockChange = useCallback((uid: string, field: keyof BuilderBlock, value: string | number) => {
        setBlocks(prev => prev.map(b => b.uid === uid ? { ...b, [field]: value } : b))
    }, [])

    const removeBlock = useCallback((uid: string) => {
        setBlocks(prev => prev.filter(b => b.uid !== uid))
    }, [])

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (over && active.id !== over.id) {
            setBlocks(prev => {
                const oldIndex = prev.findIndex(b => b.uid === active.id)
                const newIndex = prev.findIndex(b => b.uid === over.id)
                return arrayMove(prev, oldIndex, newIndex)
            })
        }
    }

    function handleSave() {
        if (!title.trim()) { setError('Ingresa un título para la rutina.'); return }
        if (blocks.length === 0) { setError('Agrega al menos un ejercicio.'); return }
        setError(undefined)

        startTransition(async () => {
            const result = await createPlanAction({
                title: title.trim(),
                clientId: client.id,
                blocks: blocks.map(b => ({
                    exercise_id: b.exercise_id,
                    sets: b.sets,
                    reps: b.reps,
                    target_weight_kg: b.target_weight_kg ? parseFloat(b.target_weight_kg) : undefined,
                    tempo: b.tempo || undefined,
                    rir: b.rir || undefined,
                    rest_time: b.rest_time || undefined,
                    notes: b.notes || undefined,
                })),
            })
            if (result.error) {
                setError(result.error)
            } else {
                router.push(`/coach/clients/${client.id}`)
            }
        })
    }

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-60px)] -mx-4 -my-6 md:-mx-6 md:-my-8">
            {/* Top bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-border bg-background flex-shrink-0">
                <Link href={`/coach/clients/${client.id}`}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Rutina para</p>
                    <p className="text-sm font-bold text-foreground">{client.full_name}</p>
                </div>
                <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Nombre de la rutina…"
                    className="flex-1 min-w-[150px] max-w-xs h-9 px-3 text-sm rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                />
                {error && <p className="text-xs text-destructive max-w-40 text-right">{error}</p>}
                <button onClick={handleSave} disabled={isPending}
                    className={cn(
                        'flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all w-full md:w-auto',
                        'bg-gradient-to-r from-emerald-500 to-teal-600 text-white',
                        'hover:shadow-lg hover:shadow-emerald-500/25',
                        'disabled:opacity-60 disabled:cursor-not-allowed'
                    )}>
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isPending ? 'Guardando...' : 'Guardar Rutina'}
                </button>
            </div>

            {/* Main split layout */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                {/* LEFT: Exercise catalog */}
                <div className="h-[40vh] md:h-auto md:w-72 flex-shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col bg-muted/30">
                    <div className="p-3 space-y-2 border-b border-border">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar ejercicio…"
                                className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none" />
                        </div>
                        <div className="flex gap-1 flex-wrap">
                            {muscleGroups.slice(0, 6).map(m => (
                                <button key={m} onClick={() => setSelectedMuscle(m)}
                                    className={cn('px-2 py-0.5 text-xs rounded-full border transition-colors',
                                        selectedMuscle === m
                                            ? 'bg-primary border-primary text-primary-foreground'
                                            : 'border-border text-muted-foreground hover:border-primary/30'
                                    )}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        {filteredExercises.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-8">Sin resultados</p>
                        ) : (
                            filteredExercises.map(ex => (
                                <button key={ex.id} onClick={() => addExercise(ex)}
                                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left hover:bg-muted transition-colors group">
                                    <Dumbbell className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-foreground/70 group-hover:text-foreground truncate transition-colors">
                                            {ex.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{ex.muscle_group}</p>
                                    </div>
                                    <Plus className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all" />
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT: Plan canvas */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-background">
                    {blocks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 rounded-2xl bg-muted border border-dashed border-border flex items-center justify-center mb-4">
                                <Dumbbell className="w-7 h-7 text-muted-foreground/40" />
                            </div>
                            <p className="text-foreground font-semibold">Canvas vacío</p>
                            <p className="text-muted-foreground text-sm mt-1">
                                Haz clic en un ejercicio del panel izquierdo para añadirlo
                            </p>
                        </div>
                    ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={blocks.map(b => b.uid)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-3">
                                    {blocks.map((block, index) => (
                                        <SortableBlock
                                            key={block.uid}
                                            block={block}
                                            index={index}
                                            onChange={handleBlockChange}
                                            onRemove={removeBlock}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </div>
        </div>
    )
}
