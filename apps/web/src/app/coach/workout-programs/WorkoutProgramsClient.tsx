'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
    Check,
    ChevronsUpDown,
    Copy,
    Eye,
    GitMerge,
    Loader2,
    Pencil,
    Plus,
    Search,
    Trash2,
    Users,
    X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
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
} from '../builder/[clientId]/actions'
import { motion, useReducedMotion } from 'framer-motion'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { LibraryHeader } from './components/LibraryHeader'
import { LibraryHeroBackdrop } from './components/LibraryHeroBackdrop'
import { LibraryToolbar } from './components/LibraryToolbar'
import { ProgramRow } from './components/ProgramRow'
import { ProgramPreviewBody, ProgramPreviewPanel } from './components/ProgramPreviewPanel'
import {
    formatShortActivityDate,
    getProgramStats,
    type LibraryFilters,
    type ProgramListModel,
    matchesProgramFilters,
} from './libraryStats'
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
}

const libraryEmptyCardClass =
    'rounded-xl border border-border/60 bg-card px-4 py-14 text-center text-card-foreground shadow-sm'

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
                <p className="text-sm font-medium text-foreground">Sin resultados para tu búsqueda</p>
                <p className="mt-1 text-xs text-muted-foreground">Prueba con otro término o revisa los filtros.</p>
            </div>
        )
    }
    if (hasPrograms && filterType === 'templates') {
        return (
            <div className={libraryEmptyCardClass}>
                <p className="text-sm font-medium text-foreground">No hay plantillas con estos criterios</p>
                <p className="mt-1 text-xs text-muted-foreground">Crea una plantilla nueva o cambia el filtro.</p>
            </div>
        )
    }
    if (hasPrograms && filterType === 'assigned') {
        return (
            <div className={libraryEmptyCardClass}>
                <p className="text-sm font-medium text-foreground">No hay programas en curso</p>
                <p className="mt-1 text-xs text-muted-foreground">Asigna una plantilla a un alumno para verla aquí.</p>
            </div>
        )
    }
    if (hasPrograms) {
        return (
            <div className={libraryEmptyCardClass}>
                <p className="text-sm font-medium text-foreground">Nada que mostrar con estos filtros</p>
                <p className="mt-1 text-xs text-muted-foreground">Ajusta filtros o la búsqueda.</p>
            </div>
        )
    }
    return (
        <div className={libraryEmptyCardClass}>
            <p className="text-sm font-medium text-foreground">Aún no tienes programas</p>
            <p className="mt-1 text-xs text-muted-foreground">Crea tu primera plantilla para empezar.</p>
            <Button type="button" className="mt-4 h-11 w-full gap-2 rounded-xl shadow-sm sm:h-10 sm:w-auto sm:rounded-lg" onClick={onNewTemplate}>
                <Plus className="size-4" />
                Nueva plantilla
            </Button>
        </div>
    )
}

function DesktopEmptyPanel() {
    return (
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center text-card-foreground shadow-sm">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
                <Eye className="size-5 opacity-60" />
            </div>
            <p className="text-sm font-medium text-foreground">Vista de detalles</p>
            <p className="mt-1 text-xs text-muted-foreground">
                Selecciona un programa de la lista para ver su contenido aquí.
            </p>
        </div>
    )
}

interface DesktopDetailPanelProps {
    program: ProgramListModel
    onClose: () => void
    isPending: boolean
    isActionPending: boolean
    onAssign: () => void
    onDuplicate: () => void
    onSync?: () => void
    onDelete: () => void
    onEdit: () => void
}

function DesktopDetailPanel({
    program,
    onClose,
    isPending,
    isActionPending,
    onAssign,
    onDuplicate,
    onSync,
    onDelete,
    onEdit,
}: DesktopDetailPanelProps) {
    const stats = getProgramStats(program)
    const isTemplate = !program.client_id

    const meta = [
        `${stats.daysWithWork} días`,
        `${stats.blockCount} bloques`,
        stats.cycleLabel,
        stats.weeksLabel,
        `Act. ${formatShortActivityDate(stats.lastActivityIso)}`,
    ]
        .filter(Boolean)
        .join(' · ')

    return (
        <div className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-border/60 bg-muted/25 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="min-w-0 truncate font-semibold text-foreground">{program.name}</span>
                        {isTemplate ? (
                            <Badge
                                variant="outline"
                                className="shrink-0 border-primary/25 bg-primary/5 text-[10px] font-semibold text-primary"
                            >
                                Plantilla
                            </Badge>
                        ) : (
                            <Badge
                                variant="outline"
                                className={cn(
                                    'shrink-0 text-[10px] font-semibold',
                                    program.is_active
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                                        : 'border-border text-muted-foreground'
                                )}
                            >
                                {stats.templateLabel}
                            </Badge>
                        )}
                    </div>
                    {!isTemplate && program.client?.full_name && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{program.client.full_name}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mr-1 -mt-1 size-8 shrink-0 text-muted-foreground"
                    onClick={onClose}
                >
                    <X className="size-4" />
                </Button>
            </div>

            {/* Body */}
            <ProgramPreviewBody program={program} />

            {/* Footer actions */}
            <div className="flex flex-wrap gap-2 border-t border-border/60 bg-muted/10 px-4 py-3">
                <Button type="button" size="sm" onClick={onEdit} className="gap-1.5">
                    <Pencil className="size-3.5" />
                    Editar
                </Button>
                {isTemplate && (
                    <Button type="button" size="sm" variant="outline" onClick={onAssign} className="gap-1.5">
                        <Users className="size-3.5" />
                        Asignar
                    </Button>
                )}
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onDuplicate}
                    disabled={isPending && isActionPending}
                    className="gap-1.5"
                >
                    <Copy className="size-3.5" />
                    Duplicar
                </Button>
                {onSync && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onSync}
                        disabled={isPending && isActionPending}
                        className="gap-1.5"
                    >
                        <GitMerge className="size-3.5" />
                        Sincronizar
                    </Button>
                )}
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onDelete}
                    className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                    <Trash2 className="size-3.5" />
                    Eliminar
                </Button>
            </div>
        </div>
    )
}

export function WorkoutProgramsClient({
    initialPrograms,
    availableClients,
}: WorkoutProgramsClientProps) {
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const [search, setSearch] = useState('')
    const [viewMode, setViewMode] = useState<'comfortable' | 'compact'>('comfortable')
    const [filterType, setFilterType] = useState<LibraryFilters['filterType']>('all')
    const [filterStatus, setFilterStatus] = useState<LibraryFilters['filterStatus']>('all')
    const [filterStructure, setFilterStructure] = useState<LibraryFilters['filterStructure']>('all')
    const [filterHasPhases, setFilterHasPhases] = useState<LibraryFilters['filterHasPhases']>('all')
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

    // Desktop detail panel state
    const [selectedPanelProgram, setSelectedPanelProgram] = useState<ProgramListModel | null>(null)

    // Keep panel in sync when programs list refreshes
    useEffect(() => {
        setSelectedPanelProgram((prev) =>
            prev ? (programs.find((p) => p.id === prev.id) ?? null) : null
        )
    }, [programs])

    const filterState = useMemo(
        () => ({
            search,
            filterType,
            filterStatus,
            filterStructure,
            filterHasPhases,
        }),
        [search, filterType, filterStatus, filterStructure, filterHasPhases]
    )

    const filtered = useMemo(
        () => programs.filter((p) => matchesProgramFilters(p, filterState)),
        [programs, filterState]
    )

    const templateCount = useMemo(() => programs.filter((p) => !p.client_id).length, [programs])
    const activeAssignedCount = useMemo(
        () => programs.filter((p) => !!p.client_id && p.is_active).length,
        [programs]
    )

    const listMotionKey = `${search}|${filterType}|${filterStatus}|${filterStructure}|${filterHasPhases}`

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
                setSelectedPanelProgram((prev) => (prev?.id === program.id ? null : prev))
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

    return (
        <div
            className={cn(
                'min-w-0 max-w-full rounded-t-2xl pb-8',
                /* Móvil: sin -mx; padding simétrico + safe area (iPhone/Android) */
                'max-md:pl-[max(1rem,env(safe-area-inset-left,0px))] max-md:pr-[max(1rem,env(safe-area-inset-right,0px))]',
                'md:-mx-8 md:px-8'
            )}
        >
            <AlertDialog open={showConfirmOverwrite} onOpenChange={setShowConfirmOverwrite}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Sobreescribir programas de entrenamiento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <span className="mt-2 block">Los siguientes alumnos ya tienen un programa activo:</span>
                            <span className="mt-2 block font-medium text-foreground">
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
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
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
                            Esta acción eliminará <span className="font-semibold text-foreground">{programToDelete?.name}</span>.
                            No se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => programToDelete && handleDelete(programToDelete)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Hero: backdrop + header + toolbar */}
            <div className="w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-border/40 bg-background/90 shadow-[0_8px_28px_-14px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-white/10 dark:bg-background/85 dark:shadow-[0_8px_32px_-16px_rgba(0,0,0,0.5)]">
                <LibraryHeroBackdrop />
                <div className="relative z-10 space-y-4 px-3 pb-4 pt-3 sm:px-5">
                    <LibraryHeader
                        templateCount={templateCount}
                        activeAssignedCount={activeAssignedCount}
                        totalCount={programs.length}
                        onNewTemplate={() => router.push('/coach/workout-programs/builder')}
                    />
                    <LibraryToolbar
                        search={search}
                        onSearchChange={setSearch}
                        filterType={filterType}
                        onFilterTypeChange={setFilterType}
                        filterStatus={filterStatus}
                        onFilterStatusChange={setFilterStatus}
                        filterStructure={filterStructure}
                        onFilterStructureChange={setFilterStructure}
                        filterHasPhases={filterHasPhases}
                        onFilterHasPhasesChange={setFilterHasPhases}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                    />
                </div>
            </div>

            {/* Two-column layout on desktop */}
            <div className="mt-4 lg:flex lg:items-start lg:gap-6">
                {/* Left: program list — same max width as hero on mobile/tablet */}
                <div className="min-w-0 w-full max-w-full flex-1 space-y-4">
                    {filtered.length === 0 ? (
                        <LibraryEmptyState
                            hasPrograms={programs.length > 0}
                            filterType={filterType}
                            search={search}
                            onNewTemplate={() => router.push('/coach/workout-programs/builder')}
                        />
                    ) : (
                        <motion.div
                            key={listMotionKey}
                            className="flex flex-col gap-3"
                            initial={reduceMotion ? false : { opacity: 0.6 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: reduceMotion ? 0 : 0.2 }}
                        >
                            {filtered.map((program, index) => (
                                <motion.div
                                    key={program.id}
                                    className="min-w-0"
                                    initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                        duration: reduceMotion ? 0 : 0.18,
                                        delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.35),
                                    }}
                                >
                                    <ProgramRow
                                        program={program}
                                        compact={viewMode === 'compact'}
                                        isPending={isPending}
                                        isActionPending={actionProgramId === program.id}
                                        isSelected={selectedPanelProgram?.id === program.id}
                                        onRowClick={() =>
                                            setSelectedPanelProgram((prev) =>
                                                prev?.id === program.id ? null : program
                                            )
                                        }
                                        onAssign={() => {
                                            setSelectedProgram(program)
                                            setIsAssignOpen(true)
                                        }}
                                        onPreview={() => {
                                            setProgramToPreview(program)
                                            setIsPreviewOpen(true)
                                        }}
                                        onDuplicate={() => openDuplicateDialog(program)}
                                        onSync={
                                            program.source_template_id
                                                ? () => {
                                                      setProgramToSync(program)
                                                      setShowSyncDialog(true)
                                                  }
                                                : undefined
                                        }
                                        onDelete={() => setProgramToDelete(program)}
                                    />
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </div>

                {/* Right: desktop detail panel */}
                <aside className="hidden lg:block w-[360px] xl:w-[400px] shrink-0">
                    {selectedPanelProgram ? (
                        <DesktopDetailPanel
                            program={selectedPanelProgram}
                            onClose={() => setSelectedPanelProgram(null)}
                            isPending={isPending}
                            isActionPending={actionProgramId === selectedPanelProgram.id}
                            onAssign={() => {
                                setSelectedProgram(selectedPanelProgram)
                                setIsAssignOpen(true)
                            }}
                            onDuplicate={() => openDuplicateDialog(selectedPanelProgram)}
                            onSync={
                                selectedPanelProgram.source_template_id
                                    ? () => {
                                          setProgramToSync(selectedPanelProgram)
                                          setShowSyncDialog(true)
                                      }
                                    : undefined
                            }
                            onDelete={() => {
                                setSelectedPanelProgram(null)
                                setProgramToDelete(selectedPanelProgram)
                            }}
                            onEdit={() => {
                                const isTemplate = !selectedPanelProgram.client_id
                                const editHref = isTemplate
                                    ? `/coach/workout-programs/builder?programId=${selectedPanelProgram.id}`
                                    : `/coach/builder/${selectedPanelProgram.client_id}?programId=${selectedPanelProgram.id}`
                                router.push(editHref)
                            }}
                        />
                    ) : (
                        <DesktopEmptyPanel />
                    )}
                </aside>
            </div>

            <Dialog
                open={isAssignOpen}
                onOpenChange={(open) => {
                    setIsAssignOpen(open)
                    if (!open) setOpenPopover(false)
                }}
            >
                <DialogContent className="max-h-[min(88dvh,88svh)] overflow-y-auto overscroll-contain border-border bg-card px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-card-foreground sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Asignar programa</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Duplicas la plantilla en el alumno; ajusta inicio, semanas y días aquí.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-3 sm:space-y-4 sm:py-4">
                        <div className="space-y-2">
                            <p className="text-sm font-medium">
                                Programa:{' '}
                                <span className="font-semibold text-primary">{selectedProgram?.name}</span>
                            </p>
                        </div>
                        <div className="space-y-3">
                            <p className="text-sm font-medium">Alumnos ({selectedClients.length})</p>
                            <Popover open={openPopover} onOpenChange={setOpenPopover}>
                                <PopoverTrigger
                                    className="flex h-auto min-h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                >
                                    <span className="truncate">
                                        {selectedClients.length > 0
                                            ? `${selectedClients.length} seleccionados`
                                            : 'Seleccionar alumnos…'}
                                    </span>
                                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-[var(--radix-popover-trigger-width)] border-border bg-popover p-0 text-popover-foreground"
                                    align="start"
                                >
                                    <div className="space-y-1 rounded-lg border border-border bg-popover p-1 shadow-md">
                                        <div className="flex items-center gap-2 border-b px-3 py-2">
                                            <Search className="size-4 shrink-0 opacity-50" />
                                            <input
                                                className="h-8 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                                                placeholder="Buscar alumno…"
                                                value={clientSearch}
                                                onChange={(e) => setClientSearch(e.target.value)}
                                            />
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto">
                                            {availableClients.filter((c) =>
                                                c.full_name.toLowerCase().includes(clientSearch.toLowerCase())
                                            ).length === 0 ? (
                                                <div className="py-6 text-center text-sm text-muted-foreground">
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
                                                            className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                                                        >
                                                            <div
                                                                className={cn(
                                                                    'mr-2 flex size-4 items-center justify-center rounded-sm border border-primary',
                                                                    selectedClients.includes(client.id)
                                                                        ? 'bg-primary text-primary-foreground'
                                                                        : 'opacity-50'
                                                                )}
                                                            >
                                                                {selectedClients.includes(client.id) && (
                                                                    <Check className="size-3" />
                                                                )}
                                                            </div>
                                                            {client.full_name}
                                                            {client.workout_programs && client.workout_programs.length > 0 && (
                                                                <span className="ml-2 shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
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
                        <div className="space-y-3 border-t border-border pt-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                <span>Configuración de asignación</span>
                                <InfoTooltip
                                    title="Cómo funciona la asignación"
                                    content="Ciclos, fases, tipo de duración y estructura del entrenamiento vienen siempre de la plantilla; no se editan aquí. Un alumno solo puede tener un programa activo: si ya tenía otro, se desactiva y se conserva el historial. Inicio: Hoy usa la fecha por defecto del servidor; Fecha específica fija el día y desactiva inicio flexible; Inicio flexible deja acomodar el calendario. Semanas: actualiza la ventana en semanas del plan asignado (no cambia las fases de la plantilla). Días Lun–Dom: filtran por día 1–7; sin marcar ninguno se copian todos los días. Si la plantilla usa días mayores que 7, edita en el builder o deja los días sin marcar."
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Inicio
                                    </label>
                                    <Select
                                        value={assignmentStartMode}
                                        onValueChange={(v) =>
                                            setAssignmentStartMode(v as 'today' | 'custom' | 'flexible')
                                        }
                                    >
                                        <SelectTrigger className="h-11 min-h-11 w-full border-input bg-background text-foreground sm:h-10 sm:min-h-10">
                                            <SelectValue>
                                                {assignmentStartMode === 'today'
                                                    ? 'Hoy'
                                                    : assignmentStartMode === 'custom'
                                                      ? 'Fecha específica'
                                                      : 'Flexible'}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent className="border-border bg-popover text-popover-foreground">
                                            <SelectItem value="today">Hoy (fecha por defecto)</SelectItem>
                                            <SelectItem value="custom">Fecha específica</SelectItem>
                                            <SelectItem value="flexible">Inicio flexible</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Duración (semanas)
                                    </label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={52}
                                        value={assignmentDurationWeeks}
                                        onChange={(e) => setAssignmentDurationWeeks(e.target.value)}
                                        placeholder="Ej: 4"
                                        className="h-11 min-h-11 border-input bg-background text-foreground placeholder:text-muted-foreground sm:h-10 sm:min-h-10"
                                    />
                                </div>
                            </div>
                            {assignmentStartMode === 'custom' && (
                                <Input
                                    type="date"
                                    value={assignmentStartDate}
                                    onChange={(e) => setAssignmentStartDate(e.target.value)}
                                    className="h-11 min-h-11 border-input bg-background text-foreground sm:h-10 sm:min-h-10"
                                />
                            )}
                            <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Días a copiar (opcional)
                                    </p>
                                    <InfoTooltip
                                        title="Filtro por día"
                                        content="Marca Lun–Dom para copiar solo esos entrenamientos (día 1–7). Si no marcas ninguno, se copian todos los días de la plantilla."
                                    />
                                </div>
                                {assignDaysMismatch ? (
                                    <p className="text-xs text-destructive" role="alert">
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
                                                    'flex min-h-9 min-w-0 items-center justify-center rounded-lg border px-0.5 py-1.5 text-[10px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-h-9 sm:text-xs',
                                                    active
                                                        ? 'border-primary/40 bg-primary/15 text-primary'
                                                        : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
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
                    <DialogFooter className="gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full border-border sm:w-auto"
                            onClick={() => setIsAssignOpen(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
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
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={!!programToDuplicate}
                onOpenChange={(open) => {
                    if (!open) closeDuplicateDialog()
                }}
            >
                <DialogContent className="border-border bg-card text-card-foreground sm:max-w-[440px]">
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
                            className="border-input bg-background text-foreground"
                            aria-invalid={duplicateTemplateNameTaken || duplicateNameTooShort || duplicateNameTooLong}
                        />
                        {duplicateNameTooShort ? (
                            <p role="alert" className="text-sm text-destructive">
                                El nombre debe tener al menos 2 caracteres.
                            </p>
                        ) : null}
                        {duplicateNameTooLong ? (
                            <p role="alert" className="text-sm text-destructive">
                                El nombre no puede superar 100 caracteres.
                            </p>
                        ) : null}
                        {duplicateTemplateNameTaken ? (
                            <p role="alert" className="text-sm text-destructive">
                                Ya tienes una plantilla con este nombre. Elige otro.
                            </p>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={closeDuplicateDialog}
                            disabled={isPending && actionProgramId === programToDuplicate?.id}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
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

            <ProgramPreviewPanel program={programToPreview} open={isPreviewOpen} onOpenChange={setIsPreviewOpen} />
        </div>
    )
}
