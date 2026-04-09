'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
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
            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-14 text-center">
                <p className="text-sm font-medium text-foreground">Sin resultados para tu búsqueda</p>
                <p className="mt-1 text-xs text-muted-foreground">Prueba con otro término o revisa los filtros.</p>
            </div>
        )
    }
    if (hasPrograms && filterType === 'templates') {
        return (
            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-14 text-center">
                <p className="text-sm font-medium text-foreground">No hay plantillas con estos criterios</p>
                <p className="mt-1 text-xs text-muted-foreground">Crea una plantilla nueva o cambia el filtro.</p>
            </div>
        )
    }
    if (hasPrograms && filterType === 'assigned') {
        return (
            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-14 text-center">
                <p className="text-sm font-medium text-foreground">No hay programas en curso</p>
                <p className="mt-1 text-xs text-muted-foreground">Asigna una plantilla a un alumno para verla aquí.</p>
            </div>
        )
    }
    if (hasPrograms) {
        return (
            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-14 text-center">
                <p className="text-sm font-medium text-foreground">Nada que mostrar con estos filtros</p>
                <p className="mt-1 text-xs text-muted-foreground">Ajusta filtros o la búsqueda.</p>
            </div>
        )
    }
    return (
        <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-14 text-center">
            <p className="text-sm font-medium text-foreground">Aún no tienes programas</p>
            <p className="mt-1 text-xs text-muted-foreground">Crea tu primera plantilla para empezar.</p>
            <Button type="button" className="mt-4 gap-2" onClick={onNewTemplate}>
                <Plus className="size-4" />
                Nueva plantilla
            </Button>
        </div>
    )
}

function DesktopEmptyPanel() {
    return (
        <div className="rounded-2xl border border-dashed border-border/40 bg-muted/5 p-8 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted/30 text-muted-foreground">
                <Eye className="size-5 opacity-50" />
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
        <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/50 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
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

export function WorkoutProgramsClient({ initialPrograms, availableClients }: WorkoutProgramsClientProps) {
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

    const handleAssign = (force = false) => {
        if (!selectedProgram || selectedClients.length === 0) {
            toast.error('Selecciona al menos un alumno')
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
            const result = await assignProgramToClientsAction(selectedProgram.id, selectedClients, {
                startDate: assignmentStartMode === 'custom' ? assignmentStartDate : undefined,
                durationWeeks: Math.max(1, Number(assignmentDurationWeeks) || 4),
                selectedDays: assignmentDays.length ? assignmentDays : undefined,
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

    const handleDuplicate = (program: ProgramListModel) => {
        setActionProgramId(program.id)
        startTransition(async () => {
            const result = await duplicateWorkoutProgramAction(program.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Programa duplicado correctamente')
                if (result.program) {
                    setPrograms((prev) => [result.program!, ...prev])
                } else {
                    router.refresh()
                }
            }
            setActionProgramId(null)
        })
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
        <div className="pb-8">
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

            {/* Sticky header — full width */}
            <div className="sticky top-0 z-20 -mx-1 space-y-4 bg-transparent px-1 pb-4 pt-3 backdrop-blur-sm">
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

            {/* Two-column layout on desktop */}
            <div className="mt-4 lg:flex lg:items-start lg:gap-6">
                {/* Left: program list */}
                <div className="min-w-0 flex-1 space-y-4">
                    {filtered.length === 0 ? (
                        <LibraryEmptyState
                            hasPrograms={programs.length > 0}
                            filterType={filterType}
                            search={search}
                            onNewTemplate={() => router.push('/coach/workout-programs/builder')}
                        />
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/30 shadow-sm">
                            <motion.div
                                key={listMotionKey}
                                className="divide-y divide-border/50"
                                initial={reduceMotion ? false : { opacity: 0.6 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                            >
                                {filtered.map((program, index) => (
                                    <motion.div
                                        key={program.id}
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
                                            onDuplicate={() => handleDuplicate(program)}
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
                        </div>
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
                            onDuplicate={() => handleDuplicate(selectedPanelProgram)}
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

            <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                <DialogContent className="border-border bg-card text-card-foreground sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Asignar programa</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
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
                        <div className="space-y-2 border-t pt-3">
                            <p className="flex items-center gap-2 text-sm font-medium">
                                Configuración de asignación
                                <InfoTooltip content="Cada alumno puede tener solo 1 programa activo. Si ya tiene uno, se desactivará automáticamente (el historial de sesiones se conserva). Inicio: cuándo arranca el programa. Duración: semanas activas. Días: si seleccionas días específicos, solo esos días del template se copian al alumno." />
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                                        <SelectTrigger className="border-input bg-background text-foreground">
                                            <SelectValue>
                                                {assignmentStartMode === 'today'
                                                    ? 'Hoy'
                                                    : assignmentStartMode === 'custom'
                                                      ? 'Fecha específica'
                                                      : 'Flexible'}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="today">Hoy</SelectItem>
                                            <SelectItem value="custom">Fecha específica</SelectItem>
                                            <SelectItem value="flexible">Flexible</SelectItem>
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
                                        className="border-input bg-background text-foreground placeholder:text-muted-foreground"
                                    />
                                </div>
                            </div>
                            {assignmentStartMode === 'custom' && (
                                <Input
                                    type="date"
                                    value={assignmentStartDate}
                                    onChange={(e) => setAssignmentStartDate(e.target.value)}
                                    className="border-input bg-background text-foreground"
                                />
                            )}
                            <div className="flex flex-wrap justify-center gap-1 pt-1">
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
                                                'rounded-md border px-2 py-1 text-[10px] font-bold',
                                                active
                                                    ? 'border-primary/30 bg-primary/10 text-primary'
                                                    : 'border-border bg-muted/20 text-muted-foreground'
                                            )}
                                        >
                                            {day.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAssignOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={() => handleAssign(false)} disabled={isPending || selectedClients.length === 0}>
                            {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                            Asignar a {selectedClients.length} alumnos
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
