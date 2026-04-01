'use client'

import { useState, useCallback, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    DndContext,
    closestCenter,
    closestCorners,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragOverEvent,
    DragStartEvent,
    defaultDropAnimationSideEffects,
    type DropAnimation,
    DragOverlay,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    GripVertical, Plus, X, Save, ArrowLeft, Search,
    Loader2, ChevronDown, ChevronUp, Dumbbell, Copy, Repeat, Edit2, Trash2,
    LayoutGrid,
    List
} from 'lucide-react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, filterExercises } from '@/lib/utils'
import { saveWorkoutProgramAction, type WorkoutProgramInput } from './actions'
import type { Tables } from '@/lib/database.types'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'

type Client = Tables<'clients'>
type Exercise = Tables<'exercises'>

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DraggableExerciseCatalog } from './DraggableExerciseCatalog'

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

interface DayState {
    id: number // 1 to 7
    blocks: BuilderBlock[]
}

const DAYS_OF_WEEK = [
    { id: 1, name: 'Lunes' },
    { id: 2, name: 'Martes' },
    { id: 3, name: 'Miércoles' },
    { id: 4, name: 'Jueves' },
    { id: 5, name: 'Viernes' },
    { id: 6, name: 'Sábado' },
    { id: 7, name: 'Domingo' },
]

// ─── Sortable Block Component ────────────────────────────────────
function SortableBlock({
    block,
    dayId,
    index,
    onEdit,
    onRemove,
}: {
    block: BuilderBlock
    dayId: number
    index: number
    onEdit: (block: BuilderBlock) => void
    onRemove: (dayId: number, uid: string) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ 
            id: block.uid,
            data: {
                type: 'block',
                block,
                dayId
            }
        })

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    }

    return (
        <div ref={setNodeRef} style={style}
            className={cn(
                'bg-card border rounded-lg overflow-hidden transition-all duration-200 group relative',
                isDragging ? 'z-50 border-primary ring-2 ring-primary/20 shadow-xl opacity-50' : 'border-border shadow-sm hover:border-muted-foreground/30'
            )}>
            <div className="flex items-center gap-2 px-2 py-2">
                <button {...attributes} {...listeners}
                    className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing p-1 rounded transition-colors flex-shrink-0">
                    <GripVertical className="w-3.5 h-3.5" />
                </button>
                
                <div className="flex-1 min-w-0" onClick={() => onEdit(block)}>
                    <p className="text-[13px] font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors">
                        {block.exercise_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                            {block.sets}x{block.reps || '–'}
                        </span>
                        {block.target_weight_kg && (
                            <span className="text-[10px] text-primary font-medium">
                                {block.target_weight_kg}kg
                            </span>
                        )}
                    </div>
                </div>

                <button onClick={(e) => {
                    e.stopPropagation();
                    onRemove(dayId, block.uid);
                }}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    title="Quitar ejercicio">
                    <X className="w-5 h-5 stroke-[3px]" />
                </button>
            </div>
        </div>
    )
}

// ─── Day Column Component ────────────────────────────────────────
function DayColumn({
    day,
    blocks,
    exercises,
    onAddExercise,
    onEditBlock,
    onRemoveBlock,
}: {
    day: { id: number; name: string }
    blocks: BuilderBlock[]
    exercises: Exercise[]
    onAddExercise: (dayId: number, exercise: Exercise) => void
    onEditBlock: (block: BuilderBlock) => void
    onRemoveBlock: (dayId: number, uid: string) => void
}) {
    const [search, setSearch] = useState('')
    const [isSearchOpen, setIsSearchOpen] = useState(false)

    const filtered = useMemo(() => {
        if (!search) return []
        return filterExercises(exercises, search, 'Todos').slice(0, 5)
    }, [exercises, search])

    const { setNodeRef } = useSortable({
        id: `day-${day.id}`,
        data: {
            type: 'day',
            dayId: day.id
        }
    })

    return (
        <div className="flex flex-col h-full bg-muted/20 border border-border rounded-xl min-w-[280px] w-full md:w-auto overflow-hidden">
            <div className="p-3 border-b border-border bg-card/50">
                <h3 className="text-sm font-bold flex items-center justify-between">
                    {day.name}
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-normal">
                        {blocks.length} ej.
                    </span>
                </h3>
                
                {/* Quick Search - Solo Desktop */}
                <div className="relative mt-2 hidden md:block">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                    <input 
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setIsSearchOpen(true)
                        }}
                        onFocus={() => setIsSearchOpen(true)}
                        placeholder="Añadir ejercicio..."
                        className="w-full h-8 pl-8 pr-2 text-xs rounded-lg bg-background border border-border focus:border-primary focus:outline-none transition-all"
                    />
                    
                    {isSearchOpen && search && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                            {filtered.length > 0 ? (
                                filtered.map(ex => (
                                    <button 
                                        key={ex.id}
                                        onClick={() => {
                                            onAddExercise(day.id, ex)
                                            setSearch('')
                                            setIsSearchOpen(false)
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors border-b border-border last:border-0"
                                    >
                                        <p className="font-medium truncate">{ex.name}</p>
                                        <p className="text-[9px] text-muted-foreground uppercase">{ex.muscle_group}</p>
                                    </button>
                                ))
                            ) : (
                                <p className="p-3 text-[10px] text-muted-foreground text-center">No se encontraron resultados</p>
                            )}
                            <button 
                                onClick={() => setIsSearchOpen(false)}
                                className="w-full py-1.5 text-[10px] text-primary bg-primary/5 hover:bg-primary/10 transition-colors font-medium"
                            >
                                Cerrar
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
                <SortableContext items={blocks.map(b => b.uid)} strategy={verticalListSortingStrategy}>
                    {blocks.map((block, index) => (
                        <SortableBlock
                            key={block.uid}
                            block={block}
                            dayId={day.id}
                            index={index}
                            onEdit={onEditBlock}
                            onRemove={onRemoveBlock}
                        />
                    ))}
                </SortableContext>
                
                {blocks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 opacity-20">
                        <Dumbbell className="w-8 h-8 mb-2" />
                        <p className="text-[10px] font-medium uppercase tracking-widest">Descanso</p>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Main Weekly Builder ──────────────────────────────────────────
export function WeeklyPlanBuilder({
    client,
    exercises,
    initialProgram,
}: {
    client?: Pick<Client, 'id' | 'full_name' | 'email'>
    exercises: Exercise[]
    initialProgram?: any
}) {
    const router = useRouter()
    const [programName, setProgramName] = useState(initialProgram?.name || '')
    const [weeksToRepeat, setWeeksToRepeat] = useState(initialProgram?.weeks_to_repeat || 4)
    const [activeTab, setActiveTab] = useState('1')
    
    const isAssigned = !!initialProgram?.client_id
    
    // Initialize days 1-7
    const [days, setDays] = useState<DayState[]>(() => {
        const baseDays = DAYS_OF_WEEK.map(d => ({ id: d.id, blocks: [] as BuilderBlock[] }))
        
        if (initialProgram?.workout_plans) {
            initialProgram.workout_plans.forEach((plan: any) => {
                const dayIndex = baseDays.findIndex(d => d.id === plan.day_of_week)
                if (dayIndex !== -1) {
                    baseDays[dayIndex].blocks = plan.workout_blocks
                        ?.sort((a: any, b: any) => a.order_index - b.order_index)
                        .map((b: any) => ({
                            uid: b.id,
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
                }
            })
        }
        
        return baseDays
    })

    const [editingBlock, setEditingBlock] = useState<BuilderBlock | null>(null)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeData, setActiveData] = useState<any>(null)
    const [isCatalogOpen, setIsCatalogOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [isMobile, setIsMobile] = useState<boolean>(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const addExercise = useCallback((dayId: number, exercise: Exercise) => {
        const newBlock: BuilderBlock = {
            uid: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        }
        setDays(prev => prev.map(d => d.id === dayId ? { ...d, blocks: [...d.blocks, newBlock] } : d))
        toast.success(`Añadido: ${exercise.name}`)
    }, [])

    const removeBlock = useCallback((dayId: number, uid: string) => {
        setDays(prev => prev.map(d => d.id === dayId ? { ...d, blocks: d.blocks.filter(b => b.uid !== uid) } : d))
    }, [])

    const handleBlockUpdate = (updatedBlock: BuilderBlock) => {
        setDays(prev => prev.map(d => ({
            ...d,
            blocks: d.blocks.map(b => b.uid === updatedBlock.uid ? updatedBlock : b)
        })))
        setEditingBlock(null)
    }

    // DnD Handlers
    function handleDragStart(event: DragStartEvent) {
        const { active } = event
        setActiveId(active.id as string)
        setActiveData(active.data.current)
    }

    function handleDragOver(event: DragOverEvent) {
        const { active, over } = event
        if (!over) return

        const activeId = active.id as string
        const overId = over.id as string

        const activeData = active.data.current
        const overData = over.data.current

        if (!activeData || activeData.type !== 'block') return

        const activeDayId = activeData.dayId
        let overDayId = overData?.dayId

        // If hovering over a day column
        if (overData?.type === 'day') {
            overDayId = overData.dayId
        }

        if (!overDayId || activeDayId === overDayId) return

        setDays(prev => {
            const activeDay = prev.find(d => d.id === activeDayId)
            const overDay = prev.find(d => d.id === overDayId)
            
            if (!activeDay || !overDay) return prev

            const activeBlockIndex = activeDay.blocks.findIndex(b => b.uid === activeId)
            const activeBlock = activeDay.blocks[activeBlockIndex]

            // Remove from source day
            const newActiveBlocks = [...activeDay.blocks]
            newActiveBlocks.splice(activeBlockIndex, 1)

            // Add to destination day
            const newOverBlocks = [...overDay.blocks]
            const overBlockIndex = overDay.blocks.findIndex(b => b.uid === overId)
            
            if (overBlockIndex === -1) {
                newOverBlocks.push({ ...activeBlock })
            } else {
                newOverBlocks.splice(overBlockIndex, 0, { ...activeBlock })
            }

            // Update data in the active item for the next drag event
            active.data.current = { ...activeData, dayId: overDayId }

            return prev.map(d => {
                if (d.id === activeDayId) return { ...d, blocks: newActiveBlocks }
                if (d.id === overDayId) return { ...d, blocks: newOverBlocks }
                return d
            })
        })
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over) {
            setActiveId(null)
            setActiveData(null)
            return
        }

        const activeId = active.id as string
        const overId = over.id as string
        const activeData = active.data.current
        const overData = over.data.current

        // Handle dropping a new exercise from the catalog
        if (activeData?.type === 'new-exercise') {
            const dayId = overData?.dayId
            if (dayId) {
                addExercise(dayId, activeData.exercise)
            }
        } else if (activeId !== overId) {
            // Existing logic for blocks
            const dayId = activeData?.dayId

            if (dayId) {
                setDays(prev => prev.map(d => {
                    if (d.id === dayId) {
                        const oldIndex = d.blocks.findIndex(b => b.uid === activeId)
                        const newIndex = d.blocks.findIndex(b => b.uid === overId)
                        return { ...d, blocks: arrayMove(d.blocks, oldIndex, newIndex) }
                    }
                    return d
                }))
            }
        }
        
        setActiveId(null)
        setActiveData(null)
    }

    const handleSave = () => {
        if (!programName.trim()) { toast.error('Ingresa el nombre del programa'); return }
        
        const hasExercises = days.some(d => d.blocks.length > 0)
        if (!hasExercises) { toast.error('Agrega al menos un ejercicio en algún día'); return }

        // Validar que todos los ejercicios tengan series y reps válidas
        for (const day of days) {
            for (const block of day.blocks) {
                if (!block.sets || block.sets < 1 || !block.reps?.trim()) {
                    toast.error(`El ejercicio "${block.exercise_name}" en el día ${DAYS_OF_WEEK.find(d => d.id === day.id)?.name} necesita series y reps válidas`);
                    return;
                }
            }
        }

        startTransition(async () => {
            const payload: WorkoutProgramInput = {
                programId: initialProgram?.id,
                clientId: client?.id || null,
                programName: programName.trim(),
                weeksToRepeat,
                days: days
                    .filter(d => d.blocks.length > 0)
                    .map(d => ({
                        day_of_week: d.id,
                        blocks: d.blocks.map(b => ({
                            exercise_id: b.exercise_id,
                            sets: b.sets,
                            reps: b.reps,
                            target_weight_kg: b.target_weight_kg ? parseFloat(b.target_weight_kg) : null,
                            tempo: b.tempo || null,
                            rir: b.rir || null,
                            rest_time: b.rest_time || null,
                            notes: b.notes || null,
                        }))
                    }))
            }

            const result = await saveWorkoutProgramAction(payload)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Programa guardado con éxito')
                if (client) {
                    router.push(`/coach/clients/${client.id}`)
                } else {
                    router.push('/coach/workout-programs')
                }
                router.refresh()
            }
        })
    }

    const activeOverlayItem = useMemo(() => {
        if (!activeId || !activeData) return null
        
        if (activeData.type === 'new-exercise') {
            return {
                name: activeData.exercise.name,
                muscle: activeData.exercise.muscle_group
            }
        }
        
        if (activeData.type === 'block') {
            return {
                name: activeData.block.exercise_name,
                muscle: activeData.block.muscle_group
            }
        }
        
        return null
    }, [activeId, activeData])

    return (
        <div className="flex flex-col h-[calc(100vh-130px)] md:h-[calc(100vh-60px)] -mx-4 -my-6 md:-mx-6 md:-my-8 bg-background overflow-hidden relative">
            {/* Header Area */}
            <div className={cn(
                "flex flex-col border-b border-border bg-card p-4 md:px-6 md:py-4 gap-4 flex-shrink-0 transition-all duration-500 ease-in-out",
                isCatalogOpen && "md:opacity-100 md:h-auto md:p-4 md:pointer-events-auto h-0 p-0 opacity-0 overflow-hidden pointer-events-none"
            )}>
                <div className="flex items-center gap-4">
                    <Link href={client ? `/coach/clients/${client.id}` : '/coach/workout-programs'}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">Planificación Semanal</h1>
                        <p className="text-xs text-muted-foreground">
                            {client ? `Alumno: ${client.full_name}` : 'Modo Plantilla'}
                        </p>
                    </div>
                    <button 
                        onClick={handleSave} 
                        disabled={isPending}
                        className={cn(
                            'flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-all shadow-lg',
                            'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90',
                            'disabled:opacity-50'
                        )}
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isPending ? 'Guardando...' : 'Guardar Programa'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center justify-between">
                            Nombre del Programa
                            {isAssigned && (
                                <span className="text-primary normal-case font-medium">Bloqueado para planes activos</span>
                            )}
                        </label>
                        <div className="relative">
                            <Edit2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                            <Input 
                                value={programName}
                                onChange={e => setProgramName(e.target.value)}
                                disabled={isAssigned}
                                placeholder="Ej. Hipertrofia Funcional"
                                className={cn(
                                    "h-10 pl-9 rounded-xl border-border/50 focus:border-primary transition-all",
                                    isAssigned && "bg-muted/50 cursor-not-allowed opacity-80"
                                )}
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Ciclo (Semanas)</label>
                        <div className="relative">
                            <Repeat className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                            <select 
                                value={weeksToRepeat}
                                onChange={e => setWeeksToRepeat(parseInt(e.target.value))}
                                className="w-full h-10 pl-9 pr-4 rounded-xl border border-border/50 bg-background text-sm focus:border-primary focus:outline-none transition-all appearance-none"
                            >
                                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(w => (
                                    <option key={w} value={w}>{w} {w === 1 ? 'semana' : 'semanas'}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Scrollable Board (Desktop) / Tabs (Mobile) */}
            <div className="flex-1 overflow-hidden bg-muted/10">
                <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCorners} 
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex h-full">
                        {/* Sidebar Catalog (Desktop) */}
                        <aside className="hidden md:block w-[300px] border-r bg-card p-4 h-full overflow-hidden">
                            <DraggableExerciseCatalog exercises={exercises} />
                        </aside>

                        <div className="flex-1 overflow-hidden flex flex-col">
                            {/* Desktop View: Horizontal Scroll Board */}
                            <div className="hidden md:flex gap-4 h-full p-6 overflow-x-auto">
                                {mounted && !isMobile && DAYS_OF_WEEK.map(day => (
                                    <DayColumn
                                        key={day.id}
                                        day={day}
                                        blocks={days.find(d => d.id === day.id)?.blocks || []}
                                        exercises={exercises}
                                        onAddExercise={addExercise}
                                        onEditBlock={setEditingBlock}
                                        onRemoveBlock={removeBlock}
                                    />
                                ))}
                            </div>

                            {/* Mobile View: Tabs + Catalog Trigger */}
                            <div className="flex md:hidden flex-col h-full relative">
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                                    <TabsList className={cn(
                                        "flex w-full overflow-x-auto justify-start bg-card border-b border-border rounded-none h-12 px-2 z-10 sticky top-0 shrink-0 shadow-sm",
                                    )}>
                                        {DAYS_OF_WEEK.map(day => (
                                            <TabsTrigger 
                                                key={day.id} 
                                                value={day.id.toString()}
                                                className="px-4 text-[10px] font-bold uppercase tracking-widest data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none transition-all"
                                            >
                                                {day.name.substring(0, 3)}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                    <div className={cn(
                                        "flex-1 overflow-hidden transition-all duration-500 ease-in-out",
                                        isCatalogOpen ? "pb-[50vh]" : "pb-20"
                                    )}>
                                        {mounted && isMobile && DAYS_OF_WEEK.map(day => (
                                            <TabsContent 
                                                key={day.id} 
                                                value={day.id.toString()} 
                                                className="h-full overflow-y-auto p-4 mt-0"
                                            >
                                                <DayColumn
                                                    day={day}
                                                    blocks={days.find(d => d.id === day.id)?.blocks || []}
                                                    exercises={exercises}
                                                    onAddExercise={addExercise}
                                                    onEditBlock={setEditingBlock}
                                                    onRemoveBlock={removeBlock}
                                                />
                                            </TabsContent>
                                        ))}
                                    </div>
                                </Tabs>

                                {/* Mobile Floating Button to Open Catalog */}
                                {!isCatalogOpen && (
                                    <button
                                        onClick={() => setIsCatalogOpen(true)}
                                        className="fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 px-6 h-12 rounded-full bg-green-500 text-white shadow-xl hover:scale-105 active:scale-95 transition-all z-40"
                                    >
                                        <Plus className="w-5 h-5" />
                                        <span className="text-sm font-bold uppercase tracking-wider">Añadir Ejercicios</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <DragOverlay dropAnimation={null}>
                        {activeId && activeOverlayItem ? (
                            <div className="bg-primary text-primary-foreground border border-primary p-3 rounded-lg shadow-2xl min-w-[200px] opacity-90 scale-105 pointer-events-none z-[100]">
                                <p className="text-sm font-bold">{activeOverlayItem.name}</p>
                                <p className="text-[10px] opacity-80 uppercase font-bold tracking-widest">{activeOverlayItem.muscle}</p>
                            </div>
                        ) : null}
                    </DragOverlay>

                    {/* Mobile Exercise Catalog Sheet */}
                    <Sheet open={isCatalogOpen} onOpenChange={(open) => { if (open) setIsCatalogOpen(true) }}>
                        <SheetContent 
                            side="bottom" 
                            className="h-[50vh] p-0 rounded-t-[2rem] overflow-hidden border-x-0 border-b-0 border-t border-border shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] z-50 flex flex-col transition-all duration-500 ease-in-out bg-card" 
                            showCloseButton={false}
                        >
                            {/* Handle visual */}
                            <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto my-3 shrink-0" />
                            
                            <div className="flex-1 overflow-hidden">
                                <DraggableExerciseCatalog 
                                    exercises={exercises} 
                                    onSelect={(ex) => addExercise(parseInt(activeTab), ex)}
                                    className="border-none shadow-none h-full rounded-none bg-transparent" 
                                />
                            </div>

                            {/* Botón de cerrar (X) flotante */}
                            <button 
                                onClick={() => setIsCatalogOpen(false)}
                                className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-background border border-border text-foreground shadow-xl hover:bg-muted transition-all active:scale-90 z-[60]"
                                aria-label="Cerrar catálogo"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </SheetContent>
                    </Sheet>
                </DndContext>
            </div>

            {/* Block Edit Drawer (Mobile) / Sheet (Desktop) */}
            <Sheet open={!!editingBlock} onOpenChange={() => setEditingBlock(null)}>
                <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 overflow-y-auto">
                    <SheetHeader className="p-6 border-b border-border sticky top-0 bg-background z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Dumbbell className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <SheetTitle className="text-left">{editingBlock?.exercise_name}</SheetTitle>
                                <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">{editingBlock?.muscle_group}</p>
                            </div>
                        </div>
                    </SheetHeader>
                    
                    {editingBlock && (
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase text-muted-foreground">Series</label>
                                    <Input 
                                        type="number" 
                                        value={editingBlock.sets || ''}
                                        onChange={e => setEditingBlock({...editingBlock, sets: e.target.value === '' ? 0 : parseInt(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase text-muted-foreground">Reps</label>
                                    <Input 
                                        value={editingBlock.reps}
                                        onChange={e => setEditingBlock({...editingBlock, reps: e.target.value})}
                                        placeholder="Ej. 8-12 o 15"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase text-muted-foreground">Peso (kg)</label>
                                    <Input 
                                        value={editingBlock.target_weight_kg}
                                        onChange={e => setEditingBlock({...editingBlock, target_weight_kg: e.target.value})}
                                        placeholder="Opcional"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase text-muted-foreground">RIR / RPE</label>
                                    <Input 
                                        value={editingBlock.rir}
                                        onChange={e => setEditingBlock({...editingBlock, rir: e.target.value})}
                                        placeholder="Ej. 2 RIR"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase text-muted-foreground">Tempo</label>
                                    <Input 
                                        value={editingBlock.tempo}
                                        onChange={e => setEditingBlock({...editingBlock, tempo: e.target.value})}
                                        placeholder="Ej. 3-0-1-0"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold uppercase text-muted-foreground">Descanso</label>
                                    <Input 
                                        value={editingBlock.rest_time}
                                        onChange={e => setEditingBlock({...editingBlock, rest_time: e.target.value})}
                                        placeholder="Ej. 90s"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold uppercase text-muted-foreground">Notas / Instrucciones</label>
                                <textarea 
                                    className="w-full h-24 p-3 text-sm rounded-xl bg-background border border-border focus:border-primary focus:outline-none transition-all resize-none"
                                    value={editingBlock.notes}
                                    onChange={e => setEditingBlock({...editingBlock, notes: e.target.value})}
                                    placeholder="Detalles sobre la ejecución..."
                                />
                            </div>

                            <button 
                                onClick={() => handleBlockUpdate(editingBlock)}
                                disabled={!editingBlock.sets || editingBlock.sets < 1 || !editingBlock.reps?.trim()}
                                className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {(!editingBlock.sets || editingBlock.sets < 1 || !editingBlock.reps?.trim()) 
                                    ? 'Completa los campos (Series y Reps)' 
                                    : 'Aplicar Cambios'}
                            </button>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}
