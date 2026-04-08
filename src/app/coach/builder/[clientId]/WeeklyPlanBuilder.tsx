'use client'

import { useState, useCallback, useMemo, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor,
    useSensor, useSensors, type DragEndEvent, type DragOverEvent, DragStartEvent, DragOverlay,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Save, ArrowLeft, Loader2, Settings, Plus, LayoutTemplate, Eye, Users, Undo2, Redo2, BarChart3, Printer, Search, RefreshCw, MoreVertical } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { saveWorkoutProgramAction, syncProgramFromTemplateAction, type WorkoutProgramInput } from './actions'
import type { Tables } from '@/lib/database.types'
import { toast } from 'sonner'
import { TemplatePickerDialog } from './components/TemplatePickerDialog'
import { ProgramPreviewDialog } from './components/ProgramPreviewDialog'
import { AssignToClientsDialog } from './components/AssignToClientsDialog'
import { MuscleBalancePanel } from './components/MuscleBalancePanel'
import { PrintProgramDialog } from './components/PrintProgramDialog'

import { usePlanBuilder, DAYS_OF_WEEK } from './hooks/usePlanBuilder'
import { DayColumn } from './components/DayColumn'
import { BlockEditSheet } from './components/BlockEditSheet'
import { ProgramConfigHeader } from './components/ProgramConfigHeader'
import { ProgramPhasesBar } from './components/ProgramPhasesBar'
import { ExerciseBlock } from './components/ExerciseBlock'
import { DraggableExerciseCatalog } from './DraggableExerciseCatalog'
import type { BuilderBlock, DayState, ProgramPhase } from './types'
import { getMuscleColor } from './muscle-colors'

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseProgramPhases(raw: unknown): ProgramPhase[] {
    if (raw == null) return []
    try {
        const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : []
        if (!Array.isArray(arr)) return []
        return arr.map((p: any, i: number) => ({
            name: String(p?.name || `Fase ${i + 1}`).slice(0, 80),
            weeks: Math.min(52, Math.max(1, Number(p?.weeks) || 1)),
            color: typeof p?.color === 'string' && p.color.startsWith('#') ? p.color : '#6366F1',
        }))
    } catch {
        return []
    }
}

function createDefaultBlock(exercise: Exercise): BuilderBlock {
    return {
        uid: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        muscle_group: exercise.muscle_group,
        gif_url: exercise.gif_url ?? undefined,
        video_url: exercise.video_url ?? undefined,
        sets: 3,
        reps: '8-12',
        target_weight_kg: '',
        tempo: '',
        rir: '',
        rest_time: '90s',
        notes: '',
        section: 'main',
        is_override: false,
    }
}

function trackRecentExercise(exerciseId: string) {
    try {
        const saved = localStorage.getItem('builder_recent_exercises')
        const ids: string[] = saved ? JSON.parse(saved) : []
        const updated = [exerciseId, ...ids.filter(id => id !== exerciseId)].slice(0, 8)
        localStorage.setItem('builder_recent_exercises', JSON.stringify(updated))
        window.dispatchEvent(new Event('recent_exercises_updated'))
    } catch { /* silently ignore storage errors */ }
}

type Client = Tables<'clients'>
type Exercise = Tables<'exercises'>
type BaseDays = typeof DAYS_OF_WEEK

export function WeeklyPlanBuilder({ client, exercises, initialProgram }: { client?: Partial<Client> | null, exercises: Exercise[], initialProgram?: any }) {
    const router = useRouter()

    const getInitialDays = (variant: 'A' | 'B' = 'A', structureType?: string, cyclLen?: number): DayState[] => {
        // Determine structure type and cycle length (prefer passed params over initialProgram)
        const sType = structureType ?? initialProgram?.program_structure_type ?? 'weekly'
        const cLen = cyclLen ?? initialProgram?.cycle_length ?? 7

        if (sType === 'cycle') {
            // Build N days for a cycle program
            const cycleDays = Array.from({ length: cLen }, (_, i) => ({
                id: i + 1,
                name: `Día ${i + 1}`,
                title: '',
                blocks: [] as BuilderBlock[]
            }))
            if (!initialProgram?.workout_plans?.length) return cycleDays
            return cycleDays.map(d => {
                const plan = initialProgram.workout_plans?.find((p: any) =>
                    p.day_of_week === d.id && (p.week_variant === variant || (variant === 'A' && !p.week_variant))
                )
                return {
                    ...d,
                    title: plan?.title || '',
                    blocks: (plan?.workout_blocks ?? []).map((b: any) => ({
                        uid: `block-${b.id || Math.random().toString()}`,
                        exercise_id: b.exercise_id,
                        exercise_name: b.exercises?.name || 'Unknown',
                        muscle_group: b.exercises?.muscle_group || 'Unknown',
                        gif_url: b.exercises?.gif_url || undefined,
                        video_url: b.exercises?.video_url || undefined,
                        sets: b.sets,
                        reps: b.reps,
                        target_weight_kg: b.target_weight_kg?.toString() || '',
                        tempo: b.tempo || '',
                        rir: b.rir || '',
                        rest_time: b.rest_time || '',
                        notes: b.notes || '',
                        superset_group: b.superset_group || null,
                        progression_type: b.progression_type || null,
                        progression_value: b.progression_value ?? null,
                        section: b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main',
                        is_override: !!b.is_override,
                        dayId: d.id
                    }))
                }
            })
        }

        // Weekly mode (default)
        const baseDays = DAYS_OF_WEEK.map(d => ({ ...d, title: '', blocks: [] as BuilderBlock[] }))
        if (!initialProgram?.workout_plans?.length) return baseDays
        return DAYS_OF_WEEK.map(d => {
            const plan = initialProgram.workout_plans?.find((p: any) =>
                p.day_of_week === d.id && (p.week_variant === variant || (variant === 'A' && !p.week_variant))
            )
            return {
                ...d,
                title: plan?.title || '',
                blocks: (plan?.workout_blocks ?? []).map((b: any) => ({
                    uid: `block-${b.id || Math.random().toString()}`,
                    exercise_id: b.exercise_id,
                    exercise_name: b.exercises?.name || 'Unknown',
                    muscle_group: b.exercises?.muscle_group || 'Unknown',
                    gif_url: b.exercises?.gif_url || undefined,
                    video_url: b.exercises?.video_url || undefined,
                    sets: b.sets,
                    reps: b.reps,
                    target_weight_kg: b.target_weight_kg?.toString() || '',
                    tempo: b.tempo || '',
                    rir: b.rir || '',
                    rest_time: b.rest_time || '',
                    notes: b.notes || '',
                    superset_group: b.superset_group || null,
                    progression_type: b.progression_type || null,
                    progression_value: b.progression_value ?? null,
                    section: b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main',
                    is_override: !!b.is_override,
                    dayId: d.id
                }))
            }
        })
    }

    // A/B mode: two independent builder instances (hooks must always be called)
    const [isABMode, setIsABMode] = useState<boolean>(initialProgram?.ab_mode ?? false)
    const [activeVariant, setActiveVariant] = useState<'A' | 'B'>('A')

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialDaysA = useMemo(() => getInitialDays('A'), [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialDaysB = useMemo(() => getInitialDays('B'), [])

    const builderA = usePlanBuilder(initialDaysA)
    const builderB = usePlanBuilder(initialDaysB)
    const activeBuilder = activeVariant === 'A' ? builderA : builderB

    const {
        days, dispatch, dispatchWithHistory,
        addExercise, removeBlock, updateBlock, updateDayTitle, copyDay, toggleRestDay, toggleSuperset,
        setBlockSection, toggleBlockOverride,
        undo, redo, canUndo, canRedo,
    } = activeBuilder

    const [programName, setProgramName] = useState(initialProgram?.name || '')
    const [weeksToRepeat, setWeeksToRepeat] = useState(initialProgram?.weeks_to_repeat || 4)
    const [durationType, setDurationType] = useState<'weeks' | 'async' | 'calendar_days'>((initialProgram?.duration_type as any) || 'weeks')
    const [durationDays, setDurationDays] = useState<number | null>(initialProgram?.duration_days || null)
    const [startDateFlexible, setStartDateFlexible] = useState<boolean>(initialProgram?.start_date_flexible ?? true)
    const [startDate, setStartDate] = useState<string>(
        initialProgram?.start_date 
            ? new Date(initialProgram.start_date).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0]
    )
    const [programNotes, setProgramNotes] = useState(initialProgram?.program_notes || '')
    const [programPhases, setProgramPhases] = useState<ProgramPhase[]>(() => parseProgramPhases(initialProgram?.program_phases))
    const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(initialProgram?.source_template_id ?? null)
    const [programStructureType, setProgramStructureTypeState] = useState<'weekly' | 'cycle'>(
        (initialProgram?.program_structure_type as 'weekly' | 'cycle') || 'weekly'
    )
    const [cycleLength, setCycleLengthState] = useState<number>(initialProgram?.cycle_length || 7)

    // When structure type or cycle length changes, rebuild the day columns
    const setProgramStructureType = (type: 'weekly' | 'cycle') => {
        setProgramStructureTypeState(type)
        const newDays = getInitialDays('A', type, cycleLength)
        builderA.dispatchWithHistory({ type: 'SET_DAYS', payload: newDays })
        builderB.dispatchWithHistory({ type: 'SET_DAYS', payload: getInitialDays('B', type, cycleLength) })
    }
    const setCycleLength = (length: number) => {
        setCycleLengthState(length)
        if (programStructureType === 'cycle') {
            const newDays = getInitialDays('A', 'cycle', length)
            builderA.dispatchWithHistory({ type: 'SET_DAYS', payload: newDays })
            builderB.dispatchWithHistory({ type: 'SET_DAYS', payload: getInitialDays('B', 'cycle', length) })
        }
    }

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [showDraftBanner, setShowDraftBanner] = useState(false)
    const isFirstRender = useRef(true)

    const [showTemplatePicker, setShowTemplatePicker] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    const [showAssign, setShowAssign] = useState(false)
    const [showBalance, setShowBalance] = useState(false)
    const [showPrint, setShowPrint] = useState(false)
    const [isCatalogSidebarOpen, setIsCatalogSidebarOpen] = useState(false)
    const [isDragPending, setIsDragPending] = useState(false)

    const [editingBlock, setEditingBlock] = useState<BuilderBlock | null>(null)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeData, setActiveData] = useState<any>(null)
    const [isCatalogOpen, setIsCatalogOpen] = useState(false)
    const [sheetHeight, setSheetHeight] = useState(12)
    const [isDraggingSheet, setIsDraggingSheet] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [isMobile, setIsMobile] = useState<boolean>(false)
    const [mounted, setMounted] = useState(false)
    const [showConfig, setShowConfig] = useState(!initialProgram?.id)
    const [activeMobileDayIndex, setActiveMobileDayIndex] = useState(0)

    const touchStartY = useRef(0)
    const initialSheetHeight = useRef(60)
    const swipeTouchStartX = useRef(0)
    const swipeTouchStartY = useRef(0)

    useEffect(() => {
        setMounted(true)
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        try {
            const saved = localStorage.getItem(`builder_draft_${initialProgram?.id || 'new'}`)
            if (saved) setShowDraftBanner(true)
        } catch (e) {}
    }, [initialProgram])

    useEffect(() => {
        if (isFirstRender.current) { isFirstRender.current = false; return }
        setHasUnsavedChanges(true)
    }, [days, builderB.days, programName, weeksToRepeat, durationType, durationDays, startDateFlexible, startDate, programNotes, isABMode, programPhases, sourceTemplateId])

    useEffect(() => {
        if (!hasUnsavedChanges) return
        const timer = setTimeout(() => {
            try {
                localStorage.setItem(`builder_draft_${initialProgram?.id || 'new'}`, JSON.stringify({
                    programName, weeksToRepeat, durationType, durationDays, startDateFlexible, startDate, programNotes,
                    isABMode, days, daysB: builderB.days, programPhases, sourceTemplateId,
                }))
            } catch (e) {}
        }, 3000)
        return () => clearTimeout(timer)
    }, [days, builderB.days, programName, weeksToRepeat, durationType, durationDays, startDateFlexible, startDate, programNotes, isABMode, programPhases, sourceTemplateId, hasUnsavedChanges, initialProgram])


    // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const mod = e.ctrlKey || e.metaKey
            if (!mod) return
            if (!e.shiftKey && e.key === 'z') { e.preventDefault(); undo() }
            if ((e.shiftKey && e.key === 'z') || e.key === 'y') { e.preventDefault(); redo() }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [undo, redo])

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

    const handleTouchEnd = () => {
        setIsDraggingSheet(false)
        if (sheetHeight > 60) { setIsCatalogOpen(true); setSheetHeight(80) }
        else if (sheetHeight > 28) { setIsCatalogOpen(true); setSheetHeight(40) }
        else { setIsCatalogOpen(false); setSheetHeight(12) }
    }

    const handleSwipeTouchStart = (e: React.TouchEvent) => {
        swipeTouchStartX.current = e.touches[0].clientX
        swipeTouchStartY.current = e.touches[0].clientY
    }

    const handleSwipeTouchEnd = (e: React.TouchEvent) => {
        const deltaX = e.changedTouches[0].clientX - swipeTouchStartX.current
        const deltaY = e.changedTouches[0].clientY - swipeTouchStartY.current
        // Only register horizontal swipes (must be more horizontal than vertical)
        if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return
        if (deltaX < 0) {
            // Swipe left → next day
            setActiveMobileDayIndex(i => Math.min(days.length - 1, i + 1))
        } else {
            // Swipe right → prev day
            setActiveMobileDayIndex(i => Math.max(0, i - 1))
        }
    }

    const handleRestoreDraft = () => {
        try {
            const saved = localStorage.getItem(`builder_draft_${initialProgram?.id || 'new'}`)
            if (saved) {
                const draft = JSON.parse(saved)
                if (draft.programName) setProgramName(draft.programName)
                if (draft.weeksToRepeat) setWeeksToRepeat(draft.weeksToRepeat)
                if (draft.durationType) setDurationType(draft.durationType)
                if (draft.durationDays !== undefined) setDurationDays(draft.durationDays)
                if (draft.startDateFlexible !== undefined) setStartDateFlexible(draft.startDateFlexible)
                if (draft.startDate) setStartDate(draft.startDate)
                if (draft.programNotes) setProgramNotes(draft.programNotes)
                if (draft.isABMode !== undefined) setIsABMode(draft.isABMode)
                if (draft.days) builderA.dispatchWithHistory({ type: 'SET_DAYS', payload: draft.days })
                if (draft.daysB) builderB.dispatchWithHistory({ type: 'SET_DAYS', payload: draft.daysB })
                if (draft.programPhases) setProgramPhases(draft.programPhases)
                if (draft.sourceTemplateId !== undefined) setSourceTemplateId(draft.sourceTemplateId)
                toast.success('Borrador restaurado')
            }
        } catch (e) {}
        setShowDraftBanner(false)
    }

    const handleDiscardDraft = () => {
        try {
            localStorage.removeItem(`builder_draft_${initialProgram?.id || 'new'}`)
            setShowDraftBanner(false)
        } catch (e) {}
    }

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    function handleDragStart(event: DragStartEvent) {
        setActiveId(event.active.id as string)
        setActiveData(event.active.data.current)
        setIsDragPending(true)
        // Clear pending after transition window (slightly longer than TouchSensor delay)
        setTimeout(() => setIsDragPending(false), 400)
    }

    function handleDragOver(event: DragOverEvent) {
        const { active, over } = event
        if (!over) return
        const activeData = active.data.current
        const overData = over.data.current
        if (!activeData || activeData.type !== 'block') return
        const activeDayId = activeData.dayId
        let overDayId = overData?.dayId || (overData?.type === 'day' ? overData.dayId : null)
        if (!overDayId || activeDayId === overDayId) return

        dispatch({ type: 'TRANSFER_BLOCK', payload: { activeId: active.id as string, activeDayId, overDayId } })
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        const activeData = active.data.current
        const overData = over?.data?.current

        if (over && activeData?.type === 'block' && overData?.type === 'section' && activeData.dayId === overData.dayId) {
            dispatchWithHistory({
                type: 'SET_BLOCK_SECTION',
                payload: { dayId: overData.dayId, uid: active.id as string, section: overData.section },
            })
            setActiveId(null)
            setActiveData(null)
            setHasUnsavedChanges(true)
            return
        }

        if (!over) { setActiveId(null); return }
        if (activeData?.type === 'new-exercise') {
            const dayId = over.data.current?.dayId
            if (dayId) {
                handleAddExercise(dayId, activeData.exercise)
            }
        } else if (active.id !== over.id) {
            const dayId = activeData?.dayId
            if (dayId) {
                const d = days.find(x => x.id === dayId)
                if (d) {
                    const oldIndex = d.blocks.findIndex(b => b.uid === active.id)
                    const newIndex = d.blocks.findIndex(b => b.uid === over.id)
                    dispatchWithHistory({ type: 'MOVE_BLOCK', payload: { dayId, oldIndex, newIndex } })
                }
            }
        }
        setActiveId(null)
        setActiveData(null)
        setHasUnsavedChanges(true)
    }

    function handleAddExercise(dayId: number, exercise: Exercise) {
        addExercise(dayId, createDefaultBlock(exercise))
        trackRecentExercise(exercise.id)
        setHasUnsavedChanges(true)
    }

    // ── Stable handlers for React.memo'd DayColumn ──────────────────────────
    const handleRemoveBlock = useCallback((dayId: number, uid: string) => {
        removeBlock(dayId, uid)
        setHasUnsavedChanges(true)
    }, [removeBlock])

    const handleUpdateBlock = useCallback((b: BuilderBlock) => {
        updateBlock(b)
        setHasUnsavedChanges(true)
    }, [updateBlock])

    const handleUpdateTitle = useCallback((dayId: number, title: string) => {
        updateDayTitle(dayId, title)
    }, [updateDayTitle])

    const handleCopyDay = useCallback((s: number, ts: number[]) => {
        copyDay(s, ts)
        setHasUnsavedChanges(true)
        toast.success(`Día copiado a ${ts.length} día(s)`)
    }, [copyDay])

    const handleToggleRest = useCallback((dayId: number) => {
        toggleRestDay(dayId)
        setHasUnsavedChanges(true)
    }, [toggleRestDay])

    const handleToggleSuperset = useCallback((dayId: number, uid: string) => {
        toggleSuperset(dayId, uid)
        setHasUnsavedChanges(true)
    }, [toggleSuperset])

    const handleSetBlockSection = useCallback((d: number, u: string, s: import('./types').BuilderSection) => {
        setBlockSection(d, u, s)
        setHasUnsavedChanges(true)
    }, [setBlockSection])

    const handleToggleBlockOverride = useCallback((uid: string) => {
        toggleBlockOverride(uid)
        setHasUnsavedChanges(true)
    }, [toggleBlockOverride])

    const handleSave = () => {
        if (!programName.trim()) { toast.error('El programa necesita un nombre.'); return }
        const allDaysToCheck = isABMode ? [...builderA.days, ...builderB.days] : days
        const hasExercises = allDaysToCheck.some(d => d.blocks.length > 0)
        if (!hasExercises) { toast.error('Debes añadir al menos un ejercicio al programa.'); return }
        const missingData = allDaysToCheck.some(d => d.blocks.some(b => !b.sets || b.sets < 1 || !b.reps?.trim()))
        if (missingData) { toast.error('Hay ejercicios con datos incompletos (Series o Repeticiones faltan).'); return }

        const mapDays = (dayList: DayState[], variant: 'A' | 'B') =>
            dayList.filter(d => d.blocks.length > 0).map(d => ({
                day_of_week: d.id,
                title: d.title.trim(),
                week_variant: variant,
                blocks: d.blocks.map((b, idx) => ({
                    exercise_id: b.exercise_id,
                    sets: b.sets || 3,
                    reps: b.reps || '',
                    target_weight_kg: b.target_weight_kg ? parseFloat(b.target_weight_kg) : null,
                    tempo: b.tempo || null,
                    rir: b.rir || null,
                    rest_time: b.rest_time || null,
                    notes: b.notes || null,
                    superset_group: b.superset_group || null,
                    progression_type: b.progression_type || null,
                    progression_value: b.progression_value ?? null,
                    section: (b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main') as 'warmup' | 'main' | 'cooldown',
                    is_override: b.is_override ?? false,
                    order_index: idx
                }))
            }))

        startTransition(async () => {
            const input: WorkoutProgramInput = {
                programId: initialProgram?.id,
                clientId: client?.id || null,
                programName: programName.trim(),
                weeksToRepeat,
                startDate: startDateFlexible ? null : startDate,
                duration_type: durationType || 'weeks',
                duration_days: durationDays,
                program_structure_type: programStructureType,
                cycle_length: programStructureType === 'cycle' ? cycleLength : undefined,
                start_date_flexible: startDateFlexible,
                program_notes: programNotes,
                ab_mode: isABMode,
                program_phases: programPhases,
                source_template_id: client?.id ? sourceTemplateId : null,
                days: isABMode
                    ? [...mapDays(builderA.days, 'A'), ...mapDays(builderB.days, 'B')]
                    : mapDays(days, 'A')
            }

            const result = await saveWorkoutProgramAction(input)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success('Programa guardado exitosamente.')
                try { localStorage.removeItem(`builder_draft_${initialProgram?.id || 'new'}`) } catch (e) {}
                setHasUnsavedChanges(false)
                if (client) {
                    router.push(`/coach/clients/${client.id}?tab=entrenamiento`)
                } else {
                    router.push('/coach/templates')
                }
            }
        })
    }

    if (!mounted) return <div className="h-[100dvh] flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background overflow-hidden">
            {showDraftBanner && (
                <div className="bg-primary/10 border-b border-primary/20 p-3 flex justify-center items-center gap-4 animate-in slide-in-from-top">
                    <p className="text-xs font-bold text-foreground">Tienes cambios sin guardar recientes.</p>
                    <Button variant="outline" size="sm" onClick={handleRestoreDraft}>Restaurar</Button>
                    <Button variant="ghost" size="sm" onClick={handleDiscardDraft}>Descartar</Button>
                </div>
            )}

            <header className="flex-shrink-0 border-b border-border bg-background/50 backdrop-blur-xl z-20">
                <div className="h-16 px-4 md:px-6 flex items-center justify-between max-w-[2000px] mx-auto gap-4">
                    <div className="flex items-center gap-4">
                        <Link href={client ? `/coach/clients/${client.id}` : '/coach/templates'}>
                            <Button variant="ghost" size="icon" className="shrink-0 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                            </Button>
                        </Link>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-sm font-display uppercase tracking-[0.2em] text-foreground truncate max-w-[160px] md:max-w-md">
                                    {programName || 'NUEVO PROGRAMA'}
                                </h1>
                                {hasUnsavedChanges && (
                                    <span className="hidden md:flex items-center gap-1 text-[9px] bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded-full border border-orange-500/20 shrink-0">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                        CAMBIOS SIN GUARDAR
                                    </span>
                                )}
                            </div>
                            {hasUnsavedChanges ? (
                                <p className="md:hidden text-[9px] font-bold uppercase tracking-widest text-orange-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse inline-block shrink-0"></span>
                                    Sin guardar
                                </p>
                            ) : (
                                <p className="md:hidden text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 truncate">
                                    {client ? client.full_name : 'Plantilla Global'}
                                </p>
                            )}
                            <p className="hidden md:block text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                                {client ? `Cliente: ${client.full_name}` : 'Plantilla Global'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Catalog toggle — tablet only (md→lg) */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="hidden md:max-lg:flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => setIsCatalogSidebarOpen(v => !v)}
                            title={isCatalogSidebarOpen ? 'Ocultar catálogo' : 'Mostrar catálogo'}
                        >
                            <Search className="w-4 h-4" />
                        </Button>

                        {/* Secondary actions — desktop only */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="hidden md:flex h-10 w-auto px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => setShowTemplatePicker(true)}
                            title="Cargar plantilla"
                        >
                            <LayoutTemplate className="w-4 h-4 mr-2" />
                            Plantillas
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="hidden md:flex h-10 w-auto px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => setShowPreview(true)}
                            title="Vista previa"
                        >
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                        </Button>

                        {!client && initialProgram?.id && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="hidden md:flex h-10 w-auto px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                                onClick={() => setShowAssign(true)}
                                title="Asignar a clientes"
                            >
                                <Users className="w-4 h-4 mr-2" />
                                Asignar
                            </Button>
                        )}

                        <Button
                            variant="ghost"
                            size="sm"
                            className="hidden md:flex h-10 w-auto px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => setShowBalance(true)}
                            title="Balance muscular"
                        >
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Balance
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="hidden md:flex h-10 w-auto px-3 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => setShowPrint(true)}
                            title="Imprimir / Exportar PDF"
                        >
                            <Printer className="w-4 h-4 mr-2" />
                            Imprimir
                        </Button>

                        <div className="hidden md:flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`h-10 w-10 transition-colors ${canUndo ? 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5' : 'text-muted-foreground/30 cursor-not-allowed'}`}
                                onClick={undo}
                                disabled={!canUndo}
                                title="Deshacer (Ctrl+Z)"
                            >
                                <Undo2 className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`h-10 w-10 transition-colors ${canRedo ? 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5' : 'text-muted-foreground/30 cursor-not-allowed'}`}
                                onClick={redo}
                                disabled={!canRedo}
                                title="Rehacer (Ctrl+Shift+Z)"
                            >
                                <Redo2 className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Mobile overflow menu — hidden on md+ */}
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                className="md:hidden h-10 w-10 px-0 border-0 bg-transparent text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                                title="Más opciones"
                            >
                                <MoreVertical className="w-5 h-5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem onClick={() => setShowTemplatePicker(true)}>
                                    <LayoutTemplate className="w-4 h-4 mr-2" /> Plantillas
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowPreview(true)}>
                                    <Eye className="w-4 h-4 mr-2" /> Vista previa
                                </DropdownMenuItem>
                                {!client && initialProgram?.id && (
                                    <DropdownMenuItem onClick={() => setShowAssign(true)}>
                                        <Users className="w-4 h-4 mr-2" /> Asignar a clientes
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => setShowBalance(true)}>
                                    <BarChart3 className="w-4 h-4 mr-2" /> Balance muscular
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowPrint(true)}>
                                    <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={undo} disabled={!canUndo}>
                                    <Undo2 className="w-4 h-4 mr-2" /> Deshacer
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={redo} disabled={!canRedo}>
                                    <Redo2 className="w-4 h-4 mr-2" /> Rehacer
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Config/Settings — always visible */}
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 w-10 md:w-auto md:px-3 text-xs font-bold uppercase tracking-widest border-border hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => setShowConfig(!showConfig)}
                            title="Configuración"
                        >
                            <Settings className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Config</span>
                        </Button>

                        {client && initialProgram?.id && sourceTemplateId && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="hidden md:flex h-10 w-auto px-3 text-xs font-bold uppercase tracking-widest border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                                disabled={isPending}
                                title="Copiar cambios de la plantilla base (no pisa bloques marcados Modif.)"
                                onClick={() => {
                                    if (!initialProgram?.id) return
                                    startTransition(async () => {
                                        const r = await syncProgramFromTemplateAction(initialProgram.id)
                                        if (r.error) toast.error(r.error)
                                        else {
                                            toast.success('Sincronizado con la plantilla base.')
                                            router.refresh()
                                        }
                                    })
                                }}
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                <span className="hidden lg:inline">Sync plantilla</span>
                            </Button>
                        )}

                        {/* Save — always visible */}
                        <Button
                            onClick={handleSave}
                            disabled={isPending || !programName.trim()}
                            size="sm"
                            className="h-10 px-4 md:px-6 text-xs font-bold uppercase tracking-[0.2em] bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--theme-primary-rgb,0,122,255),0.3)] hover:opacity-90 transition-all disabled:opacity-50"
                            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                        >
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin md:mr-2" /> : <Save className="w-4 h-4 md:mr-2" />}
                            <span className="hidden md:inline">{isPending ? 'GUARDANDO...' : 'GUARDAR'}</span>
                        </Button>
                    </div>
                </div>

                <ProgramPhasesBar phases={programPhases} weeksToRepeat={weeksToRepeat} />

                {showConfig && (
                    <ProgramConfigHeader 
                        programName={programName} setProgramName={setProgramName}
                        durationType={durationType} setDurationType={setDurationType}
                        weeksToRepeat={weeksToRepeat} setWeeksToRepeat={setWeeksToRepeat}
                        durationDays={durationDays} setDurationDays={setDurationDays}
                        startDateFlexible={startDateFlexible} setStartDateFlexible={setStartDateFlexible}
                        startDate={startDate} setStartDate={setStartDate}
                        programNotes={programNotes} setProgramNotes={setProgramNotes}
                        programStructureType={programStructureType} setProgramStructureType={setProgramStructureType}
                        cycleLength={cycleLength} setCycleLength={setCycleLength}
                        programPhases={programPhases} setProgramPhases={setProgramPhases}
                        onClose={() => setShowConfig(false)}
                    />
                )}
            </header>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex-1 flex overflow-hidden max-w-[2000px] w-full mx-auto relative bg-secondary/30 dark:bg-background/80">
                    {/* Catalog sidebar — hidden mobile, collapsible tablet, always open desktop */}
                    <div className={`hidden md:flex flex-col flex-shrink-0 border-r border-border bg-background/50 backdrop-blur-sm relative z-10 transition-all duration-300 lg:w-[350px] ${
                        isCatalogSidebarOpen ? 'md:max-lg:w-[300px]' : 'md:max-lg:w-[48px] md:max-lg:overflow-hidden'
                    }`}>
                        {/* Toggle button — tablet only */}
                        <div className="hidden md:max-lg:flex justify-center py-3 border-b border-border shrink-0">
                            <button
                                onClick={() => setIsCatalogSidebarOpen(v => !v)}
                                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title={isCatalogSidebarOpen ? 'Ocultar catálogo' : 'Mostrar catálogo'}
                            >
                                <Search className="w-4 h-4" />
                            </button>
                        </div>
                        <div className={`flex-1 min-h-0 transition-opacity duration-200 ${!isCatalogSidebarOpen ? 'md:max-lg:opacity-0 md:max-lg:pointer-events-none' : ''}`}>
                            <DraggableExerciseCatalog exercises={exercises} />
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
                        {/* A/B Mode bar */}
                        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background/50 flex-shrink-0">
                            <button
                                onClick={() => setIsABMode(v => !v)}
                                className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors ${
                                    isABMode
                                        ? 'bg-primary/10 border-primary/30 text-primary'
                                        : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary'
                                }`}
                            >
                                <span className="font-black">A/B</span>
                                <span>{isABMode ? 'Semanas alternas activas' : 'Activar semanas A/B'}</span>
                            </button>

                            {isABMode && (
                                <div className="flex bg-muted/50 p-0.5 rounded-lg">
                                    {(['A', 'B'] as const).map(v => (
                                        <button
                                            key={v}
                                            onClick={() => setActiveVariant(v)}
                                            className={`px-4 py-1 text-[11px] font-black uppercase tracking-widest rounded-md transition-colors ${
                                                activeVariant === v
                                                    ? 'bg-background text-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            Semana {v}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {isABMode && (
                                <p className="text-[9px] text-muted-foreground uppercase tracking-widest ml-auto hidden md:block">
                                    El sistema alterna A→B cada semana automáticamente
                                </p>
                            )}
                        </div>

                        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar">
                        {isMobile ? (
                            <div className="h-full flex flex-col">
                                {/* Mobile tab bar with exercise counts */}
                                <div className="flex bg-muted/50 p-1 h-11 rounded-xl gap-0.5 mx-2 mt-2 mb-1 flex-shrink-0" style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}>
                                    {days.map((d, idx) => {
                                        const isActive = activeMobileDayIndex === idx
                                        const count = d.blocks.length
                                        return (
                                            <button
                                                key={d.id}
                                                onClick={() => setActiveMobileDayIndex(idx)}
                                                className={`flex-1 flex flex-col items-center justify-center rounded-lg relative transition-all ${
                                                    isActive
                                                        ? 'bg-background text-foreground shadow-sm'
                                                        : 'text-muted-foreground'
                                                }`}
                                            >
                                                <span className="text-[9px] font-bold uppercase tracking-widest leading-none">
                                                    {d.name.slice(0, 3)}
                                                </span>
                                                {d.is_rest ? (
                                                    <span className="text-[8px] text-indigo-400 font-bold mt-0.5">ZZZ</span>
                                                ) : count > 0 ? (
                                                    <span className={`text-[8px] font-black mt-0.5 ${isActive ? 'text-primary' : 'text-muted-foreground/60'}`}>
                                                        {count}
                                                    </span>
                                                ) : (
                                                    <span className="text-[8px] text-muted-foreground/30 mt-0.5">·</span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>

                                {/* Carousel swipeable area */}
                                <div
                                    className="flex-1 overflow-hidden"
                                    onTouchStart={handleSwipeTouchStart}
                                    onTouchEnd={handleSwipeTouchEnd}
                                >
                                    <div
                                        className="flex h-full"
                                        style={{
                                            width: `${days.length * 100}%`,
                                            transform: `translateX(-${(activeMobileDayIndex * 100) / days.length}%)`,
                                            transition: 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                        }}
                                    >
                                        {days.map((day) => (
                                            <div
                                                key={day.id}
                                                className="h-full overflow-y-auto"
                                                style={{
                                                    width: `${100 / days.length}%`,
                                                    paddingBottom: 'calc(9rem + env(safe-area-inset-bottom))',
                                                    WebkitOverflowScrolling: 'touch',
                                                } as React.CSSProperties}
                                            >
                                                <DayColumn
                                                    day={day}
                                                    exercises={exercises}
                                                    allDays={days}
                                                    isCycleMode={programStructureType === 'cycle'}
                                                    isDragPending={isDragPending}
                                                    onAddExercise={handleAddExercise}
                                                    onEditBlock={setEditingBlock}
                                                    onRemoveBlock={handleRemoveBlock}
                                                    onUpdateBlock={handleUpdateBlock}
                                                    onUpdateTitle={handleUpdateTitle}
                                                    onCopyDay={handleCopyDay}
                                                    onToggleRest={handleToggleRest}
                                                    onToggleSuperset={handleToggleSuperset}
                                                    onSetBlockSection={handleSetBlockSection}
                                                    onToggleBlockOverride={handleToggleBlockOverride}
                                                    templateLinked={!!(client?.id && sourceTemplateId)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex px-6 py-6 gap-4">
                                {days.map((day) => (
                                    <div key={day.id} className="h-full pb-8">
                                        <DayColumn
                                            day={day}
                                            exercises={exercises}
                                            allDays={days}
                                            isCycleMode={programStructureType === 'cycle'}
                                            isDragPending={isDragPending}
                                            onAddExercise={handleAddExercise}
                                            onEditBlock={setEditingBlock}
                                            onRemoveBlock={handleRemoveBlock}
                                            onUpdateBlock={handleUpdateBlock}
                                            onUpdateTitle={handleUpdateTitle}
                                            onCopyDay={handleCopyDay}
                                            onToggleRest={handleToggleRest}
                                            onToggleSuperset={handleToggleSuperset}
                                            onSetBlockSection={handleSetBlockSection}
                                            onToggleBlockOverride={handleToggleBlockOverride}
                                            templateLinked={!!(client?.id && sourceTemplateId)}
                                        />
                                    </div>
                                ))}
                                <div className="w-12 flex-shrink-0" />
                            </div>
                        )}
                        </div>
                    </div>

                    {isMobile && (
                        <>
                            {isCatalogOpen && sheetHeight >= 40 && (
                                <div
                                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 transition-opacity"
                                    onClick={() => { setIsCatalogOpen(false); setSheetHeight(12) }}
                                />
                            )}
                            <div
                                className="fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-2xl z-40 select-none rounded-t-3xl overflow-hidden"
                                style={{ height: `${sheetHeight}vh`, transition: isDraggingSheet ? 'none' : 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)', paddingBottom: 'env(safe-area-inset-bottom)' }}
                            >
                                {/* Drag handle — always visible */}
                                <div
                                    className="w-full flex flex-col items-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
                                    onTouchStart={handleTouchStart}
                                    onTouchMove={handleTouchMove}
                                    onTouchEnd={handleTouchEnd}
                                    onClick={() => {
                                        if (!isCatalogOpen) { setIsCatalogOpen(true); setSheetHeight(80) }
                                    }}
                                >
                                    <div className="w-10 h-1 bg-muted-foreground/25 rounded-full mb-2" />
                                    {/* Collapsed label */}
                                    {sheetHeight < 28 && (
                                        <div className="flex items-center gap-2 pb-1">
                                            <Plus className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-[11px] font-bold text-foreground">Añadir ejercicio</span>
                                            <span className="text-[10px] text-muted-foreground ml-1">
                                                · {days[activeMobileDayIndex]?.blocks.length || 0} en este día
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Compact state (40vh): search + muscle group chips */}
                                {sheetHeight >= 28 && sheetHeight < 60 && (
                                    <div className="flex flex-col h-[calc(100%-48px)] px-4 pb-4 gap-3">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                            <input
                                                type="text"
                                                placeholder="Buscar ejercicio..."
                                                className="w-full pl-9 pr-4 py-2.5 text-[16px] bg-muted/50 border border-border rounded-xl focus:outline-none focus:border-primary"
                                                onFocus={() => { setIsCatalogOpen(true); setSheetHeight(80) }}
                                            />
                                        </div>
                                        <div className="overflow-x-auto flex gap-2 pb-1 -mx-1 px-1">
                                            {['Pectorales','Dorsales','Hombros','Bíceps','Tríceps','Cuádriceps','Glúteos','Abdominales'].map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => { setIsCatalogOpen(true); setSheetHeight(80) }}
                                                    className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-border bg-background hover:border-primary/50 transition-colors"
                                                    style={{ color: getMuscleColor(m) }}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground text-center">Toca un grupo o arrastra para ver todos</p>
                                    </div>
                                )}

                                {/* Full catalog (80vh) */}
                                {sheetHeight >= 60 && (
                                    <div className="h-[calc(100%-48px)] overflow-hidden px-4 pb-4">
                                        <DraggableExerciseCatalog
                                            exercises={exercises}
                                            onTapAdd={(exercise) => {
                                                const dayId = days[activeMobileDayIndex]?.id
                                                if (dayId != null) {
                                                    handleAddExercise(dayId, exercise)
                                                    toast.success(`${exercise.name} añadido`)
                                                }
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    <DragOverlay dropAnimation={null}>
                        {activeId && activeData ? (
                            activeData.type === 'new-exercise' ? (
                                <div className="p-4 bg-primary/10 border-2 border-primary/50 border-dashed rounded-xl backdrop-blur-xl shadow-2xl transform scale-105 rotate-3 -mr-16">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
                                            <span className="text-primary font-bold">N</span>
                                        </div>
                                        <div>
                                            <div className="font-bold text-xs uppercase tracking-widest text-primary truncate max-w-[150px]">
                                                {activeData.exercise.name}
                                            </div>
                                            <div className="text-[9px] font-bold mt-1 uppercase text-primary/70">{activeData.exercise.muscle_group}</div>
                                        </div>
                                    </div>
                                </div>
                            ) : activeData.type === 'block' ? (
                                <div className="opacity-80 scale-105 rotate-3 w-[260px] pointer-events-none shadow-2xl z-50">
                                    <ExerciseBlock
                                        block={activeData.block}
                                        dayId={activeData.dayId}
                                        onEdit={() => {}}
                                        onRemove={() => {}}
                                    />
                                </div>
                            ) : null
                        ) : null}
                    </DragOverlay>
                </div>
            </DndContext>

            <BlockEditSheet
                block={editingBlock}
                clientId={client?.id}
                onClose={() => setEditingBlock(null)}
                onUpdate={(b) => {
                    updateBlock(b);
                    setHasUnsavedChanges(true);
                    setEditingBlock(null);
                }}
                onChange={setEditingBlock}
            />

            <TemplatePickerDialog
                open={showTemplatePicker}
                onClose={() => setShowTemplatePicker(false)}
                hasExistingData={days.some(d => d.blocks.length > 0)}
                onApply={(newDays, name, meta) => {
                    dispatchWithHistory({ type: 'SET_DAYS', payload: newDays })
                    setProgramName((prev: string) => prev || name)
                    setWeeksToRepeat(meta.weeks_to_repeat)
                    setDurationType(meta.duration_type as any)
                    setDurationDays(meta.duration_days)
                    setProgramNotes(meta.program_notes)
                    if (meta.program_phases?.length) setProgramPhases(meta.program_phases)
                    if (client?.id) setSourceTemplateId(meta.appliedTemplateId)
                    else setSourceTemplateId(null)
                    setHasUnsavedChanges(true)
                    toast.success(`Plantilla "${name}" aplicada`)
                }}
            />

            <ProgramPreviewDialog
                open={showPreview}
                onClose={() => setShowPreview(false)}
                programName={programName}
                days={days}
                weeksToRepeat={weeksToRepeat}
                durationType={durationType}
                durationDays={durationDays}
                programNotes={programNotes}
                clientName={client?.full_name}
            />

            {!client && initialProgram?.id && (
                <AssignToClientsDialog
                    open={showAssign}
                    onClose={() => setShowAssign(false)}
                    programId={initialProgram.id}
                    programName={programName}
                />
            )}

            <MuscleBalancePanel
                open={showBalance}
                onClose={() => setShowBalance(false)}
                days={days}
            />

            <PrintProgramDialog
                open={showPrint}
                onClose={() => setShowPrint(false)}
                programName={programName || 'Programa'}
                clientName={client?.full_name ?? undefined}
                weeksToRepeat={weeksToRepeat}
                days={builderA.days}
                daysB={isABMode ? builderB.days : undefined}
                isABMode={isABMode}
            />
        </div>
    )
}
