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
    Loader2, ChevronDown, ChevronUp, Dumbbell, Copy
} from 'lucide-react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { normalizeString } from '@/lib/utils'
import { createPlanAction } from './actions'
import type { Tables } from '@/lib/database.types'
import { MUSCLE_GROUPS } from '@/lib/constants'

type Client = Tables<'clients'>
type Exercise = Tables<'exercises'>

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
    const [expanded, setExpanded] = useState(false)
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: block.uid })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div ref={setNodeRef} style={style}
            className={cn(
                'bg-card border rounded-xl overflow-hidden transition-all duration-200 group',
                isDragging ? 'z-50 border-primary ring-2 ring-primary/20 shadow-2xl scale-[1.02] opacity-90' : 'border-border shadow-sm hover:border-muted-foreground/30'
            )}>
            {/* Block header */}
            <div className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                expanded ? "border-b border-border bg-muted/20" : "hover:bg-muted/10"
            )} onClick={() => setExpanded(!expanded)}>
                <button {...attributes} {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing p-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
                    <GripVertical className="w-4 h-4" />
                </button>
                
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-primary">{index + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{block.exercise_name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium uppercase tracking-wider">
                            {block.muscle_group}
                        </span>
                    </div>
                    {!expanded && (
                        <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <span className="font-bold text-foreground/80">{block.sets}</span> series
                            </span>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <span className="font-bold text-foreground/80">{block.reps || '–'}</span> reps
                            </span>
                            {block.rest_time && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <span className="font-bold text-foreground/80">{block.rest_time}</span> descanso
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); onRemove(block.uid); }}
                        className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100">
                        <X className="w-4 h-4" />
                    </button>
                    <div className="p-1.5 rounded-lg text-muted-foreground transition-colors">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                </div>
            </div>

            {/* Expanded fields */}
            {expanded && (
                <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 bg-card/50">
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold ml-1">Series</label>
                        <input type="number" min={1} max={20} value={block.sets}
                            onChange={e => onChange(block.uid, 'sets', parseInt(e.target.value) || 1)}
                            className="w-full h-9 px-3 text-sm rounded-xl bg-secondary/50 border border-border/50 text-foreground focus:border-primary focus:bg-background focus:outline-none transition-all" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold ml-1">Reps</label>
                        <input type="text" placeholder="8-12" value={block.reps}
                            onChange={e => onChange(block.uid, 'reps', e.target.value)}
                            className="w-full h-9 px-3 text-sm rounded-xl bg-secondary/50 border border-border/50 text-foreground focus:border-primary focus:bg-background focus:outline-none transition-all placeholder:text-muted-foreground/30" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold ml-1">Peso (Kg)</label>
                        <input type="number" step="0.5" placeholder="Sugerido" value={block.target_weight_kg}
                            onChange={e => onChange(block.uid, 'target_weight_kg', e.target.value)}
                            className="w-full h-9 px-3 text-sm rounded-xl bg-secondary/50 border border-border/50 text-foreground focus:border-primary focus:bg-background focus:outline-none transition-all placeholder:text-muted-foreground/30" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold ml-1">Tempo</label>
                        <input type="text" placeholder="Ej: 3-0-1-0" value={block.tempo}
                            onChange={e => onChange(block.uid, 'tempo', e.target.value)}
                            className="w-full h-9 px-3 text-sm rounded-xl bg-secondary/50 border border-border/50 text-foreground focus:border-primary focus:bg-background focus:outline-none transition-all placeholder:text-muted-foreground/30" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold ml-1">RIR / RPE</label>
                        <input type="text" placeholder="2 RIR" value={block.rir}
                            onChange={e => onChange(block.uid, 'rir', e.target.value)}
                            className="w-full h-9 px-3 text-sm rounded-xl bg-secondary/50 border border-border/50 text-foreground focus:border-primary focus:bg-background focus:outline-none transition-all placeholder:text-muted-foreground/30" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold ml-1">Descanso</label>
                        <input type="text" placeholder="90s" value={block.rest_time}
                            onChange={e => onChange(block.uid, 'rest_time', e.target.value)}
                            className="w-full h-9 px-3 text-sm rounded-xl bg-secondary/50 border border-border/50 text-foreground focus:border-primary focus:bg-background focus:outline-none transition-all placeholder:text-muted-foreground/30" />
                    </div>
                    <div className="space-y-1 col-span-2 md:col-span-3">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold ml-1">Notas</label>
                        <input type="text" placeholder="Instrucciones especiales..." value={block.notes}
                            onChange={e => onChange(block.uid, 'notes', e.target.value)}
                            className="w-full h-9 px-3 text-sm rounded-xl bg-secondary/50 border border-border/50 text-foreground focus:border-primary focus:bg-background focus:outline-none transition-all placeholder:text-muted-foreground/30" />
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
    initialPlan,
    existingGroups = [],
    templates = [],
}: {
    client: Pick<Client, 'id' | 'full_name' | 'email'>
    exercises: Exercise[]
    initialPlan?: any
    existingGroups?: string[]
    templates?: any[]
}) {
    const router = useRouter()
    const [title, setTitle] = useState(initialPlan?.title || '')
    const [groupName, setGroupName] = useState(initialPlan?.group_name || '')
    const [blocks, setBlocks] = useState<BuilderBlock[]>(
        initialPlan?.workout_blocks?.sort((a: any, b: any) => a.order_index - b.order_index).map((b: any) => ({
            uid: b.id, // Using existing ID to track updates vs inserts isn't strictly necessary if we wipe and re-insert, but let's just use it as uid
            exercise_id: b.exercise_id,
            exercise_name: b.exercises?.name || 'Unknown',
            muscle_group: b.exercises?.muscle_group || 'Unknown',
            sets: b.sets,
            reps: b.reps,
            target_weight_kg: b.target_weight_kg?.toString() || '',
            tempo: b.tempo || '',
            rir: b.rir || '',
            rest_time: b.rest_time || '',
            notes: b.notes || '',
        })) || []
    )
    const [search, setSearch] = useState('')
    const [selectedMuscle, setSelectedMuscle] = useState<string>('Todos')
    const [error, setError] = useState<string>()
    const [isPending, startTransition] = useTransition()
    const [isCatalogExpanded, setIsCatalogExpanded] = useState(true)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const muscleGroups = ['Todos', ...MUSCLE_GROUPS]

    const filteredExercises = exercises.filter(ex => {
        const normalizedSearch = normalizeString(search)
        const isSecondary = ex.secondary_muscles?.some(m => m === selectedMuscle) || false
        const matchesMuscle = selectedMuscle === 'Todos' || ex.muscle_group === selectedMuscle || isSecondary
        const matchesSearch = normalizeString(ex.name).includes(normalizedSearch) || 
                             normalizeString(ex.muscle_group || '').includes(normalizedSearch)
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
        if (!groupName.trim()) { setError('Ingresa o selecciona un grupo (ej. Mes 1).'); return }
        if (blocks.length === 0) { setError('Agrega al menos un ejercicio.'); return }
        setError(undefined)

        startTransition(async () => {
            const result = await createPlanAction({
                planId: initialPlan?.id,
                title: title.trim(),
                group_name: groupName.trim(),
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

    function handleLoadTemplate(template: any) {
        if (!template) return
        setTitle(template.title || '')
        setGroupName(template.group_name || '')
        setBlocks(
            template.workout_blocks?.sort((a: any, b: any) => a.order_index - b.order_index).map((b: any) => ({
                uid: `${b.exercise_id}-${Date.now()}-${Math.random()}`,
                exercise_id: b.exercise_id,
                exercise_name: b.exercises?.name || 'Unknown',
                muscle_group: b.exercises?.muscle_group || 'Unknown',
                sets: b.sets,
                reps: b.reps,
                target_weight_kg: b.target_weight_kg?.toString() || '',
                tempo: b.tempo || '',
                rir: b.rir || '',
                rest_time: b.rest_time || '',
                notes: b.notes || '',
            })) || []
        )
    }

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-60px)] -mx-4 -my-6 md:-mx-6 md:-my-8">
            {/* Top bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-border bg-background flex-shrink-0">
                <Link href={`/coach/clients/${client.id}`}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div className="flex-1 min-w-[150px]">
                    <p className="text-xs text-muted-foreground">Rutina para {client.full_name}</p>
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder={initialPlan ? "Editar nombre..." : "Nombre de la rutina…"}
                        className="w-full h-8 px-2 mt-1 text-sm font-bold bg-transparent border-b border-transparent focus:border-primary focus:outline-none"
                    />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <p className="text-xs text-muted-foreground mb-1">Grupo / Fase</p>
                    <input
                        list="existing-groups"
                        value={groupName}
                        onChange={e => setGroupName(e.target.value)}
                        placeholder="Ej. Mes 1, Hipertrofia..."
                        className="w-full max-w-[200px] h-9 px-3 text-sm rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                    />
                    <datalist id="existing-groups">
                        {existingGroups.map(g => (
                            <option key={g} value={g} />
                        ))}
                    </datalist>
                </div>
                
                {templates.length > 0 && !initialPlan && (
                    <Dialog>
                        <DialogTrigger className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                            <Copy className="w-4 h-4" />
                            <span className="hidden sm:inline">Plantillas</span>
                        </DialogTrigger>
                        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Cargar desde una plantilla</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-2 mt-4">
                                {templates.map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => handleLoadTemplate(t)}
                                        className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                                    >
                                        <div>
                                            <p className="font-semibold text-sm">{t.title}</p>
                                            <p className="text-xs text-muted-foreground">{t.workout_blocks?.length || 0} ejercicios</p>
                                        </div>
                                        <Plus className="w-4 h-4 text-primary" />
                                    </button>
                                ))}
                            </div>
                        </DialogContent>
                    </Dialog>
                )}

                {error && <p className="text-xs text-destructive max-w-40 text-right">{error}</p>}
                <button onClick={handleSave} disabled={isPending}
                    className={cn(
                        'flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all w-full md:w-auto',
                        'bg-gradient-to-r from-emerald-500 to-teal-600 text-white',
                        'hover:shadow-lg hover:shadow-emerald-500/25',
                        'disabled:opacity-60 disabled:cursor-not-allowed'
                    )}>
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isPending ? 'Guardando...' : (initialPlan ? 'Actualizar Rutina' : 'Guardar Rutina')}
                </button>
            </div>

            {/* Main split layout */}
            <div className="flex flex-col-reverse md:flex-row flex-1 overflow-hidden relative">
                {/* LEFT: Exercise catalog */}
                <div 
                    className={cn(
                        "flex-shrink-0 border-t md:border-t-0 md:border-r border-border flex flex-col bg-muted/30 transition-all duration-300 relative z-20",
                        isCatalogExpanded 
                            ? "h-[50vh] md:h-auto md:w-80" 
                            : "h-[48px] md:h-auto md:w-0 md:opacity-0 overflow-hidden"
                    )}
                >
                    <button 
                        className="md:hidden absolute left-1/2 -translate-x-1/2 top-0 w-16 h-4 flex items-center justify-center cursor-pointer z-30"
                        onClick={() => setIsCatalogExpanded(!isCatalogExpanded)}
                    >
                        <div className="w-8 h-1 rounded-full bg-border/80" />
                    </button>

                    <div className="p-4 space-y-3 border-b border-border">
                        <div className="flex items-center justify-between md:mb-1">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Catálogo</h3>
                            <button 
                                onClick={() => setIsCatalogExpanded(false)}
                                className="hidden md:flex p-1 hover:bg-muted rounded-md text-muted-foreground transition-colors"
                            >
                                <ChevronUp className="w-4 h-4 -rotate-90" />
                            </button>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar ejercicio…"
                                className="w-full h-9 pl-9 pr-3 text-sm rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground/30 focus:border-primary focus:outline-none transition-all" />
                        </div>
                        <div className="flex overflow-x-auto pb-1 hide-scrollbar">
                            <select 
                                value={selectedMuscle}
                                onChange={(e) => setSelectedMuscle(e.target.value)}
                                className="w-full h-9 px-3 text-sm rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer transition-all"
                            >
                                {muscleGroups.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredExercises.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
                                    <Search className="w-5 h-5 text-muted-foreground/30" />
                                </div>
                                <p className="text-xs text-muted-foreground">No encontramos nada con esos filtros</p>
                            </div>
                        ) : (
                            filteredExercises.map(ex => (
                                <button key={ex.id} onClick={() => addExercise(ex)}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-background hover:shadow-sm border border-transparent hover:border-border transition-all group">
                                    <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                        <Dumbbell className="w-4 h-4 text-primary/60 group-hover:text-primary transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground/80 group-hover:text-foreground truncate transition-colors">
                                            {ex.name}
                                        </p>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{ex.muscle_group}</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0" />
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Toggle button for desktop (hidden when expanded) */}
                {!isCatalogExpanded && (
                    <button 
                        onClick={() => setIsCatalogExpanded(true)}
                        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-primary text-white p-1.5 rounded-r-xl shadow-lg hover:pr-3 transition-all group"
                    >
                        <ChevronUp className="w-5 h-5 rotate-90 group-hover:scale-110 transition-transform" />
                    </button>
                )}

                {/* RIGHT: Plan canvas */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-background/50 pb-32 md:pb-8 transition-all duration-300">
                    <div className="max-w-4xl mx-auto">
                        {blocks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                                <div className="w-20 h-20 rounded-3xl bg-muted/50 border border-dashed border-border flex items-center justify-center mb-6">
                                    <Plus className="w-10 h-10 text-muted-foreground/20" />
                                </div>
                                <h3 className="text-lg font-bold text-foreground">Tu canvas está esperando</h3>
                                <p className="text-muted-foreground text-sm mt-2 max-w-xs mx-auto">
                                    Selecciona ejercicios del catálogo para empezar a construir la rutina de <span className="text-foreground font-medium">{client.full_name}</span>.
                                </p>
                                {!isCatalogExpanded && (
                                    <button 
                                        onClick={() => setIsCatalogExpanded(true)}
                                        className="mt-6 px-6 py-2 bg-primary/10 text-primary rounded-xl text-sm font-bold hover:bg-primary/20 transition-colors"
                                    >
                                        Abrir Catálogo
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Estructura de la Sesión</h2>
                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                                        {blocks.length} {blocks.length === 1 ? 'ejercicio' : 'ejercicios'}
                                    </span>
                                </div>
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
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
