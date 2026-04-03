'use client'

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from 'react'
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
    useDroppable,
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
    List,
    Activity
} from 'lucide-react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

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
    title: string
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
                'group relative flex flex-col bg-background dark:bg-[#0f172a] backdrop-blur-md border border-border dark:border-blue-900/30 rounded-xl overflow-hidden transition-all duration-300 shadow-sm dark:shadow-none',
                isDragging ? 'z-50 border-primary ring-4 ring-primary/20 shadow-2xl scale-105 opacity-50' : 'hover:border-primary/40 hover:bg-primary/5 hover:shadow-md dark:hover:border-primary/40 dark:hover:bg-blue-900/40'
            )}>
            <div className="flex items-center gap-3 p-3">
                <button {...attributes} {...listeners}
                    className="text-muted-foreground hover:text-primary cursor-grab active:cursor-grabbing p-1.5 rounded-lg hover:bg-muted dark:hover:bg-white/5 transition-colors flex-shrink-0">
                    <GripVertical className="w-4 h-4" />
                </button>
                
                <div className="flex-1 min-w-0" onClick={() => onEdit(block)}>
                    <p className="text-sm font-bold text-foreground truncate cursor-pointer group-hover:text-primary transition-colors">
                        {block.exercise_name}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1.5 bg-muted dark:bg-black/40 px-2 py-0.5 rounded-md border border-border dark:border-white/5 shadow-sm">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Sets</span>
                            <span className="text-[11px] font-bold text-foreground">{block.sets}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-muted dark:bg-black/40 px-2 py-0.5 rounded-md border border-border dark:border-white/5 shadow-sm">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Reps</span>
                            <span className="text-[11px] font-bold text-foreground">{block.reps || '–'}</span>
                        </div>
                        {block.target_weight_kg && (
                            <div className="flex items-center gap-1.5 bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 shadow-sm">
                                <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">Load</span>
                                <span className="text-[11px] font-bold text-primary">{block.target_weight_kg}kg</span>
                            </div>
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

// ─── Day Column Component ────────────────────────────────────────
function DayColumn({
    day,
    title,
    blocks,
    exercises,
    onAddExercise,
    onEditBlock,
    onRemoveBlock,
    onUpdateTitle,
}: {
    day: { id: number; name: string }
    title: string
    blocks: BuilderBlock[]
    exercises: Exercise[]
    onAddExercise: (dayId: number, exercise: Exercise) => void
    onEditBlock: (block: BuilderBlock) => void
    onRemoveBlock: (dayId: number, uid: string) => void
    onUpdateTitle: (dayId: number, title: string) => void
}) {
    const [search, setSearch] = useState('')
    const [isSearchOpen, setIsSearchOpen] = useState(false)

    const filtered = useMemo(() => {
        if (!search) return []
        return filterExercises(exercises, search, 'Todos').slice(0, 5)
    }, [exercises, search])

    const { setNodeRef } = useDroppable({
        id: `day-${day.id}`,
        data: {
            type: 'day',
            dayId: day.id
        }
    })

    return (
        <div className="flex flex-col h-full bg-card dark:bg-blue-950/10 backdrop-blur-xl border border-border dark:border-blue-900/20 rounded-2xl min-w-[280px] xl:min-w-[320px] w-full md:w-auto overflow-hidden shadow-sm dark:shadow-2xl">
            <div className="p-4 border-b border-border dark:border-white/10 bg-muted/50 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                        {day.name}
                    </h3>
                    <Badge variant="outline" className="bg-white/5 text-zinc-500 border-white/10 font-bold">
                        {blocks.length} UNITS
                    </Badge>
                </div>

                <div className="relative mb-4 group">
                    <Edit2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 group-hover:text-primary transition-colors" />
                    <input 
                        value={title}
                        onChange={(e) => onUpdateTitle(day.id, e.target.value)}
                        placeholder="TITULO DEL DIA (EJ: EMPUJE)"
                        className="w-full h-9 pl-9 pr-3 text-[10px] font-bold uppercase tracking-widest rounded-lg bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground"
                    />
                </div>
                
                {/* Quick Search - Professional look */}
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
                    
                    {isSearchOpen && search && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-white/10 rounded-xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)] z-50 overflow-hidden">
                            {filtered.length > 0 ? (
                                filtered.map(ex => (
                                    <button 
                                        key={ex.id}
                                        onClick={() => {
                                            onAddExercise(day.id, ex)
                                            setSearch('')
                                            setIsSearchOpen(false)
                                        }}
                                        className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group"
                                    >
                                        <p className="text-xs font-bold text-zinc-300 group-hover:text-primary transition-colors">{ex.name}</p>
                                        <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-0.5 font-bold">{ex.muscle_group}</p>
                                    </button>
                                ))
                            ) : (
                                <p className="p-4 text-[10px] text-zinc-600 text-center font-bold uppercase tracking-widest">Sin Coincidencias</p>
                            )}
                            <button 
                                onClick={() => setIsSearchOpen(false)}
                                className="w-full py-3 text-[10px] text-primary bg-primary/5 hover:bg-primary/10 transition-colors font-bold uppercase tracking-[0.2em] border-t border-white/5"
                            >
                                Cerrar Terminal
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div ref={setNodeRef} className="flex-1 overflow-y-auto p-3 pb-32 space-y-3 min-h-[400px]">
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
                    <div className="flex flex-col items-center justify-center py-20 opacity-10">
                        <Activity className="w-12 h-12 mb-4" />
                        <p className="text-[11px] font-bold uppercase tracking-[0.3em]">No Data</p>
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
    const { t } = useTranslation()
    const [programName, setProgramName] = useState(initialProgram?.name || '')
    const [weeksToRepeat, setWeeksToRepeat] = useState(initialProgram?.weeks_to_repeat || 4)
    const [activeTab, setActiveTab] = useState('1')
    
    const isAssigned = !!initialProgram?.client_id
    
    // Initialize days 1-7
    const [days, setDays] = useState<DayState[]>(() => {
        const baseDays: DayState[] = DAYS_OF_WEEK.map(d => ({ id: d.id, title: '', blocks: [] as BuilderBlock[] }))
        
        if (initialProgram?.workout_plans) {
            initialProgram.workout_plans.forEach((plan: any) => {
                const dayIndex = baseDays.findIndex(d => d.id === plan.day_of_week)
                if (dayIndex !== -1) {
                    baseDays[dayIndex].title = plan.title || ''
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
    const [sheetHeight, setSheetHeight] = useState(60)
    const [isDraggingSheet, setIsDraggingSheet] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [isMobile, setIsMobile] = useState<boolean>(false)
    const [mounted, setMounted] = useState(false)
    const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)

    const touchStartY = useRef(0)
    const initialSheetHeight = useRef(60)

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY
        initialSheetHeight.current = sheetHeight
        setIsDraggingSheet(true)
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDraggingSheet) return
        const deltaY = e.touches[0].clientY - touchStartY.current
        const deltaVh = (deltaY / window.innerHeight) * 100
        const newHeight = Math.max(30, Math.min(85, initialSheetHeight.current - deltaVh))
        setSheetHeight(newHeight)
    }

    const handleTouchEnd = (e: React.TouchEvent) => {
        setIsDraggingSheet(false)
        if (sheetHeight > 70) {
            setSheetHeight(80)
        } else if (sheetHeight < 50) {
            setIsCatalogOpen(false)
            setTimeout(() => setSheetHeight(60), 300)
        } else {
            setSheetHeight(60)
        }
    }

    const horizontalScrollRef = useRef<HTMLDivElement>(null)

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

    const updateDayTitle = useCallback((dayId: number, title: string) => {
        setDays(prev => prev.map(d => d.id === dayId ? { ...d, title } : d))
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
                        title: d.title || `${programName} - Día ${d.id}`,
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
        <div className="flex flex-col h-[calc(100vh-130px)] md:h-[calc(100vh-60px)] -mx-4 -my-6 md:-mx-6 md:-my-8 bg-transparent overflow-hidden relative">
            {/* Header Area */}
            <div className={cn(
                "flex flex-col border-b border-border dark:border-white/10 bg-card dark:bg-black/40 backdrop-blur-xl p-4 md:px-8 md:py-4 gap-4 flex-shrink-0 transition-all duration-500 ease-in-out shadow-sm dark:shadow-2xl relative",
                isCatalogOpen && "md:opacity-100 md:h-auto md:p-4 md:pointer-events-auto h-0 p-0 opacity-0 overflow-hidden pointer-events-none"
            )}>
                <div className="flex items-center gap-3 md:gap-4">
                    <Link href={client ? `/coach/clients/${client.id}` : '/coach/workout-programs'}
                        className="p-2 md:p-2.5 rounded-xl text-muted-foreground hover:text-foreground border border-border hover:border-muted-foreground/30 hover:bg-secondary dark:border-white/5 dark:hover:border-white/20 dark:hover:bg-white/5 transition-all">
                        <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg md:text-xl font-bold text-foreground uppercase tracking-tighter font-display truncate">
                            Diseño de Protocolo
                        </h1>
                        <p className="text-[9px] md:text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-0.5 md:mt-1 truncate">
                            {client ? `TARGET: ${client.full_name}` : 'MODO: PLANTILLA MAESTRA'}
                        </p>
                    </div>
                    
                    {/* Botón Guardar en Desktop */}
                    <button 
                        onClick={handleSave} 
                        disabled={isPending}
                        className={cn(
                            'hidden md:flex items-center gap-2 px-8 py-3 text-[11px] uppercase tracking-widest font-bold rounded-xl transition-all shadow-[0_0_20px_-5px_rgba(0,122,255,0.4)]',
                            'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02]',
                            'disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none'
                        )}
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isPending ? 'Ejecutando...' : 'Desplegar Protocolo'}
                    </button>
                </div>

                {/* Desktop and Tablet config inputs */}
                <div className={cn(
                    "hidden md:grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden transition-all duration-300 ease-in-out",
                    isHeaderCollapsed ? "h-0 opacity-0 mt-0" : "h-auto opacity-100 mt-2"
                )}>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-1 flex items-center justify-between">
                            Designación
                            {isAssigned && (
                                <span className="text-primary normal-case font-medium">Bloqueado (Activo)</span>
                            )}
                        </label>
                        <div className="relative">
                            <Edit2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input 
                                value={programName}
                                onChange={e => setProgramName(e.target.value)}
                                disabled={isAssigned}
                                placeholder="EJ: HYPERTROPHY BLOCK 1"
                                className={cn(
                                    "h-12 pl-11 rounded-xl bg-secondary/50 dark:bg-black/50 border-border dark:border-white/10 text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all font-bold text-xs uppercase tracking-widest placeholder:text-muted-foreground",
                                    isAssigned && "bg-muted dark:bg-white/5 cursor-not-allowed opacity-50"
                                )}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-1">Duración del Ciclo</label>
                        <div className="relative">
                            <Repeat className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <select 
                                value={weeksToRepeat}
                                onChange={e => setWeeksToRepeat(parseInt(e.target.value))}
                                className="w-full h-12 pl-11 pr-10 rounded-xl bg-secondary/50 dark:bg-black/50 border border-border dark:border-white/10 text-foreground font-bold text-xs uppercase tracking-widest focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all appearance-none outline-none"
                            >
                                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(w => (
                                    <option key={w} value={w} className="bg-background dark:bg-zinc-900">{w} {w === 1 ? 'SEMANA' : 'SEMANAS'}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        </div>
                    </div>
                </div>

                {/* Toggle Button for Desktop Header */}
                <button
                    onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                    className="hidden md:flex absolute -bottom-3 left-1/2 -translate-x-1/2 bg-card border border-border dark:border-white/10 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shadow-sm z-20"
                    title={isHeaderCollapsed ? "Expandir configuración" : "Colapsar configuración"}
                >
                    {isHeaderCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>

                {/* Mobile: Compact Config Toggle */}
                <div className="md:hidden flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger className="flex-1 flex items-center justify-between h-10 px-4 rounded-lg bg-secondary/50 dark:bg-white/5 border border-border dark:border-white/10 text-[10px] font-bold uppercase tracking-widest overflow-hidden">
                            <span className="truncate">{programName || 'Configurar Plan'}</span>
                            <ChevronDown className="w-3 h-3 ml-2 flex-shrink-0" />
                        </PopoverTrigger>
                        <PopoverContent className="w-[calc(100vw-2rem)] p-4 bg-background/95 backdrop-blur-xl border-border dark:border-white/10 shadow-2xl rounded-2xl">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-1">Designación</label>
                                    <Input 
                                        value={programName}
                                        onChange={e => setProgramName(e.target.value)}
                                        disabled={isAssigned}
                                        placeholder="EJ: BLOQUE 1"
                                        className="h-10 text-xs font-bold uppercase tracking-widest"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-1">Duración</label>
                                    <select 
                                        value={weeksToRepeat}
                                        onChange={e => setWeeksToRepeat(parseInt(e.target.value))}
                                        className="w-full h-10 px-3 rounded-md bg-secondary dark:bg-white/5 border border-border text-xs font-bold uppercase tracking-widest outline-none"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(w => (
                                            <option key={w} value={w}>{w} {w === 1 ? 'SEMANA' : 'SEMANAS'}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                    
                    <button 
                        onClick={handleSave} 
                        disabled={isPending}
                        className="w-12 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg active:scale-95 transition-all"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Scrollable Board (Desktop) / Tabs (Mobile) */}
            <div className="flex-1 overflow-hidden bg-transparent">
                <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCorners} 
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex h-full">
                        {/* Sidebar Catalog (Desktop) */}
                        <aside className="hidden md:block w-[280px] xl:w-[320px] border-r border-border dark:border-white/10 bg-card dark:bg-black/40 backdrop-blur-xl h-full overflow-hidden shadow-sm dark:shadow-2xl relative z-10 flex-shrink-0">
                            <DraggableExerciseCatalog exercises={exercises} />
                        </aside>

                        <div className="flex-1 overflow-hidden flex flex-col relative">
                            {/* Background ambient light for builder area */}
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,122,255,0.05)_0%,rgba(0,0,0,0)_70%)] pointer-events-none" />

                            {/* Desktop View: Horizontal Scroll Board */}
                            <div 
                                ref={horizontalScrollRef}
                                onWheel={(e) => {
                                    if (horizontalScrollRef.current) {
                                        // Allow horizontal scroll with mouse wheel
                                        const target = e.target as HTMLElement;
                                        const isScrollableVertical = target.closest('.overflow-y-auto');
                                        
                                        if (e.deltaY !== 0 && !isScrollableVertical) {
                                            e.preventDefault();
                                            horizontalScrollRef.current.scrollLeft += e.deltaY;
                                        }
                                    }
                                }}
                                className="hidden md:flex gap-6 h-full p-8 overflow-x-auto relative z-10 custom-scrollbar"
                            >
                                {mounted && !isMobile && DAYS_OF_WEEK.map(day => (
                                    <DayColumn
                                        key={day.id}
                                        day={day}
                                        title={days.find(d => d.id === day.id)?.title || ''}
                                        blocks={days.find(d => d.id === day.id)?.blocks || []}
                                        exercises={exercises}
                                        onAddExercise={addExercise}
                                        onEditBlock={setEditingBlock}
                                        onRemoveBlock={removeBlock}
                                        onUpdateTitle={updateDayTitle}
                                    />
                                ))}
                            </div>

                            {/* Mobile View: Tabs + Catalog Trigger */}
                            <div className="flex md:hidden flex-col h-full relative z-10">
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                                    <TabsList className={cn(
                                        "flex w-full overflow-x-auto justify-start bg-background dark:bg-black/90 backdrop-blur-md border-b border-border dark:border-white/10 rounded-none h-12 px-2 z-10 sticky top-0 shrink-0",
                                    )}>
                                        {DAYS_OF_WEEK.map(day => (
                                            <TabsTrigger 
                                                key={day.id} 
                                                value={day.id.toString()}
                                                className="px-4 text-[9px] font-bold uppercase tracking-widest text-muted-foreground data-[state=active]:text-primary data-[state=active]:bg-primary/5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none transition-all flex-shrink-0"
                                            >
                                                {day.name.substring(0, 3)}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                    <div className={cn(
                                        "flex-1 overflow-hidden transition-all duration-500 ease-in-out",
                                    )}>
                                        {mounted && isMobile && DAYS_OF_WEEK.map(day => (
                                            <TabsContent 
                                                key={day.id} 
                                                value={day.id.toString()} 
                                                className="h-full p-4 mt-0"
                                            >
                                                <DayColumn
                                                    day={day}
                                                    title={days.find(d => d.id === day.id)?.title || ''}
                                                    blocks={days.find(d => d.id === day.id)?.blocks || []}
                                                    exercises={exercises}
                                                    onAddExercise={addExercise}
                                                    onEditBlock={setEditingBlock}
                                                    onRemoveBlock={removeBlock}
                                                    onUpdateTitle={updateDayTitle}
                                                />
                                            </TabsContent>
                                        ))}
                                    </div>
                                </Tabs>

                                {/* Mobile Floating Button (FAB) - Elevated to avoid Bottom Nav */}
                                {!isCatalogOpen && (
                                    <button
                                        onClick={() => setIsCatalogOpen(true)}
                                        className="fixed bottom-[110px] right-6 w-14 h-14 rounded-full bg-primary text-white shadow-[0_8px_25px_rgba(0,122,255,0.4)] hover:scale-105 active:scale-90 transition-all z-40 border border-white/20 flex items-center justify-center"
                                    >
                                        <Plus className="w-6 h-6" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <DragOverlay dropAnimation={null}>
                        {activeId && activeOverlayItem ? (
                            <div className="bg-primary/20 backdrop-blur-xl border border-primary text-white p-4 rounded-xl shadow-[0_0_30px_rgba(0,122,255,0.5)] min-w-[240px] opacity-100 scale-105 pointer-events-none z-[100] flex items-center gap-3">
                                <Activity className="w-5 h-5 text-primary" />
                                <div>
                                    <p className="text-sm font-bold leading-tight">{activeOverlayItem.name}</p>
                                    <p className="text-[10px] text-primary font-bold uppercase tracking-widest">{activeOverlayItem.muscle}</p>
                                </div>
                            </div>
                        ) : null}
                    </DragOverlay>

                    {/* Mobile Exercise Catalog Sheet */}
                    <Sheet open={isCatalogOpen} onOpenChange={(open) => { 
                        if (!open) {
                            setIsCatalogOpen(false)
                            setTimeout(() => setSheetHeight(60), 300)
                        }
                    }}>
                        <SheetContent 
                            side="bottom" 
                            className={cn(
                                "p-0 rounded-t-[2rem] overflow-hidden border-x-0 border-b-0 border-t border-border dark:border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.2)] dark:shadow-[0_-20px_50px_rgba(0,0,0,0.5)] z-50 flex flex-col bg-background/95 backdrop-blur-2xl",
                                !isDraggingSheet && "transition-all duration-300 ease-out"
                            )}
                            style={{ height: `${sheetHeight}vh` }}
                            showCloseButton={false}
                        >
                            {/* Handle visual */}
                            <div 
                                className="w-full pt-4 pb-2 cursor-grab active:cursor-grabbing flex justify-center"
                                onTouchStart={handleTouchStart}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onClick={() => setSheetHeight(sheetHeight === 80 ? 60 : 80)}
                            >
                                <div className="w-12 h-1.5 bg-muted-foreground/20 dark:bg-white/20 rounded-full shrink-0" />
                            </div>
                            
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
                                className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-secondary/80 dark:bg-white/10 border border-border dark:border-white/20 text-foreground dark:text-white shadow-xl hover:bg-secondary dark:hover:bg-white/20 transition-all active:scale-90 z-[60]"
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
                <SheetContent side="right" className="w-full sm:max-w-md p-0 gap-0 overflow-y-auto bg-background/95 backdrop-blur-3xl border-l border-border dark:border-white/10">
                    <SheetHeader className="p-8 border-b border-border dark:border-white/10 sticky top-0 bg-background/50 dark:bg-black/50 backdrop-blur-md z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(0,122,255,0.2)]">
                                <Dumbbell className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <SheetTitle className="text-left text-lg font-bold text-foreground leading-tight font-display">{editingBlock?.exercise_name}</SheetTitle>
                                <p className="text-[10px] text-primary uppercase font-bold tracking-[0.2em] mt-1">{editingBlock?.muscle_group}</p>
                            </div>
                        </div>
                    </SheetHeader>
                    
                    {editingBlock && (
                        <div className="p-8 space-y-8">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                        Series Target
                                        <InfoTooltip content={t('tooltip.sets')} />
                                    </label>
                                    <Input 
                                        type="number" 
                                        value={editingBlock.sets || ''}
                                        onChange={e => setEditingBlock({...editingBlock, sets: e.target.value === '' ? 0 : parseInt(e.target.value) || 0})}
                                        className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground text-center text-lg font-bold focus:border-primary"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                        Repeticiones
                                        <InfoTooltip content={t('tooltip.reps')} />
                                    </label>
                                    <Input 
                                        value={editingBlock.reps}
                                        onChange={e => setEditingBlock({...editingBlock, reps: e.target.value})}
                                        placeholder="Ej. 8-12"
                                        className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground text-center text-lg font-bold focus:border-primary"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                        Carga (KG)
                                        <InfoTooltip content={t('tooltip.weight')} />
                                    </label>
                                    <Input 
                                        value={editingBlock.target_weight_kg}
                                        onChange={e => setEditingBlock({...editingBlock, target_weight_kg: e.target.value})}
                                        placeholder="Opcional"
                                        className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                        RIR / RPE
                                        <InfoTooltip content={t('tooltip.rir')} />
                                    </label>
                                    <Input 
                                        value={editingBlock.rir}
                                        onChange={e => setEditingBlock({...editingBlock, rir: e.target.value})}
                                        placeholder="Ej. RIR 2"
                                        className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                        Tempo
                                        <InfoTooltip content={t('tooltip.tempo')} />
                                    </label>
                                    <Input 
                                        value={editingBlock.tempo}
                                        onChange={e => setEditingBlock({...editingBlock, tempo: e.target.value})}
                                        placeholder="Ej. 3-1-X-1"
                                        className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                        Recuperación
                                        <InfoTooltip content={t('tooltip.rest')} />
                                    </label>
                                    <Input 
                                        value={editingBlock.rest_time}
                                        onChange={e => setEditingBlock({...editingBlock, rest_time: e.target.value})}
                                        placeholder="Ej. 120s"
                                        className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                    Instrucciones de Protocolo
                                    <InfoTooltip content={t('tooltip.notes')} />
                                </label>
                                <textarea 
                                    className="w-full h-32 p-4 text-sm rounded-xl bg-secondary dark:bg-white/5 border border-border dark:border-white/10 text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all resize-none placeholder:text-muted-foreground"
                                    value={editingBlock.notes}
                                    onChange={e => setEditingBlock({...editingBlock, notes: e.target.value})}
                                    placeholder="Detalles biomécanicos o notas..."
                                />
                            </div>

                            <button 
                                onClick={() => handleBlockUpdate(editingBlock)}
                                disabled={!editingBlock.sets || editingBlock.sets < 1 || !editingBlock.reps?.trim()}
                                className="w-full py-4 mt-4 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl shadow-[0_0_20px_rgba(0,122,255,0.4)] hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                            >
                                {(!editingBlock.sets || editingBlock.sets < 1 || !editingBlock.reps?.trim()) 
                                    ? 'DATA INCOMPLETA' 
                                    : 'SINCRONIZAR BLOQUE'}
                            </button>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}
