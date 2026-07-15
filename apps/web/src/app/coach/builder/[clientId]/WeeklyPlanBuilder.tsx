'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useMemo, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor,
    useSensor, useSensors, type DragEndEvent, type DragOverEvent, DragStartEvent, DragOverlay,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Save, ArrowLeft, Loader2, Settings, Plus, LayoutTemplate, Eye, Users, Undo2, Redo2, BarChart3, Printer, Search, RefreshCw, MoreVertical, ChevronLeft, ChevronRight, CircleHelp, Pencil, Moon, SlidersHorizontal, History, X, Check, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { EditedByBadge } from '@/components/coach/EditedByBadge'
import { saveWorkoutProgramAction, syncProgramFromTemplateAction, type WorkoutProgramInput } from './_actions/builder.actions'
import type { Tables } from '@/lib/database.types'
import { toast } from 'sonner'
const TemplatePickerDialog = dynamic(
    () => import('./components/TemplatePickerDialog').then((m) => ({ default: m.TemplatePickerDialog })),
    { loading: () => <Skeleton className="mx-auto h-96 w-full max-w-lg rounded-xl" /> }
)
const ProgramPreviewDialog = dynamic(
    () => import('./components/ProgramPreviewDialog').then((m) => ({ default: m.ProgramPreviewDialog })),
    { loading: () => <Skeleton className="mx-auto h-96 w-full max-w-lg rounded-xl" /> }
)
const AssignToClientsDialog = dynamic(
    () => import('./components/AssignToClientsDialog').then((m) => ({ default: m.AssignToClientsDialog })),
    { loading: () => <Skeleton className="mx-auto h-96 w-full max-w-lg rounded-xl" /> }
)
import { MuscleBalancePanel } from './components/MuscleBalancePanel'
import { PrintProgramDialog } from './components/PrintProgramDialog'
import { useTranslation } from '@/lib/i18n/LanguageContext'

import { usePlanBuilder, DAYS_OF_WEEK } from './hooks/usePlanBuilder'
import { DayColumn } from './components/DayColumn'
import { BlockEditSheet } from './components/BlockEditSheet'
import { ProgramConfigSheet } from './components/ProgramConfigSheet'
import { BuilderOnboardingTour, type BuilderTourStep } from './components/BuilderOnboardingTour'
import { ProgramPhasesBar } from './components/ProgramPhasesBar'
import { ExerciseBlock } from './components/ExerciseBlock'
import { DraggableExerciseCatalog } from './DraggableExerciseCatalog'
import type { BuilderBlock, BuilderCardioContext, DayState, ProgramPhase } from './types'
import type { WorkoutArea } from '@/domain/workout/types'
import { effectiveExerciseType, legacyRepsSummaryFor } from '@/lib/workout-exercise-type'
import { effectiveAreaKey, orderedAreaIds, sanitizeSupersets } from '@eva/workout-engine'
import { buildAreaVMs } from './area-ui'
import { parseProgramPhases, mapDbBlockToBuilderBlock, enrichDaysWithExerciseMedia, createDefaultBlock } from './program-read-mappers'

type Client = Tables<'clients'>
type Exercise = Tables<'exercises'>

/** Pasos del tour cuyo spotlight está dentro del panel Configurar: el panel debe estar abierto. Cualquier otro paso con tour activo lo cierra para no mezclar contextos. */
const TOUR_CONFIG_INTERNAL_STEP_IDS = new Set<string>([
    'program-structure-toggle',
    'config-structure-section',
    'config-duration-section',
    'config-phases-section',
])

// ─── Helpers ────────────────────────────────────────────────────────────────

function trackRecentExercise(exerciseId: string) {
    try {
        const saved = localStorage.getItem('builder_recent_exercises')
        const ids: string[] = saved ? JSON.parse(saved) : []
        const updated = [exerciseId, ...ids.filter(id => id !== exerciseId)].slice(0, 8)
        localStorage.setItem('builder_recent_exercises', JSON.stringify(updated))
        window.dispatchEvent(new Event('recent_exercises_updated'))
    } catch { /* silently ignore storage errors */ }
}

export function WeeklyPlanBuilder({ client, exercises, initialProgram, coachName, lastEditor, areas = [], cardio }: { client?: Partial<Client> | null, exercises: Exercise[], initialProgram?: any, coachName?: string, lastEditor?: { name: string; at: string | null } | null, areas?: WorkoutArea[], cardio?: BuilderCardioContext }) {
    const router = useRouter()
    const { t } = useTranslation()

    const getInitialDays = (variant: 'A' | 'B' = 'A', structureType?: string, cyclLen?: number): DayState[] => {
        const exerciseById = new Map(exercises.map(e => [e.id, e]))
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
                    blocks: [...(plan?.workout_blocks ?? [])]
                        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
                        .map((b: any) =>
                            mapDbBlockToBuilderBlock(b, exerciseById, `block-${b.id || Math.random().toString()}`, d.id),
                        ),
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
                blocks: [...(plan?.workout_blocks ?? [])]
                    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
                    .map((b: any) =>
                        mapDbBlockToBuilderBlock(b, exerciseById, `block-${b.id || Math.random().toString()}`, d.id),
                    ),
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

    const builderA = usePlanBuilder(initialDaysA, areas)
    const builderB = usePlanBuilder(initialDaysB, areas)
    const activeBuilder = activeVariant === 'A' ? builderA : builderB

    const {
        days, dispatch, dispatchWithHistory,
        addExercise, removeBlock, updateBlock, updateDayTitle, copyDay, toggleRestDay, toggleSuperset,
        setBlockArea, toggleBlockOverride,
        undo, redo, canUndo, canRedo,
    } = activeBuilder

    const overlayAreaVMs = useMemo(() => buildAreaVMs(areas), [areas])

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

    // Build a fresh day skeleton for the given structure, preserving existing blocks/titles
    // by matching day id. Blocks on days that no longer exist are appended to the last
    // day so the coach never silently loses work when toggling config options.
    const reshapeDays = (existing: DayState[], type: 'weekly' | 'cycle', length: number): DayState[] => {
        const skeleton: DayState[] = type === 'cycle'
            ? Array.from({ length }, (_, i) => ({ id: i + 1, name: `Día ${i + 1}`, title: '', blocks: [] }))
            : DAYS_OF_WEEK.map(d => ({ ...d, title: '', blocks: [] as BuilderBlock[] }))
        const byId = new Map(existing.map(d => [d.id, d]))
        const merged = skeleton.map(d => {
            const prev = byId.get(d.id)
            return prev ? { ...d, title: prev.title, blocks: prev.blocks, is_rest: prev.is_rest } : d
        })
        const orphanBlocks = existing
            .filter(d => !merged.some(m => m.id === d.id))
            .flatMap(d => d.blocks)
        if (orphanBlocks.length > 0 && merged.length > 0) {
            const last = merged[merged.length - 1]
            merged[merged.length - 1] = { ...last, blocks: [...last.blocks, ...orphanBlocks] }
        }
        return merged
    }

    const setProgramStructureType = (type: 'weekly' | 'cycle') => {
        if (type === programStructureType) return
        setProgramStructureTypeState(type)
        builderA.dispatchWithHistory({ type: 'SET_DAYS', payload: reshapeDays(builderA.days, type, cycleLength) })
        builderB.dispatchWithHistory({ type: 'SET_DAYS', payload: reshapeDays(builderB.days, type, cycleLength) })
    }
    const setCycleLength = (length: number) => {
        if (length === cycleLength) return
        setCycleLengthState(length)
        if (programStructureType === 'cycle') {
            builderA.dispatchWithHistory({ type: 'SET_DAYS', payload: reshapeDays(builderA.days, 'cycle', length) })
            builderB.dispatchWithHistory({ type: 'SET_DAYS', payload: reshapeDays(builderB.days, 'cycle', length) })
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
    const [showOverflow, setShowOverflow] = useState(false)
    const [isCatalogSidebarOpen, setIsCatalogSidebarOpen] = useState(false)
    const [isDragPending, setIsDragPending] = useState(false)
    // Marca si el drag en curso ya empujó un snapshot de historia (al primer cross-day TRANSFER).
    // Permite que un drag entre días (transfer + reorder/area final) sea UN solo undo.
    const dragHistoryPushedRef = useRef(false)

    const [editingBlock, setEditingBlock] = useState<BuilderBlock | null>(null)
    const [activeId, setActiveId] = useState<string | null>(null)
    const [activeData, setActiveData] = useState<any>(null)
    const [isCatalogOpen, setIsCatalogOpen] = useState(false)
    /** Filtro muscular compartido: chips del sheet móvil + Select del catálogo (sidebar y sheet expandido). */
    const [catalogMuscleFilter, setCatalogMuscleFilter] = useState('Todos')
    const [isPending, startTransition] = useTransition()
    const [isMobile, setIsMobile] = useState<boolean>(false)
    const [mounted, setMounted] = useState(false)
    const [showConfig, setShowConfig] = useState(false)
    const [mobileNameEdit, setMobileNameEdit] = useState(false)
    const [showBuilderHint, setShowBuilderHint] = useState(false)
    const [tourOpen, setTourOpen] = useState(false)
    const [tourMode, setTourMode] = useState<'short' | 'full'>('short')
    const [hasSeenShortTour, setHasSeenShortTour] = useState(true)
    const [activeTourStepId, setActiveTourStepId] = useState<string | null>(null)
    const [activeMobileDayIndex, setActiveMobileDayIndex] = useState(0)
    // Clamp del día activo en mobile cuando se achican los días (cycle→weekly o ciclo más corto):
    // sin esto activeMobileDayIndex apunta a un día inexistente → days[idx] undefined → rompe tap-to-add.
    useEffect(() => {
        if (activeMobileDayIndex > days.length - 1) {
            setActiveMobileDayIndex(Math.max(0, days.length - 1))
        }
    }, [days.length, activeMobileDayIndex])

    const swipeTouchStartX = useRef(0)
    const swipeTouchStartY = useRef(0)
    const boardScrollRef = useRef<HTMLDivElement>(null)
    const preTourShowConfigRef = useRef(false)
    const preTourCatalogOpenRef = useRef(false)
    const onboardingShortKey = 'builder_onboarding_seen_short_v1'
    const onboardingHelpKey = 'builder_onboarding_seen_help_v1'

    const scrollBoard = (dir: 'left' | 'right') => {
        const el = boardScrollRef.current
        if (!el) return
        el.scrollBy({ left: dir === 'right' ? 300 : -300, behavior: 'smooth' })
    }

    const openTour = useCallback((mode: 'short' | 'full') => {
        preTourShowConfigRef.current = showConfig
        preTourCatalogOpenRef.current = isCatalogOpen
        setTourMode(mode)
        setTourOpen(true)
    }, [showConfig, isCatalogOpen])

    useEffect(() => {
        setMounted(true)
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)

        // Onboarding de primera visita + hint de apoyo para usuarios previos.
        const seenShortTour = !!localStorage.getItem(onboardingShortKey)
        setHasSeenShortTour(seenShortTour)
        if (!seenShortTour) {
            openTour('short')
        }

        const hintKey = 'builder_config_hint_v1'
        if (seenShortTour && !localStorage.getItem(hintKey)) {
            setShowBuilderHint(true)
            const t = setTimeout(() => {
                setShowBuilderHint(false)
                localStorage.setItem(hintKey, '1')
            }, 9000)
            return () => {
                clearTimeout(t)
                window.removeEventListener('resize', checkMobile)
            }
        }

        return () => window.removeEventListener('resize', checkMobile)
    }, [openTour])

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
                    isABMode, days: builderA.days, daysB: builderB.days, programPhases, sourceTemplateId,
                    programStructureType, cycleLength,
                }))
            } catch (e) {}
        }, 3000)
        return () => clearTimeout(timer)
    }, [days, builderB.days, programName, weeksToRepeat, durationType, durationDays, startDateFlexible, startDate, programNotes, isABMode, programPhases, sourceTemplateId, programStructureType, cycleLength, hasUnsavedChanges, initialProgram])


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
                // Restaurar estructura/ciclo con los setters RAW (no los wrappers que reshapean):
                // draft.days ya viene con la forma correcta, no hay que volver a remodelarlo.
                if (draft.programStructureType === 'weekly' || draft.programStructureType === 'cycle') {
                    setProgramStructureTypeState(draft.programStructureType)
                }
                if (typeof draft.cycleLength === 'number' && draft.cycleLength > 0) {
                    setCycleLengthState(draft.cycleLength)
                }
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
        dragHistoryPushedRef.current = false
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

        // El primer cross-day de este drag toma el snapshot de historia (estado PRE-drag);
        // los siguientes transfers van sin historia para que TODO el drag sea un único undo.
        if (dragHistoryPushedRef.current) {
            dispatch({ type: 'TRANSFER_BLOCK', payload: { activeId: active.id as string, activeDayId, overDayId } })
        } else {
            dragHistoryPushedRef.current = true
            dispatchWithHistory({ type: 'TRANSFER_BLOCK', payload: { activeId: active.id as string, activeDayId, overDayId } })
        }
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event
        const activeData = active.data.current
        const overData = over?.data?.current

        if (over && activeData?.type === 'block' && overData?.type === 'area' && activeData.dayId === overData.dayId) {
            // Si el drag ya transfirió entre días, el snapshot pre-drag ya existe → raw dispatch
            // para que la operación completa siga siendo un único undo.
            if (dragHistoryPushedRef.current) {
                dispatch({ type: 'SET_BLOCK_AREA', payload: { dayId: overData.dayId, uid: active.id as string, areaId: overData.areaId } })
            } else {
                dispatchWithHistory({ type: 'SET_BLOCK_AREA', payload: { dayId: overData.dayId, uid: active.id as string, areaId: overData.areaId } })
            }
            setActiveId(null)
            setActiveData(null)
            setHasUnsavedChanges(true)
            return
        }

        if (!over) { setActiveId(null); return }
        if (activeData?.type === 'new-exercise') {
            const dayId = over.data.current?.dayId
            if (dayId) {
                // Drop sobre la zona punteada de un area: el bloque nuevo nace en esa area
                handleAddExercise(dayId, activeData.exercise, overData?.type === 'area' ? overData.areaId : undefined)
            }
        } else if (active.id !== over.id) {
            const dayId = activeData?.dayId
            if (dayId) {
                const d = days.find(x => x.id === dayId)
                if (d) {
                    const oldIndex = d.blocks.findIndex(b => b.uid === active.id)
                    let newIndex = d.blocks.findIndex(b => b.uid === over.id)
                    // Drop sobre la zona vacía del día (contenedor/área, no sobre un bloque):
                    // over.id no es uid de bloque → findIndex = -1. Reubicar al FINAL en vez de
                    // pasar -1 (arrayMove con índice negativo deja el bloque mal ubicado).
                    if (newIndex === -1) newIndex = d.blocks.length - 1
                    if (oldIndex !== -1) {
                        // Si hubo transfer cross-day en este drag, el snapshot pre-drag ya existe →
                        // raw dispatch para que el drag entre días sea UN solo undo reversible.
                        if (dragHistoryPushedRef.current) {
                            dispatch({ type: 'MOVE_BLOCK', payload: { dayId, oldIndex, newIndex } })
                        } else {
                            dispatchWithHistory({ type: 'MOVE_BLOCK', payload: { dayId, oldIndex, newIndex } })
                        }
                    }
                }
            }
        }
        setActiveId(null)
        setActiveData(null)
        setHasUnsavedChanges(true)
    }

    function handleAddExercise(dayId: number, exercise: Exercise, areaId?: string) {
        const block = createDefaultBlock(exercise)
        addExercise(dayId, block)
        if (areaId) {
            // Raw dispatch (sin entrada de historia): el alta ya creo el snapshot,
            // asi el undo revierte alta + area en un solo paso.
            dispatch({ type: 'SET_BLOCK_AREA', payload: { dayId, uid: block.uid, areaId } })
        }
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

    const handleToggleSuperset = useCallback((dayId: number, uid: string, intent?: 'link' | 'unlink') => {
        toggleSuperset(dayId, uid, intent)
        setHasUnsavedChanges(true)
    }, [toggleSuperset])

    const handleSetBlockArea = useCallback((d: number, u: string, areaId: string) => {
        setBlockArea(d, u, areaId)
        setHasUnsavedChanges(true)
    }, [setBlockArea])

    const handleMoveBlock = useCallback((dayId: number, uid: string, dir: -1 | 1) => {
        const d = days.find(x => x.id === dayId)
        if (!d) return
        const oldIndex = d.blocks.findIndex(b => b.uid === uid)
        const newIndex = oldIndex + dir
        if (oldIndex < 0 || newIndex < 0 || newIndex >= d.blocks.length) return
        dispatchWithHistory({ type: 'MOVE_BLOCK', payload: { dayId, oldIndex, newIndex } })
        setHasUnsavedChanges(true)
    }, [days, dispatchWithHistory])

    const dismissBuilderHint = useCallback(() => {
        setShowBuilderHint(false)
        try { localStorage.setItem('builder_config_hint_v1', '1') } catch (e) {}
    }, [])

    const shortTourSteps = useMemo<BuilderTourStep[]>(
        () => [
            {
                id: 'top-config-button',
                title: 'Empieza en Configurar',
                description: 'Aquí defines la base del plan: estructura, duración y fases visuales.',
                placement: 'bottom',
            },
            {
                id: 'program-structure-toggle',
                title: 'Elige cómo se repite',
                description: 'Usa Semanal o Ciclo N-días según la lógica de trabajo que quieras aplicar.',
                placement: 'bottom',
            },
            {
                id: 'days-board',
                title: 'Construye cada día',
                description: 'En este tablero organizas ejercicios, bloques y orden del entrenamiento.',
                placement: 'top',
            },
            ...(isMobile
                ? [
                    {
                        id: 'exercise-fab',
                        title: 'Abre el catálogo',
                        description:
                            'Toca el botón + para desplegar el catálogo de ejercicios en pantalla completa.',
                        placement: 'top' as const,
                    },
                ]
                : [
                    {
                        id: 'exercise-catalog',
                        title: 'Añade ejercicios rápido',
                        description: 'Desde el catálogo lateral puedes buscar, arrastrar o tocar para agregar.',
                        placement: 'bottom' as const,
                    },
                ]),
            {
                id: 'save-button',
                title: 'Guarda cuando termines',
                description: 'Al guardar, el programa queda listo para seguir editando o asignarlo.',
                placement: 'bottom',
            },
        ],
        [isMobile]
    )

    const fullTourSteps = useMemo<BuilderTourStep[]>(() => {
        const mobilePostShort: BuilderTourStep[] = isMobile
            ? [
                {
                    id: 'exercise-catalog-mobile',
                    title: 'Catálogo completo en móvil',
                    description: 'Con el menú expandido puedes buscar, filtrar y tocar para añadir ejercicios.',
                    placement: 'top',
                },
            ]
            : []

        const desktopToolbarSteps: BuilderTourStep[] = [
            {
                id: 'templates-button',
                title: 'Plantillas',
                description: 'Aplica una plantilla para acelerar la creación del programa.',
                placement: 'bottom',
            },
            {
                id: 'preview-button',
                title: 'Vista previa',
                description: 'Comprueba cómo se verá el programa antes de cerrar tu edición.',
                placement: 'bottom',
            },
            {
                id: 'balance-button',
                title: 'Balance muscular',
                description: 'Revisa la distribución por grupos para detectar desbalances.',
                placement: 'bottom',
            },
            {
                id: 'print-button',
                title: 'Imprimir / PDF',
                description: 'Genera una versión imprimible para compartir o revisar fuera del builder.',
                placement: 'bottom',
            },
        ]

        const mobileOverflowMenuStep: BuilderTourStep = {
            id: 'mobile-more-menu',
            title: 'Menú de más opciones',
            description:
                'Toca los tres puntos para abrir Plantillas, Vista previa, Balance muscular, Imprimir / PDF, Deshacer y Rehacer (en desktop esos atajos van en la barra superior).',
            placement: 'bottom',
        }

        const undoRedoSteps: BuilderTourStep[] = [
            {
                id: 'undo-button',
                title: 'Deshacer',
                description: 'Revierte el último cambio cuando quieras corregir algo rápido.',
                placement: 'bottom',
            },
            {
                id: 'redo-button',
                title: 'Rehacer',
                description: 'Recupera un cambio deshecho para continuar tu flujo sin perder ritmo.',
                placement: 'bottom',
            },
        ]

        const configSteps: BuilderTourStep[] = [
            {
                id: 'config-structure-section',
                title: 'Dentro de Configurar: Estructura',
                description: 'Aquí eliges si el plan se organiza por semana o por ciclos de N días.',
                placement: 'bottom',
            },
            {
                id: 'config-duration-section',
                title: 'Dentro de Configurar: Duración',
                description: 'Define cuánto dura el plan y cómo quieres contabilizar esa duración.',
                placement: 'bottom',
            },
            {
                id: 'config-phases-section',
                title: 'Dentro de Configurar: Fases',
                description: 'Las fases ordenan visualmente el timeline del programa para dar contexto.',
                placement: 'top',
            },
        ]

        return [
            ...shortTourSteps,
            ...mobilePostShort,
            {
                id: 'ab-toggle',
                title: 'Activa semanas A/B',
                description: 'Alterna variantes A y B para manejar microciclos semanales más avanzados.',
                placement: 'bottom',
            },
            ...(isMobile
                ? [mobileOverflowMenuStep]
                : [...desktopToolbarSteps, ...configSteps, ...undoRedoSteps]),
            ...(isMobile ? configSteps : []),
        ]
    }, [shortTourSteps, isMobile])

    const handleOpenFullTour = useCallback(() => {
        openTour('full')
        try { localStorage.setItem(onboardingHelpKey, '1') } catch (e) {}
    }, [openTour])

    const handleStepChange = useCallback((step: BuilderTourStep | null) => {
        setActiveTourStepId(step?.id ?? null)
    }, [])

    const tourFooterHint = useCallback((step: BuilderTourStep) => {
        if (isMobile && step.id === 'save-button') {
            return 'En móvil, Guardar es el botón fijo al pie de la pantalla.'
        }
        return undefined
    }, [isMobile])

    useEffect(() => {
        if (!tourOpen || !activeTourStepId) return
        const isConfigInternal = TOUR_CONFIG_INTERNAL_STEP_IDS.has(activeTourStepId)
        if (isConfigInternal) {
            if (!showConfig) setShowConfig(true)
            if (isMobile) setIsCatalogOpen(false)
        } else if (showConfig) {
            setShowConfig(false)
        }
        if (activeTourStepId === 'exercise-catalog-mobile') {
            setIsCatalogOpen(true)
        }
        if (activeTourStepId === 'exercise-fab') {
            setIsCatalogOpen(false)
        }
    }, [tourOpen, activeTourStepId, showConfig, isMobile])

    const handleCloseTour = useCallback((completed: boolean) => {
        setTourOpen(false)
        setActiveTourStepId(null)
        setShowConfig(preTourShowConfigRef.current)
        if (isMobile) {
            setIsCatalogOpen(preTourCatalogOpenRef.current)
        }
        if (tourMode === 'short') {
            setHasSeenShortTour(true)
            setShowBuilderHint(false)
            try {
                localStorage.setItem(onboardingShortKey, '1')
                localStorage.setItem('builder_config_hint_v1', '1')
            } catch (e) {}
            if (completed) toast.success('Guía inicial completada')
        } else if (completed) {
            toast.success('Guía del builder completada')
        }
    }, [tourMode, isMobile])

    const handleToggleBlockOverride = useCallback((uid: string) => {
        toggleBlockOverride(uid)
        setHasUnsavedChanges(true)
    }, [toggleBlockOverride])

    const handleSave = (force = false) => {
        if (!programName.trim()) { toast.error('El programa necesita un nombre.'); return }
        const allDaysToCheck = isABMode ? [...builderA.days, ...builderB.days] : days
        const hasExercises = allDaysToCheck.some(d => d.blocks.length > 0)
        if (!hasExercises) { toast.error('Debes añadir al menos un ejercicio al programa.'); return }
        // Completitud POR TIPO: strength exige sets+reps EXACTAMENTE como hoy (AC3);
        // los tipos nuevos exigen su prescripción mínima (duración/distancia/intervalos/pasadas).
        const blockIncomplete = (b: BuilderBlock): boolean => {
            const type = effectiveExerciseType(b, { exercise_type: b.exercise_type })
            if (type === 'cardio') {
                const dist = parseFloat((b.distance_value || '').replace(',', '.'))
                return !((b.duration_sec ?? 0) > 0 || (Number.isFinite(dist) && dist > 0) || !!b.interval_config)
            }
            if (type === 'mobility') {
                return !b.sets || b.sets < 1 || !((b.duration_sec ?? 0) > 0 || (b.reps_value ?? 0) > 0 || !!b.reps?.trim())
            }
            if (type === 'roller') {
                return !((b.duration_sec ?? 0) > 0 || (b.reps_value ?? 0) > 0 || !!b.reps?.trim())
            }
            return !b.sets || b.sets < 1 || !b.reps?.trim()
        }
        const missingData = allDaysToCheck.some(d => d.blocks.some(blockIncomplete))
        if (missingData) { toast.error('Hay ejercicios con datos incompletos (revisa series, repeticiones, duración o distancia).'); return }

        const parseOptionalKg = (raw: string | undefined): number | null => {
            if (raw == null) return null
            const t = raw.trim().replace(',', '.')
            if (t === '') return null
            const n = parseFloat(t)
            return Number.isFinite(n) ? n : null
        }

        // Validación de rangos client-side CON contexto (día/ejercicio) antes de mandar al
        // server: un negativo o fuera de rango en pesos/cargas/distancias/duraciones reventaba
        // TODO el guardado con un Zod error genérico sin pista de qué bloque falló. Los rangos
        // espejan el schema (@eva/schemas) para no rechazar nada que el server sí acepte.
        const numericIssue = (b: BuilderBlock): string | null => {
            const checks: Array<{ label: string; value: number | null; min: number; max: number }> = [
                { label: 'peso objetivo (kg)', value: parseOptionalKg(b.target_weight_kg), min: 0, max: Number.POSITIVE_INFINITY },
                { label: 'carga', value: parseOptionalKg(b.load_value), min: 0, max: 10000 },
                { label: 'distancia', value: parseOptionalKg(b.distance_value), min: 0, max: 1000000 },
            ]
            if (b.reps_value != null) checks.push({ label: 'repeticiones', value: b.reps_value, min: 0, max: 10000 })
            if (b.duration_sec != null) checks.push({ label: 'duración', value: b.duration_sec, min: 0, max: 86400 })
            if (b.progression_value != null && Number.isFinite(b.progression_value)) {
                checks.push({ label: 'progresión', value: b.progression_value, min: 0, max: 1000 })
            }
            for (const c of checks) {
                if (c.value == null) continue
                if (!Number.isFinite(c.value) || c.value < c.min || c.value > c.max) return c.label
            }
            return null
        }
        for (const d of allDaysToCheck) {
            for (const b of d.blocks) {
                const issue = numericIssue(b)
                if (issue) {
                    toast.error(`Revisa "${b.exercise_name}" en ${d.name}: ${issue} fuera de rango (no puede ser negativo).`)
                    return
                }
            }
        }

        // Red de seguridad server-side (idempotente): renormaliza superseries antes de
        // serializar. Repara también programas legacy corruptos (huérfanos / letras no
        // contiguas de imports o drags viejos) al re-guardarlos, sin reordenar bloques
        // (no toca order_index). Usa la MISMA resolución de área que el reducer.
        const knownAreaIds = new Set(orderedAreaIds(areas))
        const mapDays = (dayList: DayState[], variant: 'A' | 'B') =>
            dayList.filter(d => d.blocks.length > 0).map(d => ({
                day_of_week: d.id,
                title: d.title.trim(),
                week_variant: variant,
                blocks: sanitizeSupersets(d.blocks, b => effectiveAreaKey(b, knownAreaIds)).map((b, idx) => {
                    const type = effectiveExerciseType(b, { exercise_type: b.exercise_type })
                    const distanceValue = parseOptionalKg(b.distance_value)
                    const loadValue = parseOptionalKg(b.load_value)
                    // Coexistencia (decisión #3): reps SIEMPRE poblado. En strength manda el
                    // texto del coach; en tipos nuevos se genera el resumen legacy ≤20 chars.
                    const reps = type === 'strength'
                        ? (b.reps || '')
                        : legacyRepsSummaryFor(
                            { ...b, distance_value: distanceValue, load_value: loadValue },
                            type,
                        )
                    return {
                        exercise_id: b.exercise_id,
                        sets: Number.isFinite(b.sets as number) && (b.sets as number) >= 1 ? Math.round(b.sets as number) : type === 'strength' ? 3 : 1,
                        reps,
                        target_weight_kg: parseOptionalKg(b.target_weight_kg),
                        tempo: b.tempo || null,
                        rir: b.rir || null,
                        rest_time: b.rest_time || null,
                        warmup_rest_time: b.warmup_rest_time || null,
                        notes: b.notes || null,
                        superset_group: b.superset_group || null,
                        progression_type: b.progression_type || null,
                        progression_value:
                            b.progression_value != null && Number.isFinite(b.progression_value)
                                ? b.progression_value
                                : null,
                        progression_mode: b.progression_mode ?? null,
                        section: (b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main') as 'warmup' | 'main' | 'cooldown',
                        section_template_id: b.section_template_id ?? null,
                        is_override: b.is_override ?? false,
                        // Polimórfico: solo se envían valores reales (legacy ⇒ null, byte-identical)
                        exercise_type_override: b.exercise_type_override ?? null,
                        side_mode: b.side_mode ?? null,
                        reps_value: b.reps_value ?? null,
                        reps_unit: b.reps_unit ?? null,
                        load_type: b.load_type ?? null,
                        load_value: loadValue,
                        load_unit: b.load_unit ?? null,
                        distance_value: distanceValue,
                        distance_unit: distanceValue != null ? (b.distance_unit ?? 'm') : null,
                        duration_sec: b.duration_sec ?? null,
                        target_pace_sec_per_km: b.target_pace_sec_per_km ?? null,
                        hr_zone: b.hr_zone ?? null,
                        instructions: b.instructions?.trim() ? b.instructions.trim() : null,
                        interval_config: b.interval_config ?? null,
                        is_unilateral: b.is_unilateral ?? null,
                        extra_targets: b.extra_targets ?? null,
                        order_index: idx,
                    }
                })
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

            const result = await saveWorkoutProgramAction(input, {
                expectedUpdatedAt: initialProgram?.updated_at ?? null,
                force,
            })
            if (result?.conflict) {
                // E (awareness): otro coach del pool guardó mientras editabas — nada se pisó.
                const who = result.conflict.editedBy ?? 'Otro coach'
                toast.warning(`${who} guardó cambios en este programa mientras editabas.`, {
                    duration: 12000,
                    action: { label: 'Ver lo nuevo', onClick: () => window.location.reload() },
                    cancel: { label: 'Guardar igual', onClick: () => handleSave(true) },
                })
            } else if (result?.error) {
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

    if (!mounted) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-surface-app">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-app">
            <header className="z-20 flex-shrink-0 border-b border-subtle bg-surface-app/50 pt-safe pl-safe pr-safe backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-[2000px] items-center justify-between gap-3 px-4 md:gap-4 md:px-6">
                    <div className="flex min-w-0 items-center gap-3 md:gap-4">
                        <Link href={client ? `/coach/clients/${client.id}` : '/coach/templates'}>
                            <Button variant="ghost" size="icon" className="shrink-0 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                <ArrowLeft className="w-5 h-5 text-muted" />
                            </Button>
                        </Link>
                        <div className="min-w-0 flex-1">
                            {/* Desktop title */}
                            <div className="hidden md:block">
                                <div className="flex items-center gap-2">
                                    <h1 className="max-w-[140px] truncate font-display text-[18px] font-extrabold tracking-[-0.02em] text-strong md:max-w-[26rem]">
                                        {programName || 'Nuevo programa'}
                                    </h1>
                                    {hasUnsavedChanges && (
                                        <span className="hidden md:flex items-center gap-1 text-[9px] bg-[var(--warning-500)]/10 text-[var(--warning-600)] px-2 py-0.5 rounded-pill border border-[var(--warning-500)]/20 shrink-0">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning-500)] animate-pulse"></span>
                                            Cambios sin guardar
                                        </span>
                                    )}
                                    {lastEditor && (
                                        <span className="hidden md:inline-flex shrink-0">
                                            <EditedByBadge name={lastEditor.name} at={lastEditor.at} />
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted">
                                    {client ? `Cliente: ${client.full_name}` : 'Plantilla global'}
                                </p>
                            </div>
                            {/* Mobile title — tap to edit (design 1:1) */}
                            <div className="md:hidden min-w-0">
                                {mobileNameEdit ? (
                                    <input
                                        autoFocus
                                        value={programName}
                                        onChange={(e) => setProgramName(e.target.value)}
                                        onBlur={() => setMobileNameEdit(false)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') setMobileNameEdit(false) }}
                                        placeholder="Nombre del programa"
                                        className="w-full border-none bg-transparent font-display text-[17px] font-extrabold text-strong outline-none placeholder:text-[var(--text-muted)]/50"
                                    />
                                ) : (
                                    <button type="button" onClick={() => setMobileNameEdit(true)} className="block w-full min-w-0 text-left">
                                        <span className={`flex items-center gap-1.5 truncate font-display text-[17px] font-extrabold ${programName ? 'text-strong' : 'text-[var(--text-muted)]/50'}`}>
                                            <span className="truncate">{programName || 'Nombre del programa'}</span>
                                            <Pencil className="w-3 h-3 shrink-0 text-[var(--text-muted)]/40" />
                                        </span>
                                    </button>
                                )}
                                <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]/70 truncate">
                                    <span className="truncate">{client ? client.full_name : 'Plantilla'}</span>
                                    {hasUnsavedChanges && (
                                        <span className="flex shrink-0 items-center gap-1 font-bold text-[var(--warning-600)]">
                                            · <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--warning-500)] animate-pulse" /> Sin guardar
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 pr-2 md:gap-2 md:pr-0">
                        {/* Catalog toggle — tablet only (md→lg) */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="hidden md:max-lg:flex h-10 w-10 items-center justify-center text-muted hover:text-strong hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => setIsCatalogSidebarOpen(v => !v)}
                            title={isCatalogSidebarOpen ? 'Ocultar catálogo' : 'Mostrar catálogo'}
                        >
                            <Search className="w-4 h-4" />
                        </Button>

                        {/* Secondary actions — inline en desktop (icon-only lg→xl, con texto xl+); en tablet (md→lg) van al overflow ⋮ */}
                        <Button
                            variant="ghost"
                            size="sm"
                            data-tour-id="templates-button"
                            className="hidden lg:flex h-10 w-10 items-center justify-center gap-2 px-0 text-[13px] font-bold text-muted hover:text-strong hover:bg-black/5 dark:hover:bg-white/5 xl:w-auto xl:px-3"
                            onClick={() => setShowTemplatePicker(true)}
                            title="Cargar plantilla"
                        >
                            <LayoutTemplate className="w-4 h-4" />
                            <span className="hidden xl:inline">Plantillas</span>
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            data-tour-id="preview-button"
                            className="eva-press hidden lg:flex h-10 w-10 items-center justify-center gap-2 rounded-pill border-subtle px-0 text-[13px] font-bold text-muted hover:text-strong xl:w-auto xl:px-4"
                            onClick={() => setShowPreview(true)}
                            title="Vista previa"
                        >
                            <Eye className="w-4 h-4" />
                            <span className="hidden xl:inline">Vista previa</span>
                        </Button>

                        {!client && initialProgram?.id && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="hidden lg:flex h-10 w-10 items-center justify-center gap-2 px-0 text-[13px] font-bold text-muted hover:text-strong hover:bg-black/5 dark:hover:bg-white/5 xl:w-auto xl:px-3"
                                onClick={() => setShowAssign(true)}
                                title="Asignar a clientes"
                            >
                                <Users className="w-4 h-4" />
                                <span className="hidden xl:inline">Asignar</span>
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="sm"
                            data-tour-id="balance-button"
                            className="eva-press hidden lg:flex h-10 w-10 items-center justify-center gap-2 rounded-pill border-subtle px-0 text-[13px] font-bold text-muted hover:text-strong xl:w-auto xl:px-4"
                            onClick={() => setShowBalance(true)}
                            title="Balance muscular"
                        >
                            <BarChart3 className="w-4 h-4" />
                            <span className="hidden xl:inline">Balance</span>
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            data-tour-id="print-button"
                            className="hidden lg:flex h-10 w-10 items-center justify-center gap-2 px-0 text-[13px] font-bold text-muted hover:text-strong hover:bg-black/5 dark:hover:bg-white/5 xl:w-auto xl:px-3"
                            onClick={() => setShowPrint(true)}
                            title="Imprimir / Exportar PDF"
                        >
                            <Printer className="w-4 h-4" />
                            <span className="hidden xl:inline">Imprimir</span>
                        </Button>

                        <div className="hidden lg:flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                data-tour-id="undo-button"
                                className={`h-10 w-10 transition-colors ${canUndo ? 'text-muted hover:text-strong hover:bg-black/5 dark:hover:bg-white/5' : 'text-[var(--text-muted)]/30 cursor-not-allowed'}`}
                                onClick={undo}
                                disabled={!canUndo}
                                title="Deshacer (Ctrl+Z)"
                            >
                                <Undo2 className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                data-tour-id="redo-button"
                                className={`h-10 w-10 transition-colors ${canRedo ? 'text-muted hover:text-strong hover:bg-black/5 dark:hover:bg-white/5' : 'text-[var(--text-muted)]/30 cursor-not-allowed'}`}
                                onClick={redo}
                                disabled={!canRedo}
                                title="Rehacer (Ctrl+Shift+Z)"
                            >
                                <Redo2 className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Desktop overflow ⋮ — tablet (md→lg): acciones secundarias en dropdown */}
                        <div className="hidden md:max-lg:block">
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    className="h-10 w-10 min-w-0 rounded-full border-0 bg-transparent p-0 text-muted normal-case tracking-normal hover:bg-black/5 hover:text-strong dark:bg-transparent dark:hover:bg-white/5"
                                    aria-label="Más opciones"
                                    title="Más opciones"
                                >
                                    <MoreVertical className="w-5 h-5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[13rem]">
                                    <DropdownMenuItem onClick={() => setShowTemplatePicker(true)}>
                                        <LayoutTemplate className="w-4 h-4" /> Plantillas
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setShowPreview(true)}>
                                        <Eye className="w-4 h-4" /> Vista previa
                                    </DropdownMenuItem>
                                    {!client && initialProgram?.id && (
                                        <DropdownMenuItem onClick={() => setShowAssign(true)}>
                                            <Users className="w-4 h-4" /> Asignar a clientes
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => setShowBalance(true)}>
                                        <BarChart3 className="w-4 h-4" /> Balance muscular
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setShowPrint(true)}>
                                        <Printer className="w-4 h-4" /> Imprimir / PDF
                                    </DropdownMenuItem>
                                    {client && initialProgram?.id && sourceTemplateId && (
                                        <DropdownMenuItem
                                            disabled={isPending}
                                            onClick={() => {
                                                if (!initialProgram?.id) return
                                                startTransition(async () => {
                                                    const r = await syncProgramFromTemplateAction(initialProgram.id)
                                                    if (r.error) toast.error(r.error)
                                                    else { toast.success('Sincronizado con la plantilla base.'); router.refresh() }
                                                })
                                            }}
                                        >
                                            <RefreshCw className="w-4 h-4" /> Sync plantilla
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={undo} disabled={!canUndo}>
                                        <Undo2 className="w-4 h-4" /> Deshacer
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={redo} disabled={!canRedo}>
                                        <Redo2 className="w-4 h-4" /> Rehacer
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Mobile overflow menu — hidden on md+ */}
                        <button
                            type="button"
                            data-tour-id="mobile-more-menu"
                            onClick={() => setShowOverflow(true)}
                            title="Más opciones"
                            className="md:hidden flex h-8 w-8 items-center justify-center border-0 bg-transparent text-muted hover:text-strong hover:bg-black/5 dark:hover:bg-white/5"
                        >
                            <MoreVertical className="w-5 h-5" />
                        </button>

                        <div className="relative">
                            {!hasSeenShortTour && (
                                <span className="absolute inset-0 rounded-lg animate-ping bg-primary/25 pointer-events-none" />
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                data-tour-id="help-tour-button"
                                className="relative h-8 w-8 md:h-10 md:w-10 border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/60"
                                onClick={handleOpenFullTour}
                                title="Guía del Builder"
                                aria-label="Abrir guía del builder"
                            >
                                <CircleHelp className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Configurar — pill icon+label, always visible */}
                        <div className="relative">
                            {/* Ping permanente — sólo cuando el panel está cerrado */}
                            {!showConfig && (
                                <span className="absolute inset-0 rounded-pill animate-ping bg-[var(--warning-500)]/20 pointer-events-none" />
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                data-tour-id="top-config-button"
                                className={`eva-press relative h-8 w-8 gap-2 rounded-pill px-0 transition-all md:h-10 md:w-10 md:px-0 xl:w-auto xl:px-4 ${
                                    showConfig
                                        ? 'border-[var(--warning-500)]/60 bg-[var(--warning-500)]/10 text-[var(--warning-600)]'
                                        : 'border-[var(--warning-500)]/40 text-[var(--warning-600)] hover:bg-[var(--warning-500)]/10 hover:border-[var(--warning-500)]/60 shadow-[0_0_10px_rgba(251,191,36,0.25)]'
                                }`}
                                onClick={() => {
                                    setShowConfig(!showConfig)
                                    dismissBuilderHint()
                                }}
                                title="Configurar programa"
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                <span className="hidden xl:inline text-[13px] font-bold">Configurar</span>
                            </Button>
                        </div>

                        {client && initialProgram?.id && sourceTemplateId && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="hidden lg:flex h-10 w-10 items-center justify-center gap-2 px-0 text-[13px] font-bold border-[var(--aqua-600)]/30 text-[var(--aqua-600)] hover:bg-[var(--aqua-500)]/10 xl:w-auto xl:px-3"
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
                                <RefreshCw className="w-4 h-4" />
                                <span className="hidden xl:inline">Sync plantilla</span>
                            </Button>
                        )}

                        {/* Save — desktop (en móvil vive en la save-bar inferior) */}
                        <Button
                            onClick={() => handleSave()}
                            disabled={isPending || !programName.trim()}
                            data-tour-id={isMobile ? undefined : 'save-button'}
                            size="sm"
                            className="eva-press hidden h-10 min-h-10 shrink-0 rounded-pill text-[13px] font-bold bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--theme-primary-rgb,0,122,255),0.3)] transition-all hover:opacity-90 disabled:opacity-50 md:flex md:px-6"
                            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                        >
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            {isPending ? 'Guardando...' : client ? 'Guardar y enviar' : 'Guardar plantilla'}
                        </Button>
                    </div>
                </div>

                {showBuilderHint && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--warning-500)]/10 border-b border-[var(--warning-500)]/20 animate-in slide-in-from-top-1 duration-300">
                        <Settings className="w-4 h-4 text-[var(--warning-600)] shrink-0" />
                        <p className="flex-1 text-xs font-medium text-[var(--warning-600)]">
                            <strong>Configura la base del programa.</strong> En <strong>Configurar</strong> defines estructura, duraci&oacute;n y fases (solo visuales).
                        </p>
                        <button
                            onClick={dismissBuilderHint}
                            className="shrink-0 text-[var(--warning-600)]/60 hover:text-[var(--warning-600)] text-lg leading-none"
                            aria-label="Cerrar"
                        >
                            ✕
                        </button>
                    </div>
                )}

                <ProgramPhasesBar phases={programPhases} />
            </header>

            {showDraftBanner && (
                <div className="mx-3 mt-2.5 animate-in slide-in-from-top-1 rounded-card border border-primary/25 bg-primary/10 p-3 md:mx-6 md:rounded-control">
                    <div className="flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <History className="hidden h-4 w-4 shrink-0 text-primary sm:block" />
                        <p className="flex-1 text-xs font-semibold text-primary">Tienes un borrador sin guardar de esta sesión.</p>
                        <div className="flex items-center justify-end gap-2">
                            <Button
                                size="sm"
                                onClick={handleRestoreDraft}
                                className="eva-press h-8 rounded-control px-3 text-xs font-bold bg-primary text-primary-foreground hover:opacity-90"
                                style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                            >
                                Restaurar
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={handleDiscardDraft}
                                aria-label="Descartar borrador"
                                className="h-8 w-8 text-primary/70 hover:text-primary hover:bg-primary/10"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex min-h-0 flex-1 overflow-hidden max-w-[2000px] w-full mx-auto relative bg-surface-sunken/30 dark:bg-surface-app/80">
                    {/* Catalog sidebar — hidden mobile, collapsible tablet, always open desktop */}
                    <div className={`hidden md:flex min-h-0 flex-col flex-shrink-0 border-r border-subtle bg-surface-app/50 backdrop-blur-sm relative z-10 transition-all duration-300 lg:w-[350px] ${
                        isCatalogSidebarOpen ? 'md:max-lg:w-[300px]' : 'md:max-lg:w-[48px] md:max-lg:overflow-hidden'
                    }`}>
                        {/* Toggle button — tablet only */}
                        <div className="hidden md:max-lg:flex justify-center py-3 border-b border-subtle shrink-0">
                            <button
                                onClick={() => setIsCatalogSidebarOpen(v => !v)}
                                className="p-2 rounded-lg hover:bg-surface-sunken transition-colors text-muted hover:text-strong min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title={isCatalogSidebarOpen ? 'Ocultar catálogo' : 'Mostrar catálogo'}
                            >
                                <Search className="w-4 h-4" />
                            </button>
                        </div>
                        <div data-tour-id="exercise-catalog" className={`flex-1 min-h-0 transition-opacity duration-200 ${!isCatalogSidebarOpen ? 'md:max-lg:opacity-0 md:max-lg:pointer-events-none' : ''}`}>
                            <DraggableExerciseCatalog
                                exercises={exercises}
                                selectedMuscleGroup={catalogMuscleFilter}
                                onSelectedMuscleGroupChange={setCatalogMuscleFilter}
                            />
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-surface-app to-surface-app">
                        {/* A/B Mode bar */}
                        <div className="flex items-center gap-3 px-4 py-2 border-b border-subtle bg-surface-app/50 flex-shrink-0">
                            <button
                                onClick={() => setIsABMode(v => !v)}
                                data-tour-id="ab-toggle"
                                className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors ${
                                    isABMode
                                        ? 'bg-primary/10 border-primary/30 text-primary'
                                        : 'border-subtle text-muted hover:border-primary/30 hover:text-primary'
                                }`}
                            >
                                <span className="font-black">A/B</span>
                                <span>{isABMode ? 'Semanas alternas activas' : 'Activar semanas A/B'}</span>
                            </button>

                            {isABMode && (
                                <div className="flex bg-surface-sunken/50 p-0.5 rounded-lg">
                                    {(['A', 'B'] as const).map(v => (
                                        <button
                                            key={v}
                                            onClick={() => setActiveVariant(v)}
                                            className={`px-4 py-1 text-[11px] font-black uppercase tracking-widest rounded-md transition-colors ${
                                                activeVariant === v
                                                    ? 'bg-surface-app text-strong shadow-sm'
                                                    : 'text-muted hover:text-strong'
                                            }`}
                                        >
                                            Semana {v}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <span className="ml-auto text-[11px] font-bold text-subtle md:hidden">
                                {programStructureType === 'weekly' ? 'Semanal' : `Ciclo ${cycleLength}d`} · {weeksToRepeat} sem
                            </span>

                            {isABMode && (
                                <p className="text-[9px] text-muted uppercase tracking-widest ml-auto hidden md:block">
                                    El sistema alterna A→B cada semana automáticamente
                                </p>
                            )}

                            {/* Desktop day scroll arrows — hidden on mobile */}
                            {!isMobile && (
                                <div className={`flex items-center gap-1 ${isABMode ? '' : 'ml-auto'}`}>
                                    <button
                                        onClick={() => scrollBoard('left')}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-subtle text-muted hover:text-strong hover:bg-surface-sunken transition-colors"
                                        title="Días anteriores"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => scrollBoard('right')}
                                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-subtle text-muted hover:text-strong hover:bg-surface-sunken transition-colors"
                                        title="Días siguientes"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar" ref={boardScrollRef} data-tour-id="days-board">
                        {isMobile ? (
                            <div className="h-full flex flex-col">
                                {/* Mobile day selector — scroll chips (design 1:1); centrado cuando caben sin scroll */}
                                <div className="overflow-x-auto px-4 pt-3.5 pb-1 mb-1 flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
                                    <div className="mx-auto flex w-max gap-2">
                                    {days.map((d, idx) => {
                                        const isActive = activeMobileDayIndex === idx
                                        const has = d.blocks.length > 0
                                        return (
                                            <button
                                                key={d.id}
                                                onClick={() => setActiveMobileDayIndex(idx)}
                                                className={`flex-none flex flex-col items-center justify-center gap-1 min-w-[52px] h-[60px] px-2.5 rounded-xl transition-all ${
                                                    isActive ? 'bg-foreground' : 'bg-surface-card shadow-sm'
                                                }`}
                                            >
                                                <span className={`font-display text-[13px] font-extrabold ${isActive ? 'text-background' : 'text-strong'}`}>
                                                    {d.name.slice(0, 3)}
                                                </span>
                                                {d.is_rest ? (
                                                    <Moon className={`w-3 h-3 ${isActive ? 'text-muted' : 'text-[var(--text-muted)]/40'}`} />
                                                ) : (
                                                    <span className={`w-1.5 h-1.5 rounded-full ${has ? (isActive ? 'bg-[var(--sport-400)]' : 'bg-primary') : (isActive ? 'bg-[var(--text-muted)]/50' : 'bg-[var(--text-muted)]/20')}`} />
                                                )}
                                            </button>
                                        )
                                    })}
                                    </div>
                                </div>

                                {/* Carousel swipeable area */}
                                <div
                                    className="flex-1 overflow-hidden relative"
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
                                                    /* SIN padding-bottom: el FAB + Guardar flotan (fixed) SOBRE la
                                                       lista; la lista corre por detrás de los botones hasta el borde
                                                       inferior. Cualquier reserva aquí (la vieja de +96px, o safe-area)
                                                       dejaba una banda muerta al pie tapando la última tarjeta — la
                                                       "barra negra" que reportó el CEO. */
                                                    WebkitOverflowScrolling: 'touch',
                                                } as React.CSSProperties}
                                            >
                                                <DayColumn
                                                    day={day}
                                                    exercises={exercises}
                                                    allDays={days}
                                                    isCycleMode={programStructureType === 'cycle'}
                                                    isDragPending={isDragPending}
                                                    narrowLayout={isMobile}
                                                    areas={areas}
                                                    onMoveBlock={handleMoveBlock}
                                                    onAddExercise={handleAddExercise}
                                                    onEditBlock={setEditingBlock}
                                                    onRemoveBlock={handleRemoveBlock}
                                                    onUpdateBlock={handleUpdateBlock}
                                                    onUpdateTitle={handleUpdateTitle}
                                                    onCopyDay={handleCopyDay}
                                                    onToggleRest={handleToggleRest}
                                                    onToggleSuperset={handleToggleSuperset}
                                                    onSetBlockArea={handleSetBlockArea}
                                                    onToggleBlockOverride={handleToggleBlockOverride}
                                                    templateLinked={!!(client?.id && sourceTemplateId)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-full min-w-0 items-stretch gap-4 px-6 py-6">
                                {days.map((day) => (
                                    <div key={day.id} className="h-full shrink-0 pb-8">
                                        <DayColumn
                                            day={day}
                                            exercises={exercises}
                                            allDays={days}
                                            isCycleMode={programStructureType === 'cycle'}
                                            isDragPending={isDragPending}
                                            narrowLayout={isMobile}
                                            areas={areas}
                                            onAddExercise={handleAddExercise}
                                            onEditBlock={setEditingBlock}
                                            onRemoveBlock={handleRemoveBlock}
                                            onUpdateBlock={handleUpdateBlock}
                                            onUpdateTitle={handleUpdateTitle}
                                            onCopyDay={handleCopyDay}
                                            onToggleRest={handleToggleRest}
                                            onToggleSuperset={handleToggleSuperset}
                                            onSetBlockArea={handleSetBlockArea}
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

                    {/* Catálogo — bottom-sheet completo (única entrada = FAB +) */}
                    {isMobile && isCatalogOpen && (
                        <>
                            <div
                                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 transition-opacity"
                                onClick={() => setIsCatalogOpen(false)}
                            />
                            <div
                                className="fixed left-0 right-0 bg-surface-app border-t border-subtle shadow-2xl z-40 select-none rounded-t-3xl overflow-hidden animate-in slide-in-from-bottom"
                                style={{ height: '80dvh', bottom: 'env(safe-area-inset-bottom, 0px)' }}
                            >
                                <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-subtle">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-strong">Añadir ejercicio</span>
                                    <button
                                        type="button"
                                        onClick={() => setIsCatalogOpen(false)}
                                        className="h-9 w-9 flex items-center justify-center rounded-full text-muted hover:text-strong hover:bg-surface-sunken transition-colors"
                                        aria-label="Cerrar catálogo"
                                    >
                                        <span className="text-xl leading-none">×</span>
                                    </button>
                                </div>
                                <div data-tour-id="exercise-catalog-mobile" className="h-[calc(100%-48px)] overflow-hidden px-4 pb-4 pt-3">
                                    <DraggableExerciseCatalog
                                        exercises={exercises}
                                        selectedMuscleGroup={catalogMuscleFilter}
                                        onSelectedMuscleGroupChange={setCatalogMuscleFilter}
                                        onTapAdd={(exercise) => {
                                            const dayId = days[activeMobileDayIndex]?.id
                                            if (dayId != null) {
                                                handleAddExercise(dayId, exercise)
                                                toast.success(`${exercise.name} añadido`)
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* FAB + guardar — stack abajo-derecha (mobile) */}
                    {isMobile && !isCatalogOpen && (
                        <div
                            className="fixed right-4 z-40 flex flex-row items-center gap-3"
                            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
                        >
                            {/* Guardar — pill compacto (mismo handler/estado que desktop) */}
                            <button
                                type="button"
                                onClick={() => handleSave()}
                                disabled={isPending || !programName.trim()}
                                data-tour-id="save-button"
                                aria-label={client ? 'Guardar y enviar' : 'Guardar plantilla'}
                                className="eva-press flex h-14 items-center gap-2 rounded-full px-5 text-[14px] font-bold text-primary-foreground shadow-xl transition-transform active:scale-95 disabled:opacity-50 disabled:shadow-none"
                                style={{
                                    backgroundColor: 'var(--theme-primary, #007AFF)',
                                    boxShadow: '0 6px 20px rgba(var(--theme-primary-rgb, 0, 122, 255), 0.42)',
                                }}
                            >
                                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}
                                <span>{isPending ? 'Guardando...' : 'Guardar'}</span>
                            </button>

                            {/* + FAB — única entrada al catálogo */}
                            {!days[activeMobileDayIndex]?.is_rest && (
                                <button
                                    type="button"
                                    data-tour-id="exercise-fab"
                                    onClick={() => setIsCatalogOpen(true)}
                                    aria-label="Agregar ejercicio"
                                    className="w-14 h-14 rounded-full text-primary-foreground shadow-xl flex items-center justify-center transition-transform active:scale-95"
                                    style={{
                                        backgroundColor: 'var(--theme-primary, #2680FF)',
                                        boxShadow: '0 6px 20px rgba(var(--theme-primary-rgb, 38, 128, 255), 0.42)',
                                    }}
                                >
                                    <Plus className="w-6 h-6" strokeWidth={3} />
                                </button>
                            )}
                        </div>
                    )}

                    <DragOverlay dropAnimation={null}>
                        {activeId && activeData ? (
                            activeData.type === 'new-exercise' ? (
                                <div className="p-4 bg-primary/10 border-2 border-primary/50 border-dashed rounded-control backdrop-blur-xl shadow-2xl transform scale-105 rotate-3 -mr-16">
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
                                <div className="opacity-80 scale-105 rotate-3 w-[320px] pointer-events-none shadow-2xl z-50">
                                    <ExerciseBlock
                                        block={activeData.block}
                                        dayId={activeData.dayId}
                                        areaVMs={overlayAreaVMs}
                                        onEdit={() => {}}
                                        onRemove={() => {}}
                                        narrowLayout={isMobile}
                                    />
                                </div>
                            ) : null
                        ) : null}
                    </DragOverlay>
                </div>
            </DndContext>

            {/* Overflow "Más" — bottom-sheet mobile (kit: filas ícono-tile + label) */}
            <Sheet open={showOverflow} onOpenChange={setShowOverflow}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body md:hidden"
                >
                    <div className="flex max-h-[80dvh] flex-col overflow-y-auto px-4 pb-2 pt-3">
                        <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
                        <SheetHeader className="border-0 bg-transparent p-0">
                            <SheetTitle className="sr-only">Más opciones</SheetTitle>
                        </SheetHeader>
                        {([
                            { icon: LayoutTemplate, label: 'Plantillas', onSelect: () => setShowTemplatePicker(true) },
                            { icon: Eye, label: 'Vista previa', onSelect: () => setShowPreview(true) },
                            ...(!client && initialProgram?.id
                                ? [{ icon: Users, label: 'Asignar a alumnos', onSelect: () => setShowAssign(true) }]
                                : []),
                            { icon: BarChart3, label: 'Balance muscular', onSelect: () => setShowBalance(true) },
                            { icon: Printer, label: 'Imprimir / PDF', onSelect: () => setShowPrint(true) },
                            { icon: Undo2, label: 'Deshacer', onSelect: undo, disabled: !canUndo },
                            { icon: Redo2, label: 'Rehacer', onSelect: redo, disabled: !canRedo },
                        ] as Array<{ icon: LucideIcon; label: string; onSelect: () => void; disabled?: boolean }>).map(item => (
                            <button
                                key={item.label}
                                type="button"
                                disabled={item.disabled}
                                onClick={() => { setShowOverflow(false); item.onSelect() }}
                                className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors active:bg-surface-sunken disabled:opacity-40"
                            >
                                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-[var(--ink-700)]">
                                    <item.icon className="h-[18px] w-[18px]" />
                                </span>
                                <span className="text-[15px] font-semibold text-strong">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </SheetContent>
            </Sheet>

            <BlockEditSheet
                block={editingBlock}
                clientId={client?.id}
                cardio={cardio}
                isMobile={isMobile}
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
                    const byId = new Map(exercises.map(e => [e.id, e]))
                    // Variante A → builderA; variante B → builderB (antes la B se descartaba en silencio,
                    // degradando una plantilla A/B a semana simple).
                    builderA.dispatchWithHistory({ type: 'SET_DAYS', payload: enrichDaysWithExerciseMedia(newDays, byId) })
                    // Reflejar el estado A/B de la plantilla: si es A/B, cargar builderB; si NO, apagar
                    // A/B y limpiar builderB — sin esto, una semana B vieja quedaba persistida al guardar
                    // una plantilla simple (handleSave guarda builderB cuando isABMode sigue en true).
                    if (meta.ab_mode || meta.daysB) {
                        setIsABMode(true)
                        builderB.dispatchWithHistory({ type: 'SET_DAYS', payload: enrichDaysWithExerciseMedia(meta.daysB ?? [], byId) })
                    } else {
                        setIsABMode(false)
                        builderB.dispatchWithHistory({ type: 'SET_DAYS', payload: DAYS_OF_WEEK.map(d => ({ ...d, title: '', blocks: [] as BuilderBlock[] })) })
                    }
                    setActiveVariant('A')
                    setProgramName((prev: string) => prev || name)
                    setWeeksToRepeat(meta.weeks_to_repeat)
                    setDurationType(meta.duration_type as any)
                    setDurationDays(meta.duration_days)
                    setProgramNotes(meta.program_notes)
                    if (meta.start_date_flexible != null) setStartDateFlexible(meta.start_date_flexible)
                    if (meta.program_structure_type) setProgramStructureTypeState(meta.program_structure_type)
                    if (meta.cycle_length) setCycleLengthState(meta.cycle_length)
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
                areas={areas}
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

            <ProgramConfigSheet
                open={showConfig}
                onClose={() => setShowConfig(false)}
                isMobile={isMobile}
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
                isABMode={isABMode} setIsABMode={setIsABMode}
            />

            <PrintProgramDialog
                open={showPrint}
                onClose={() => setShowPrint(false)}
                programName={programName || 'Programa'}
                clientName={client?.full_name ?? undefined}
                coachName={coachName}
                weeksToRepeat={weeksToRepeat}
                days={builderA.days}
                daysB={isABMode ? builderB.days : undefined}
                isABMode={isABMode}
            />

            <BuilderOnboardingTour
                open={tourOpen}
                mode={tourMode}
                steps={tourMode === 'short' ? shortTourSteps : fullTourSteps}
                onClose={handleCloseTour}
                onStepChange={handleStepChange}
                getFooterHint={tourFooterHint}
                deferAutoSkipIfTargetMissing={TOUR_CONFIG_INTERNAL_STEP_IDS}
                spotlightRemeasureSignal={`${showConfig}-${isCatalogOpen}`}
            />
        </div>
    )
}
