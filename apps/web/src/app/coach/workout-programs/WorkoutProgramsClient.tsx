'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import {
    ArrowUpDown,
    Check,
    ChevronsUpDown,
    LayoutGrid,
    List,
    Loader2,
    Plus,
    Search,
    X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
    assignProgramToClientsAction,
    deleteWorkoutProgramAction,
    duplicateWorkoutProgramAction,
    syncProgramFromTemplateAction,
} from '../builder/[clientId]/_actions/builder.actions'
import { motion, useReducedMotion } from 'framer-motion'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { ProgramCard, ProgramRow } from './components/ProgramRow'
import { ProgramPreviewPanel } from './components/ProgramPreviewPanel'
import {
    type LibraryFilters,
    type ProgramListModel,
    matchesProgramFilters,
} from './libraryStats'
import type { WorkoutArea } from '@/domain/workout/types'
interface Client {
    id: string
    full_name: string
    workout_programs?: {
        id: string
        name: string
        is_active?: boolean
    }[] | null
}

interface WorkoutProgramsClientProps {
    initialPrograms: ProgramListModel[]
    availableClients: Client[]
    /** Areas visibles del workspace activo — el preview titula bloques en areas custom/extra. */
    areas?: WorkoutArea[]
}

const libraryEmptyCardClass =
    'rounded-card border border-subtle bg-surface-card px-4 py-14 text-center text-strong shadow-sm'

function defaultDuplicateProgramName(program: ProgramListModel): string {
    if (program.client_id && program.client?.full_name) {
        return `Copia de ${program.client.full_name}`
    }
    return `${program.name} (Copia)`
}

function LibraryEmptyState({
    hasPrograms,
    filterType,
    search,
    onNewTemplate,
}: {
    hasPrograms: boolean
    filterType: LibraryFilters['filterType']
    search: string
    onNewTemplate: () => void
}) {
    const trimmed = search.trim()
    if (hasPrograms && trimmed) {
        return (
            <div className={libraryEmptyCardClass}>
                <p className="text-sm font-medium text-strong">Sin resultados para tu búsqueda</p>
                <p className="mt-1 text-xs text-muted">Prueba con otro término o revisa los filtros.</p>
            </div>
        )
    }
    if (hasPrograms && filterType === 'templates') {
        return (
            <div className={libraryEmptyCardClass}>
                <p className="text-sm font-medium text-strong">No hay plantillas con estos criterios</p>
                <p className="mt-1 text-xs text-muted">Crea una plantilla nueva o cambia el filtro.</p>
            </div>
        )
    }
    if (hasPrograms && filterType === 'assigned') {
        return (
            <div className={libraryEmptyCardClass}>
                <p className="text-sm font-medium text-strong">No hay programas en curso</p>
                <p className="mt-1 text-xs text-muted">Asigna una plantilla a un alumno para verla aquí.</p>
            </div>
        )
    }
    if (hasPrograms) {
        return (
            <div className={libraryEmptyCardClass}>
                <p className="text-sm font-medium text-strong">Nada que mostrar con estos filtros</p>
                <p className="mt-1 text-xs text-muted">Ajusta filtros o la búsqueda.</p>
            </div>
        )
    }
    return (
        <div className={libraryEmptyCardClass}>
            <p className="text-sm font-medium text-strong">Aún no tienes programas</p>
            <p className="mt-1 text-xs text-muted">Crea tu primera plantilla para empezar.</p>
            <Button type="button" variant="sport" className="mt-4 h-11 w-full gap-2 rounded-control shadow-sm sm:h-10 sm:w-auto" onClick={onNewTemplate}>
                <Plus className="size-4" />
                Nueva plantilla
            </Button>
        </div>
    )
}

function subscribeAssignMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 768px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}

/** matchMedia md-up (mismo patrón que ProgramPreviewPanel): desktop → Dialog, móvil → bottom-sheet. */
function useIsDesktopMd() {
    return useSyncExternalStore(
        subscribeAssignMd,
        () => window.matchMedia('(min-width: 768px)').matches,
        () => true,
    )
}

export function WorkoutProgramsClient({
    initialPrograms,
    availableClients,
    areas = [],
}: WorkoutProgramsClientProps) {
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const isAssignDesktop = useIsDesktopMd()
    const [search, setSearch] = useState('')
    const [filterType, setFilterType] = useState<LibraryFilters['filterType']>('all')
    const [sort, setSort] = useState<'Recientes' | 'Nombre'>('Recientes')
    const [sortOpen, setSortOpen] = useState(false)
    const [programs, setPrograms] = useState<ProgramListModel[]>(initialPrograms)
    useEffect(() => {
        setPrograms(initialPrograms)
    }, [initialPrograms])
    const [isAssignOpen, setIsAssignOpen] = useState(false)
    const [selectedProgram, setSelectedProgram] = useState<ProgramListModel | null>(null)
    const [selectedClients, setSelectedClients] = useState<string[]>([])
    const [isPending, startTransition] = useTransition()
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [programToPreview, setProgramToPreview] = useState<ProgramListModel | null>(null)
    const [clientSearch, setClientSearch] = useState('')

    const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false)
    const [clientsWithExistingPlans, setClientsWithExistingPlans] = useState<Client[]>([])

    const [openPopover, setOpenPopover] = useState(false)
    const [assignmentStartMode, setAssignmentStartMode] = useState<'today' | 'custom' | 'flexible'>('today')
    const [assignmentStartDate, setAssignmentStartDate] = useState(new Date().toISOString().split('T')[0])
    const [assignmentDurationWeeks, setAssignmentDurationWeeks] = useState('4')
    const [assignmentDays, setAssignmentDays] = useState<number[]>([])
    const [showSyncDialog, setShowSyncDialog] = useState(false)
    const [programToSync, setProgramToSync] = useState<ProgramListModel | null>(null)
    const [programToDelete, setProgramToDelete] = useState<ProgramListModel | null>(null)
    const [programToDuplicate, setProgramToDuplicate] = useState<ProgramListModel | null>(null)
    const [duplicateNameInput, setDuplicateNameInput] = useState('')
    const duplicateNameInputRef = useRef<HTMLInputElement>(null)
    const [actionProgramId, setActionProgramId] = useState<string | null>(null)

    // Mantiene la vista previa en sync cuando la lista se refresca.
    useEffect(() => {
        setProgramToPreview((prev) => (prev ? (programs.find((p) => p.id === prev.id) ?? null) : null))
    }, [programs])

    const filterState = useMemo<LibraryFilters>(
        () => ({
            search,
            filterType,
            filterStatus: 'all',
            filterStructure: 'all',
            filterHasPhases: 'all',
        }),
        [search, filterType]
    )

    const filtered = useMemo(() => {
        const rows = programs.filter((p) => matchesProgramFilters(p, filterState))
        if (sort === 'Nombre') {
            return rows.slice().sort((a, b) => a.name.localeCompare(b.name))
        }
        return rows.slice().sort((a, b) => {
            const da = new Date(a.updated_at || a.created_at).getTime()
            const db = new Date(b.updated_at || b.created_at).getTime()
            return db - da
        })
    }, [programs, filterState, sort])

    const templateCount = useMemo(() => programs.filter((p) => !p.client_id).length, [programs])
    const activeAssignedCount = useMemo(
        () => programs.filter((p) => !!p.client_id && p.is_active).length,
        [programs]
    )
    const tabCounts: Record<LibraryFilters['filterType'], number> = {
        all: programs.length,
        templates: templateCount,
        assigned: activeAssignedCount,
    }
    const filtering = search.trim().length > 0

    const listMotionKey = `${search}|${filterType}|${sort}`

    const openPreview = (program: ProgramListModel) => {
        setProgramToPreview(program)
        setIsPreviewOpen(true)
    }
    const previewAssign = () => {
        if (!programToPreview) return
        setSelectedProgram(programToPreview)
        setIsPreviewOpen(false)
        setIsAssignOpen(true)
    }
    const previewEdit = () => {
        if (!programToPreview) return
        const isTemplate = !programToPreview.client_id
        const href = isTemplate
            ? `/coach/workout-programs/builder?programId=${programToPreview.id}`
            : `/coach/builder/${programToPreview.client_id}?programId=${programToPreview.id}`
        setIsPreviewOpen(false)
        router.push(href)
    }
    const previewDuplicate = () => {
        if (!programToPreview) return
        const p = programToPreview
        setIsPreviewOpen(false)
        openDuplicateDialog(p)
    }
    const previewSync = () => {
        if (!programToPreview) return
        setProgramToSync(programToPreview)
        setIsPreviewOpen(false)
        setShowSyncDialog(true)
    }
    const previewDelete = () => {
        if (!programToPreview) return
        const p = programToPreview
        setIsPreviewOpen(false)
        setProgramToDelete(p)
    }

    const assignDaysMismatch = useMemo(() => {
        if (!selectedProgram || assignmentDays.length === 0) return false
        const planDays = new Set((selectedProgram.workout_plans ?? []).map((p) => p.day_of_week))
        return !assignmentDays.some((d) => planDays.has(d))
    }, [selectedProgram, assignmentDays])

    const handleAssign = (force = false) => {
        if (!selectedProgram || selectedClients.length === 0) {
            toast.error('Selecciona al menos un alumno')
            return
        }

        if (assignDaysMismatch) {
            toast.error(
                'Los días marcados no coinciden con ningún día de esta plantilla. Quita la selección o elige otros.'
            )
            return
        }

        if (!force) {
            const clientsToOverwrite = availableClients.filter(
                (c) =>
                    selectedClients.includes(c.id) &&
                    c.workout_programs &&
                    c.workout_programs.length > 0 &&
                    c.workout_programs[0].id !== selectedProgram.id
            )

            if (clientsToOverwrite.length > 0) {
                setClientsWithExistingPlans(clientsToOverwrite)
                setShowConfirmOverwrite(true)
                return
            }
        }

        setShowConfirmOverwrite(false)

        setActionProgramId(selectedProgram.id)
        startTransition(async () => {
            const startDateFlexible =
                assignmentStartMode === 'flexible' ? true : assignmentStartMode === 'custom' ? false : undefined

            const result = await assignProgramToClientsAction(selectedProgram.id, selectedClients, {
                startDate: assignmentStartMode === 'custom' ? assignmentStartDate : undefined,
                durationWeeks: Math.max(1, Number(assignmentDurationWeeks) || 4),
                selectedDays: assignmentDays.length ? assignmentDays : undefined,
                ...(typeof startDateFlexible === 'boolean' ? { startDateFlexible } : {}),
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                const assignedCount = result.assignedCount ?? selectedClients.length
                toast.success(`Programa asignado a ${assignedCount} alumno${assignedCount !== 1 ? 's' : ''}`)
                if (result.failedClients?.length) {
                    toast.warning(`${result.failedClients.length} asignación(es) no se pudieron completar`)
                }
                setIsAssignOpen(false)
                setSelectedClients([])
                router.refresh()
            }
            setActionProgramId(null)
        })
    }

    const handleSync = (program: ProgramListModel) => {
        setActionProgramId(program.id)
        startTransition(async () => {
            const result = await syncProgramFromTemplateAction(program.id)
            if (result.error) toast.error(result.error)
            else {
                toast.success('Programa sincronizado desde la plantilla')
                router.refresh()
            }
            setActionProgramId(null)
        })
    }

    const dayOptions = [
        { id: 1, label: 'Lun' },
        { id: 2, label: 'Mar' },
        { id: 3, label: 'Mié' },
        { id: 4, label: 'Jue' },
        { id: 5, label: 'Vie' },
        { id: 6, label: 'Sáb' },
        { id: 7, label: 'Dom' },
    ]

    const openDuplicateDialog = (program: ProgramListModel) => {
        setProgramToDuplicate(program)
        setDuplicateNameInput(defaultDuplicateProgramName(program))
    }

    const trimmedDuplicateName = duplicateNameInput.trim()
    const duplicateTemplateNameTaken =
        !!programToDuplicate &&
        trimmedDuplicateName.length >= 2 &&
        programs.some((p) => !p.client_id && p.name === trimmedDuplicateName)
    const duplicateNameTooShort = trimmedDuplicateName.length > 0 && trimmedDuplicateName.length < 2
    const duplicateNameTooLong = trimmedDuplicateName.length > 100
    const canConfirmDuplicate =
        !!programToDuplicate &&
        trimmedDuplicateName.length >= 2 &&
        trimmedDuplicateName.length <= 100 &&
        !duplicateTemplateNameTaken

    useEffect(() => {
        if (!programToDuplicate) return
        const id = requestAnimationFrame(() => {
            duplicateNameInputRef.current?.focus()
            duplicateNameInputRef.current?.select()
        })
        return () => cancelAnimationFrame(id)
    }, [programToDuplicate])

    const handleConfirmDuplicate = () => {
        if (!programToDuplicate || !canConfirmDuplicate) return
        const trimmed = duplicateNameInput.trim()
        setActionProgramId(programToDuplicate.id)
        startTransition(async () => {
            const result = await duplicateWorkoutProgramAction(programToDuplicate.id, trimmed)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Programa duplicado correctamente')
                if (result.program) {
                    setPrograms((prev) => [result.program!, ...prev])
                } else {
                    router.refresh()
                }
                setProgramToDuplicate(null)
                setDuplicateNameInput('')
            }
            setActionProgramId(null)
        })
    }

    const closeDuplicateDialog = () => {
        setProgramToDuplicate(null)
        setDuplicateNameInput('')
    }

    const handleDelete = (program: ProgramListModel) => {
        setActionProgramId(program.id)
        startTransition(async () => {
            const result = await deleteWorkoutProgramAction(program.id, program.client_id || '')
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Programa eliminado')
                setPrograms((prev) => prev.filter((p) => p.id !== program.id))
                setProgramToPreview((prev) => (prev?.id === program.id ? null : prev))
                router.refresh()
            }
            setProgramToDelete(null)
            setActionProgramId(null)
        })
    }

    const toggleClient = (clientId: string) => {
        setSelectedClients((prev) =>
            prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
        )
    }

    // El contenedor de «Asignar programa» es responsive (bottom-sheet en móvil, dialog en
    // desktop); el cuerpo y la botonera se comparten entre ambos — solo cambia el shell.
    const handleAssignOpenChange = (open: boolean) => {
        setIsAssignOpen(open)
        if (!open) setOpenPopover(false)
    }
    const assignDescription = 'Duplicas la plantilla en el alumno; ajusta inicio, semanas y días aquí.'
    const assignBody = (
        <div className="space-y-3 py-3 sm:space-y-4 sm:py-4">
            <div className="space-y-2">
                <p className="text-sm font-medium text-body">
                    Programa:{' '}
                    <span className="font-semibold text-[var(--sport-600)]">{selectedProgram?.name}</span>
                </p>
            </div>
            <div className="space-y-3">
                <p className="text-sm font-medium text-body">Alumnos ({selectedClients.length})</p>
                <Popover open={openPopover} onOpenChange={setOpenPopover}>
                    <PopoverTrigger
                        className="flex h-auto min-h-11 w-full items-center justify-between rounded-control border-[1.5px] border-default bg-surface-card px-3 py-2 text-left text-sm text-strong focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                    >
                        <span className="truncate">
                            {selectedClients.length > 0
                                ? `${selectedClients.length} seleccionados`
                                : 'Seleccionar alumnos…'}
                        </span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                        align="start"
                    >
                        <div className="space-y-1 rounded-control border border-subtle bg-surface-card p-1 shadow-md">
                            <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
                                <Search className="size-4 shrink-0 opacity-50" />
                                <input
                                    className="h-8 w-full bg-transparent text-sm text-strong outline-none placeholder:text-muted"
                                    placeholder="Buscar alumno…"
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                />
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                {availableClients.filter((c) =>
                                    c.full_name.toLowerCase().includes(clientSearch.toLowerCase())
                                ).length === 0 ? (
                                    <div className="py-6 text-center text-sm text-muted">
                                        No se encontraron alumnos.
                                    </div>
                                ) : (
                                    availableClients
                                        .filter((c) =>
                                            c.full_name.toLowerCase().includes(clientSearch.toLowerCase())
                                        )
                                        .map((client) => (
                                            <div
                                                key={client.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => toggleClient(client.id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault()
                                                        toggleClient(client.id)
                                                    }
                                                }}
                                                className="relative flex cursor-pointer select-none items-center rounded-[10px] px-2 py-1.5 text-sm text-strong outline-none transition-colors hover:bg-surface-sunken"
                                            >
                                                <div
                                                    className={cn(
                                                        'mr-2 flex size-4 items-center justify-center rounded-[6px] border border-sport-500',
                                                        selectedClients.includes(client.id)
                                                            ? 'bg-sport-500 text-[var(--text-on-sport)]'
                                                            : 'opacity-50'
                                                    )}
                                                >
                                                    {selectedClients.includes(client.id) && (
                                                        <Check className="size-3" />
                                                    )}
                                                </div>
                                                {client.full_name}
                                                {client.workout_programs && client.workout_programs.length > 0 && (
                                                    <span className="ml-2 shrink-0 rounded-full border border-[var(--warning-500)]/30 bg-[var(--warning-100)] px-1.5 py-0.5 text-[10px] text-[var(--warning-700)]">
                                                        Plan: {client.workout_programs[0].name}
                                                    </span>
                                                )}
                                            </div>
                                        ))
                                )}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
            <div className="space-y-3 border-t border-subtle pt-3">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-strong">
                    <span>Configuración de asignación</span>
                    <InfoTooltip
                        title="Cómo funciona la asignación"
                        content="Ciclos, fases, tipo de duración y estructura del entrenamiento vienen siempre de la plantilla; no se editan aquí. Un alumno solo puede tener un programa activo: si ya tenía otro, se desactiva y se conserva el historial. Inicio: Hoy usa la fecha por defecto del servidor; Fecha específica fija el día y desactiva inicio flexible; Inicio flexible deja acomodar el calendario. Semanas: actualiza la ventana en semanas del plan asignado (no cambia las fases de la plantilla). Días Lun–Dom: filtran por día 1–7; sin marcar ninguno se copian todos los días. Si la plantilla usa días mayores que 7, edita en el builder o deja los días sin marcar."
                    />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Inicio
                        </label>
                        <Select
                            value={assignmentStartMode}
                            onValueChange={(v) =>
                                setAssignmentStartMode(v as 'today' | 'custom' | 'flexible')
                            }
                        >
                            <SelectTrigger className="h-11 min-h-11 w-full border-default bg-surface-card text-strong sm:h-10 sm:min-h-10">
                                <SelectValue>
                                    {assignmentStartMode === 'today'
                                        ? 'Hoy'
                                        : assignmentStartMode === 'custom'
                                          ? 'Fecha específica'
                                          : 'Flexible'}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="today">Hoy (fecha por defecto)</SelectItem>
                                <SelectItem value="custom">Fecha específica</SelectItem>
                                <SelectItem value="flexible">Inicio flexible</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Duración (semanas)
                        </label>
                        <Input
                            type="number"
                            min={1}
                            max={52}
                            value={assignmentDurationWeeks}
                            onChange={(e) => setAssignmentDurationWeeks(e.target.value)}
                            placeholder="Ej: 4"
                            className="h-11 min-h-11 border-default bg-surface-card text-strong placeholder:text-muted sm:h-10 sm:min-h-10"
                        />
                    </div>
                </div>
                {assignmentStartMode === 'custom' && (
                    <Input
                        type="date"
                        value={assignmentStartDate}
                        onChange={(e) => setAssignmentStartDate(e.target.value)}
                        className="h-11 min-h-11 border-default bg-surface-card text-strong sm:h-10 sm:min-h-10"
                    />
                )}
                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Días a copiar (opcional)
                        </p>
                        <InfoTooltip
                            title="Filtro por día"
                            content="Marca Lun–Dom para copiar solo esos entrenamientos (día 1–7). Si no marcas ninguno, se copian todos los días de la plantilla."
                        />
                    </div>
                    {assignDaysMismatch ? (
                        <p className="text-xs text-[var(--danger-600)]" role="alert">
                            Ningún día marcado coincide con esta plantilla. Desmarca todo para copiar todos
                            los días.
                        </p>
                    ) : null}
                    <div className="grid grid-cols-7 gap-1 pt-0.5">
                        {dayOptions.map((day) => {
                            const active = assignmentDays.includes(day.id)
                            return (
                                <button
                                    key={day.id}
                                    type="button"
                                    onClick={() =>
                                        setAssignmentDays((prev) =>
                                            active ? prev.filter((d) => d !== day.id) : [...prev, day.id]
                                        )
                                    }
                                    className={cn(
                                        'flex min-h-9 min-w-0 items-center justify-center rounded-control border-[1.5px] px-0.5 py-1.5 text-[10px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-app)] sm:min-h-9 sm:text-xs',
                                        active
                                            ? 'border-[var(--sport-300)] bg-[var(--sport-100)] text-[var(--sport-700)]'
                                            : 'border-subtle bg-surface-sunken text-muted hover:bg-surface-sunken hover:text-strong'
                                    )}
                                >
                                    {day.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
    const assignFooterButtons = (
        <>
            <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setIsAssignOpen(false)}
            >
                Cancelar
            </Button>
            <Button
                type="button"
                variant="sport"
                className="w-full sm:w-auto"
                onClick={() => handleAssign(false)}
                disabled={
                    isPending || selectedClients.length === 0 || assignDaysMismatch
                }
            >
                {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {selectedClients.length === 1
                    ? 'Asignar a 1 alumno'
                    : `Asignar a ${selectedClients.length} alumnos`}
            </Button>
        </>
    )

    return (
        <div
            className={cn(
                'min-w-0 max-w-full rounded-t-2xl pb-8',
                /* Móvil: sin -mx; padding simétrico + safe area (iPhone/Android) */
                'max-md:pl-[max(1rem,env(safe-area-inset-left,0px))] max-md:pr-[max(1rem,env(safe-area-inset-right,0px))]'
                /* Desktop: sin full-bleed propio — el shell (CoachMainWrapper) ya da la
                   columna centrada --dt-read-wide (1240) + --dt-page-x (32) = .dt-dash-inner. */
            )}
        >
            <AlertDialog open={showConfirmOverwrite} onOpenChange={setShowConfirmOverwrite}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Sobreescribir programas de entrenamiento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <span className="mt-2 block">Los siguientes alumnos ya tienen un programa activo:</span>
                            <span className="mt-2 block font-medium text-strong">
                                {clientsWithExistingPlans.map((c) => (
                                    <span key={c.id} className="ml-4 block">
                                        • {c.full_name} ({c.workout_programs?.[0]?.name})
                                    </span>
                                ))}
                            </span>
                            <span className="mt-4 block">
                                Si continúas, su programa actual se desactivará (el historial de entrenamientos se conserva) y se les asignará este nuevo programa.
                                ¿Deseas continuar?
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleAssign(true)}
                            className="bg-sport-500 text-[var(--text-on-sport)] hover:bg-[var(--sport-600)]"
                        >
                            Continuar y sobreescribir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!programToDelete} onOpenChange={(open) => !open && setProgramToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar programa</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará <span className="font-semibold text-strong">{programToDelete?.name}</span>.
                            No se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => programToDelete && handleDelete(programToDelete)}
                            className="bg-[var(--cta-danger)] text-white hover:bg-[color-mix(in_oklab,var(--cta-danger)_90%,#000)]"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ===== Móvil (eva-app · ProgramasHome) ===== */}
            <div className="md:hidden">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 pb-3">
                    <div className="min-w-0">
                        <h1 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.02em] text-strong">
                            Programas
                        </h1>
                        <p className="text-sm text-muted">Biblioteca</p>
                    </div>
                    <Button
                        type="button"
                        variant="sport"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        onClick={() => router.push('/coach/workout-programs/builder')}
                    >
                        <Plus className="size-4" />
                        Nueva
                    </Button>
                </div>

                {/* Navegación a catálogo / áreas */}
                <div className="mb-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() => router.push('/coach/exercises')}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-control border-[1.5px] border-subtle bg-surface-card px-3 py-2.5 text-[13px] font-bold text-strong"
                    >
                        <List className="size-4" /> Ejercicios
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push('/coach/settings/areas')}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-control border-[1.5px] border-subtle bg-surface-card px-3 py-2.5 text-[13px] font-bold text-strong"
                    >
                        <LayoutGrid className="size-4" /> Áreas
                    </button>
                </div>

                {/* Búsqueda + orden */}
                <div className="mb-3 flex gap-2">
                    <div className="relative flex flex-1 items-center">
                        <Search className="pointer-events-none absolute left-3 size-4 text-subtle" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar programa o alumno…"
                            className="h-[42px] w-full rounded-control border-[1.5px] border-default bg-surface-card px-9 text-sm text-strong outline-none placeholder:text-muted"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Limpiar búsqueda"
                                className="absolute right-2 flex size-6 items-center justify-center rounded-full bg-surface-sunken text-muted"
                            >
                                <X className="size-3" />
                            </button>
                        )}
                    </div>
                    <Popover open={sortOpen} onOpenChange={setSortOpen}>
                        <PopoverTrigger
                            aria-label="Ordenar"
                            className={cn(
                                'flex size-[42px] shrink-0 items-center justify-center rounded-control border-[1.5px]',
                                sort !== 'Recientes'
                                    ? 'border-[var(--sport-300)] bg-[var(--sport-100)] text-[var(--sport-600)]'
                                    : 'border-default bg-surface-card text-strong'
                            )}
                        >
                            <ArrowUpDown className="size-4" />
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1.5">
                            <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-extrabold uppercase tracking-wider text-subtle">
                                Ordenar por
                            </p>
                            {(['Recientes', 'Nombre'] as const).map((o) => (
                                <button
                                    key={o}
                                    type="button"
                                    onClick={() => {
                                        setSort(o)
                                        setSortOpen(false)
                                    }}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] font-semibold',
                                        sort === o ? 'bg-[var(--sport-100)] text-strong' : 'text-body'
                                    )}
                                >
                                    <span className="flex w-4 text-[var(--sport-600)]">
                                        {sort === o && <Check className="size-4" />}
                                    </span>
                                    {o}
                                </button>
                            ))}
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Tabs-stats accionables */}
                <div className="mb-3 flex gap-1 rounded-control bg-surface-sunken p-[3px]">
                    {(['all', 'templates', 'assigned'] as const).map((t) => {
                        const label = t === 'all' ? 'Todos' : t === 'templates' ? 'Plantillas' : 'En curso'
                        const on = filterType === t
                        return (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setFilterType(t)}
                                className={cn(
                                    'flex h-11 flex-1 flex-col items-center justify-center rounded-[calc(var(--radius-control)-3px)]',
                                    on ? 'bg-surface-card shadow-sm' : ''
                                )}
                            >
                                <span
                                    className={cn(
                                        'font-mono text-[17px] font-bold leading-none',
                                        on ? 'text-strong' : 'text-muted'
                                    )}
                                >
                                    {tabCounts[t]}
                                </span>
                                <span className={cn('text-[11px]', on ? 'font-bold text-strong' : 'font-semibold text-muted')}>
                                    {label}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Contador de resultados al filtrar */}
                {filtering && filtered.length > 0 && (
                    <div className="mb-2.5 flex items-center justify-between">
                        <span className="text-[12.5px] text-muted">
                            {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--sport-600)]"
                        >
                            <X className="size-3" /> Limpiar
                        </button>
                    </div>
                )}

                {/* Lista */}
                {filtered.length === 0 ? (
                    <LibraryEmptyState
                        hasPrograms={programs.length > 0}
                        filterType={filterType}
                        search={search}
                        onNewTemplate={() => router.push('/coach/workout-programs/builder')}
                    />
                ) : (
                    <motion.div
                        key={`m-${listMotionKey}`}
                        className="flex flex-col gap-2.5"
                        initial={reduceMotion ? false : { opacity: 0.6 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2 }}
                    >
                        {filtered.map((program) => (
                            <ProgramRow key={program.id} program={program} onOpen={() => openPreview(program)} />
                        ))}
                    </motion.div>
                )}
            </div>

            {/* ===== Desktop (eva-desktop · DesktopPrograms card-grid) ===== */}
            <div className="hidden md:block">
                {/* Header — .dt-dash-head / .dt-dash-date / .dt-dash-h1 / .dt-dash-actions */}
                <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="text-xs font-bold capitalize tracking-[0.03em] text-muted">
                            Biblioteca
                        </div>
                        <h1 className="mt-[3px] font-display text-[30px] font-black tracking-[-0.03em] text-strong">
                            Programas
                        </h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => router.push('/coach/exercises')}
                        >
                            <List className="size-[17px]" /> Ejercicios
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => router.push('/coach/settings/areas')}
                        >
                            <LayoutGrid className="size-[17px]" /> Áreas
                        </Button>
                        <Button
                            type="button"
                            variant="sport"
                            onClick={() => router.push('/coach/workout-programs/builder')}
                        >
                            <Plus className="size-[17px]" /> Nueva plantilla
                        </Button>
                    </div>
                </div>

                {/* Chips por vista (Todos / Plantillas / En curso) — .dt-chips / .dt-chip / .dt-chip-n */}
                <div className="mb-[18px] flex flex-wrap gap-2">
                    {(['all', 'templates', 'assigned'] as const).map((t) => {
                        const label = t === 'all' ? 'Todos' : t === 'templates' ? 'Plantillas' : 'En curso'
                        const on = filterType === t
                        return (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setFilterType(t)}
                                className={cn(
                                    'eva-press inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-3.5 font-ui text-[13px] font-bold transition-colors',
                                    on
                                        ? 'border-transparent bg-[var(--sport-500)] text-[var(--text-on-sport)]'
                                        : 'border-default bg-surface-card text-body hover:bg-surface-sunken'
                                )}
                            >
                                {label}
                                {t !== 'all' && (
                                    <span className="text-[11.5px] font-bold opacity-70">{tabCounts[t]}</span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Grid de tarjetas — .dt-prog-grid (auto-fill minmax 240px) */}
                {filtered.length === 0 ? (
                    <LibraryEmptyState
                        hasPrograms={programs.length > 0}
                        filterType={filterType}
                        search={search}
                        onNewTemplate={() => router.push('/coach/workout-programs/builder')}
                    />
                ) : (
                    <motion.div
                        key={`d-${listMotionKey}`}
                        className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
                        initial={reduceMotion ? false : { opacity: 0.6 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2 }}
                    >
                        {filtered.map((program) => (
                            <ProgramCard key={program.id} program={program} onOpen={() => openPreview(program)} />
                        ))}
                    </motion.div>
                )}
            </div>

            {isAssignDesktop ? (
                <Dialog open={isAssignOpen} onOpenChange={handleAssignOpenChange}>
                    <DialogContent className="max-h-[min(88dvh,88svh)] overflow-y-auto overscroll-contain border-subtle bg-surface-card px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-body sm:max-w-[440px]">
                        <DialogHeader>
                            <DialogTitle className="text-strong">Asignar programa</DialogTitle>
                            <DialogDescription className="text-muted">{assignDescription}</DialogDescription>
                        </DialogHeader>
                        {assignBody}
                        <DialogFooter className="gap-2">{assignFooterButtons}</DialogFooter>
                    </DialogContent>
                </Dialog>
            ) : (
                <Sheet open={isAssignOpen} onOpenChange={handleAssignOpenChange}>
                    <SheetContent
                        side="bottom"
                        showCloseButton={false}
                        className="max-h-[min(88dvh,88svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
                    >
                        <div className="flex max-h-[min(88dvh,88svh)] flex-col overflow-y-auto overscroll-contain px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                            <div
                                className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]"
                                aria-hidden="true"
                            />
                            <SheetHeader className="border-0 bg-transparent p-0">
                                <SheetTitle className="sr-only">Asignar programa</SheetTitle>
                                <SheetDescription className="sr-only">{assignDescription}</SheetDescription>
                            </SheetHeader>
                            <div>
                                <h2 className="font-display text-xl font-extrabold tracking-[-0.02em] text-strong">
                                    Asignar programa
                                </h2>
                                <p className="mt-0.5 text-sm text-muted">{assignDescription}</p>
                            </div>
                            {assignBody}
                            <div className="mt-1 flex flex-col-reverse gap-2">{assignFooterButtons}</div>
                        </div>
                    </SheetContent>
                </Sheet>
            )}


            <Dialog
                open={!!programToDuplicate}
                onOpenChange={(open) => {
                    if (!open) closeDuplicateDialog()
                }}
            >
                <DialogContent className="border-subtle bg-surface-card text-body sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>Duplicar programa</DialogTitle>
                        <DialogDescription>
                            El nuevo programa será una plantilla. El nombre debe ser único entre tus plantillas (2–100
                            caracteres).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-1">
                        <Label htmlFor="duplicate-program-name">Nombre de la copia</Label>
                        <Input
                            ref={duplicateNameInputRef}
                            id="duplicate-program-name"
                            value={duplicateNameInput}
                            onChange={(e) => setDuplicateNameInput(e.target.value)}
                            autoComplete="off"
                            disabled={isPending && actionProgramId === programToDuplicate?.id}
                            className="border-default bg-surface-card text-strong"
                            aria-invalid={duplicateTemplateNameTaken || duplicateNameTooShort || duplicateNameTooLong}
                        />
                        {duplicateNameTooShort ? (
                            <p role="alert" className="text-sm text-[var(--danger-600)]">
                                El nombre debe tener al menos 2 caracteres.
                            </p>
                        ) : null}
                        {duplicateNameTooLong ? (
                            <p role="alert" className="text-sm text-[var(--danger-600)]">
                                El nombre no puede superar 100 caracteres.
                            </p>
                        ) : null}
                        {duplicateTemplateNameTaken ? (
                            <p role="alert" className="text-sm text-[var(--danger-600)]">
                                Ya tienes una plantilla con este nombre. Elige otro.
                            </p>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={closeDuplicateDialog}
                            disabled={isPending && actionProgramId === programToDuplicate?.id}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="sport"
                            onClick={handleConfirmDuplicate}
                            disabled={
                                !canConfirmDuplicate ||
                                (isPending && actionProgramId === programToDuplicate?.id)
                            }
                        >
                            {isPending && actionProgramId === programToDuplicate?.id ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : null}
                            Duplicar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Sincronizar desde plantilla base?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se actualizará el programa con los cambios de su plantilla vinculada. Los bloques marcados
                            como override se respetan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (programToSync) handleSync(programToSync)
                            }}
                        >
                            Sincronizar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <ProgramPreviewPanel
                program={programToPreview}
                open={isPreviewOpen}
                onOpenChange={setIsPreviewOpen}
                areas={areas}
                onEdit={previewEdit}
                onAssign={previewAssign}
                onDuplicate={previewDuplicate}
                onSync={programToPreview?.source_template_id ? previewSync : undefined}
                onDelete={previewDelete}
            />
        </div>
    )
}
