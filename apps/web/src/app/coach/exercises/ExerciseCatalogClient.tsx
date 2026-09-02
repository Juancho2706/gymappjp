'use client'

import { useState, useMemo, useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from '@/components/ui/dialog'
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
import { Dumbbell, Globe, User, ExternalLink, Play, Plus, Zap, Target, Wrench, Search, Filter, X, Copy, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import type { Tables } from '@/lib/database.types'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { filterExercises, cn } from '@/lib/utils'
import { toast } from 'sonner'
import { extractYoutubeVideoId, exerciseThumbnailUrl } from '@/lib/youtube'
import { ExerciseVideo } from '@/components/exercise/ExerciseVideo'
import { motion, AnimatePresence } from 'framer-motion'
import { ExerciseCreateButton } from './_components/ExerciseCreateButton'
import { ExerciseFormModal } from './_components/ExerciseFormModal'
import {
    cloneExerciseAction,
    restoreExerciseAction,
    softDeleteExerciseAction,
} from './_actions/exercises.actions'

type Exercise = Tables<'exercises'>

/** Ventana del «Deshacer» del borrado — la misma que el resto de acciones destructivas de la app. */
const UNDO_TOAST_MS = 8000

interface ExerciseCatalogClientProps {
    globalExercises: Exercise[]
    customExercises: Exercise[]
    byMuscle: Record<string, Exercise[]>
    canCreateExercises?: boolean
    /**
     * id → bloques de programa que lo usan (solo ejercicios propios). Es informativo: avisa antes
     * de eliminar que lo ya armado se conserva. Ver `getExerciseCatalog`.
     */
    usageByExercise?: Record<string, number>
    /**
     * Etiqueta de autoría de las filas propias: en un workspace team el catálogo editable es el
     * del POOL, no «mío» — decirle «Propio» ahí sería mentir sobre a quién pertenece.
     */
    ownLabel?: 'Propio' | 'Del equipo'
}

export function ExerciseCatalogClient({
    globalExercises,
    customExercises,
    byMuscle,
    canCreateExercises = false,
    usageByExercise = {},
    ownLabel = 'Propio',
}: ExerciseCatalogClientProps) {
    // Deep-link ?q= desde la búsqueda global del topbar: pre-carga el filtro del catálogo.
    const searchParams = useSearchParams()
    const router = useRouter()
    const [selected, setSelected] = useState<Exercise | null>(null)
    // Término congelado al abrir el CTA «Crear "…"» del empty state (null = modal cerrado).
    const [createName, setCreateName] = useState<string | null>(null)
    // Ejercicio propio abierto en el formulario de EDICIÓN (null = cerrado).
    const [editTarget, setEditTarget] = useState<Exercise | null>(null)
    // Ejercicio en el diálogo de confirmación de borrado (null = cerrado).
    const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null)
    const [isPending, startTransition] = useTransition()
    const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
    const [muscleFilter, setMuscleFilter] = useState<string>('Todos')
    const [customOnly, setCustomOnly] = useState(false)
    const [withVideoOnly, setWithVideoOnly] = useState(false)
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

    const toggleGroup = (muscle: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [muscle]: !prev[muscle]
        }))
    }

    /**
     * Deep-link `?create=1` — lo manda el CTA «Nueva → Ejercicio personalizado» de la biblioteca de
     * programas. Abre el MISMO modal de creación que el header (nombre vacío) y limpia el parámetro
     * de la URL para que un refresh o el botón atrás no lo reabran. `consumed` lo hace una sola vez.
     */
    const createParamConsumed = useRef(false)
    useEffect(() => {
        if (createParamConsumed.current) return
        if (searchParams.get('create') !== '1') return
        createParamConsumed.current = true

        const rest = new URLSearchParams(searchParams.toString())
        rest.delete('create')
        const qs = rest.toString()
        router.replace(qs ? `/coach/exercises?${qs}` : '/coach/exercises')

        if (!canCreateExercises) {
            toast.error('Tu rol no permite crear ejercicios')
            return
        }
        setCreateName('')
    }, [searchParams, router, canCreateExercises])

    const allExercises = useMemo(() => [...globalExercises, ...customExercises], [globalExercises, customExercises])

    /**
     * Autoría por id. El grid mezcla catálogo global y propios en la misma lista de chips y cada
     * chip necesita saber si la fila es gestionable: un Set evita recorrer `customExercises`
     * cientos de veces por render.
     */
    const customIds = useMemo(() => new Set(customExercises.map(e => e.id)), [customExercises])

    const trimmedSearch = search.trim()

    const filteredExercises = useMemo(() => {
        const base = customOnly ? customExercises : allExercises
        let result = filterExercises(base, search, muscleFilter)
        if (withVideoOnly) {
            // "Con video" = video de YouTube (player real). OJO: ~800 del catálogo global tienen un
            // GIF de ExerciseDB guardado en video_url (no es un "video"), por eso NO filtramos por
            // "tiene video_url" (incluiría casi todos) sino por ID de YouTube válido.
            result = result.filter(ex => !!ex.video_url && extractYoutubeVideoId(ex.video_url) != null)
        }
        return result
    }, [allExercises, customExercises, search, muscleFilter, customOnly, withVideoOnly])

    const groupedByMuscle = useMemo(() => {
        const groups: Record<string, Exercise[]> = {}

        // Use the master list to define order and ensure important groups appear
        MUSCLE_GROUPS.forEach(m => {
            groups[m] = []
        })

        filteredExercises.forEach(ex => {
            const muscle = ex.muscle_group || 'Otro'
            if (!groups[muscle]) groups[muscle] = []
            groups[muscle].push(ex)
        })

        // Remove empty groups unless it's a filtered view
        if (search || muscleFilter !== 'Todos') {
            return Object.fromEntries(Object.entries(groups).filter(([_, list]) => list.length > 0))
        }

        return Object.fromEntries(Object.entries(groups).filter(([_, list]) => list.length > 0))
    }, [filteredExercises, search, muscleFilter])

    /**
     * Editar: el preview y el formulario son dos modales distintos. Se cierra el primero ANTES de
     * abrir el segundo para no encimar dos trampas de foco (mismo criterio que el sheet de RN).
     */
    const handleEdit = (ex: Exercise) => {
        setSelected(null)
        setEditTarget(ex)
    }

    /**
     * Eliminar: el borrado es SOFT (`deleted_at`), así que en vez de un segundo «¿estás seguro?»
     * el flujo ofrece red de seguridad — confirmación corta + «Deshacer» en el toast.
     */
    const handleConfirmDelete = () => {
        const target = deleteTarget
        if (!target) return
        startTransition(async () => {
            const res = await softDeleteExerciseAction(target.id)
            if (res.error) {
                toast.error(res.error)
                return
            }
            setDeleteTarget(null)
            setSelected(null)
            // El catálogo llega por props del servidor: sin refresh el ejercicio seguiría en el grid.
            router.refresh()
            toast.success('Ejercicio eliminado', {
                duration: UNDO_TOAST_MS,
                action: {
                    label: 'Deshacer',
                    onClick: () => {
                        void restoreExerciseAction(target.id).then(r => {
                            if (r.error) {
                                toast.error(r.error)
                                return
                            }
                            toast.success('Ejercicio restaurado')
                            router.refresh()
                        })
                    },
                },
            })
        })
    }

    /**
     * Duplicar: `cloneExerciseAction` recibe un FormData plano con `id` + los campos a copiar
     * (contrato = CloneExerciseSchema). Las listas viajan como JSON — la action hace JSON.parse
     * con fallback a split, y mandar JSON evita que un paso con coma se parta en dos.
     *
     * La media NO se manda: la action la copia desde la fila origen leída en DB. Mandar el
     * `video_url` del catálogo global solo puede hacer daño (varias filas guardan ahí un GIF de
     * ExerciseDB que no pasa el `.url()` del schema y haría fallar un duplicado perfectamente sano).
     */
    const handleClone = (ex: Exercise) => {
        startTransition(async () => {
            const fd = new FormData()
            fd.set('id', ex.id)
            fd.set('name', ex.name)
            fd.set('muscle_group', ex.muscle_group)
            if (ex.equipment) fd.set('equipment', ex.equipment)
            if (ex.difficulty) fd.set('difficulty', ex.difficulty)
            if (ex.gender_focus) fd.set('gender_focus', ex.gender_focus)
            if (ex.instructions?.length) fd.set('instructions', JSON.stringify(ex.instructions))
            if (ex.secondary_muscles?.length) fd.set('secondary_muscles', JSON.stringify(ex.secondary_muscles))

            const res = await cloneExerciseAction(fd)
            if (res.error) {
                toast.error(res.error)
                return
            }
            setSelected(null)
            router.refresh()
            toast.success('Ejercicio duplicado. Se copió a tus ejercicios.')
        })
    }

    const selectedIsOwn = selected ? customIds.has(selected.id) : false

    // Copys del diálogo de borrado. El soft delete solo ESCONDE la fila: lo que ya la usa sigue
    // apuntando a ella, y el número real (cuando lo tenemos) es lo que le baja la ansiedad al coach.
    const deleteUsage = deleteTarget ? (usageByExercise[deleteTarget.id] ?? 0) : 0
    const deleteScopeText = ownLabel === 'Del equipo'
        ? 'Se oculta del catálogo del equipo y del builder.'
        : 'Se oculta de tu catálogo y del builder.'
    const deleteUsageText = deleteUsage > 1
        ? `Los ${deleteUsage} bloques que ya lo usan lo conservan tal cual.`
        : deleteUsage === 1
            ? 'El bloque que ya lo usa lo conserva tal cual.'
            : 'Los programas que ya lo usan lo conservan tal cual.'

    return (
        <div className="space-y-6">
            {/* Filters Section */}
            <div className="bg-surface-card border border-subtle rounded-card p-4 shadow-sm flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
                    <Input
                        placeholder="Buscar ejercicio..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-surface-card border-default text-strong"
                    />
                </div>
                <div className="w-full md:w-64">
                    <Select value={muscleFilter} onValueChange={(val) => setMuscleFilter(val || 'Todos')}>
                        <SelectTrigger className="bg-surface-card border-default">
                            <Filter className="w-4 h-4 mr-2 text-muted" />
                            <SelectValue placeholder="Grupo muscular" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Todos">Todos</SelectItem>
                            {MUSCLE_GROUPS.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {/* Toggles: solo personalizados / solo con video */}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setCustomOnly(v => !v)}
                        aria-pressed={customOnly}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-sm font-semibold border-[1.5px] transition-all whitespace-nowrap',
                            customOnly
                                ? 'bg-[var(--sport-100)] text-[var(--sport-700)] border-[var(--sport-300)]'
                                : 'bg-surface-sunken text-muted border-subtle hover:bg-surface-sunken hover:text-strong'
                        )}
                    >
                        <User className="w-4 h-4" />
                        Personalizados
                    </button>
                    <button
                        type="button"
                        onClick={() => setWithVideoOnly(v => !v)}
                        aria-pressed={withVideoOnly}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-2 rounded-control text-sm font-semibold border-[1.5px] transition-all whitespace-nowrap',
                            withVideoOnly
                                ? 'bg-[var(--sport-100)] text-[var(--sport-700)] border-[var(--sport-300)]'
                                : 'bg-surface-sunken text-muted border-subtle hover:bg-surface-sunken hover:text-strong'
                        )}
                    >
                        <Play className="w-4 h-4" />
                        Con video
                    </button>
                </div>
            </div>

            {/* Right: global catalog by muscle group */}
            <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-muted flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Catálogo de ejercicios
                        <Badge tone="neutral" variant="soft" className="ml-2 font-mono">
                            {filteredExercises.length}
                        </Badge>
                    </h2>
                    {canCreateExercises && <ExerciseCreateButton />}
                </div>

                {Object.keys(groupedByMuscle).length > 0 ? (
                    Object.entries(groupedByMuscle).map(([muscle, exList]) => {
                        const isCollapsed = collapsedGroups[muscle]
                        return (
                            <div key={muscle} className="bg-surface-card border border-subtle rounded-card overflow-hidden shadow-sm transition-all hover:shadow-md">
                                <button
                                    onClick={() => toggleGroup(muscle)}
                                    className="w-full px-5 py-3 border-b border-subtle bg-surface-sunken/50 flex items-center gap-2 cursor-pointer hover:bg-surface-sunken transition-colors"
                                >
                                    <div className="w-2 h-2 rounded-full bg-sport-500 shrink-0" />
                                    <span className="text-xs font-bold text-strong uppercase tracking-wider">
                                        {muscle}
                                    </span>
                                    <div className="ml-auto flex items-center gap-3">
                                        <span className="text-xs text-muted bg-surface-card px-2 py-0.5 rounded-full border border-subtle">
                                            {exList.length}
                                        </span>
                                        <div className="text-muted">
                                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                        </div>
                                    </div>
                                </button>
                                <AnimatePresence initial={false}>
                                    {!isCollapsed && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="px-5 py-4 flex flex-wrap gap-2"
                                        >
                                            {exList.map(ex => (
                                                <button
                                                    key={ex.id}
                                                    onClick={() => setSelected(ex)}
                                                    className="group inline-flex items-center px-4 py-2 rounded-control text-xs font-medium bg-surface-card text-strong border border-subtle hover:border-[var(--sport-300)] hover:bg-[var(--sport-100)] hover:text-[var(--sport-700)] transition-all duration-200 cursor-pointer shadow-sm hover:shadow"
                                                >
                                                    {(ex.video_url || ex.gif_url) && (
                                                        <div className="mr-2 w-2 h-2 rounded-full bg-sport-500 animate-pulse group-hover:animate-none" />
                                                    )}
                                                    {ex.name}
                                                    {/* Autoría a simple vista: sin esto el coach no sabe cuál de los
                                                        cientos de chips puede editar hasta abrirlos uno por uno. Tono
                                                        éxito discreto y `shrink-0` para no estirar el chip. */}
                                                    {customIds.has(ex.id) && (
                                                        <span className="ml-2 shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none bg-[var(--success-100)] text-[var(--success-700)]">
                                                            <User className="w-2.5 h-2.5" />
                                                            {ownLabel}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )
                    })
                ) : (
                    <div className="py-20 px-4 text-center bg-surface-card border border-dashed border-default rounded-card">
                        <Dumbbell className="w-12 h-12 text-[var(--ink-300)] mx-auto mb-4" />
                        <p className="text-muted font-medium">
                            {trimmedSearch ? <>No encontramos “{trimmedSearch}”</> : 'No se encontraron ejercicios'}
                        </p>
                        {/* El coach ya escribió el nombre: el catálogo le ofrece crearlo en vez de
                            mandarlo a buscar el botón de arriba (patrón de FoodSearchSheet). */}
                        {canCreateExercises && trimmedSearch && (
                            <Button
                                type="button"
                                // `sport` (con glow) ya lo usa el botón «Crear ejercicio» del header:
                                // el DS pide un solo hero por pantalla, así que acá va el sólido.
                                variant="default"
                                onClick={() => setCreateName(trimmedSearch)}
                                className="mt-4 max-w-full"
                            >
                                <Plus className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 truncate">Crear “{trimmedSearch}”</span>
                            </Button>
                        )}
                        <button
                            onClick={() => { setSearch(''); setMuscleFilter('Todos'); setCustomOnly(false); setWithVideoOnly(false); }}
                            className="mt-4 block mx-auto text-xs text-[var(--sport-600)] hover:underline font-bold"
                        >
                            Limpiar filtros
                        </button>
                    </div>
                )}
            </div>

            {/* Crear desde el empty state, con el término buscado ya cargado en el nombre */}
            {createName !== null && (
                <ExerciseFormModal
                    open
                    initialName={createName}
                    onClose={() => setCreateName(null)}
                    // El catálogo llega por props del servidor: sin refresh el recién creado no
                    // aparecería y el coach seguiría viendo "no encontramos".
                    onCreated={() => router.refresh()}
                />
            )}

            {/* Editar un ejercicio propio. El modal se cierra solo al guardar (llama a onClose). */}
            {editTarget && (
                <ExerciseFormModal
                    open
                    exercise={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSaved={() => {
                        router.refresh()
                        toast.success('Ejercicio actualizado')
                    }}
                />
            )}

            {/* Exercise Preview Modal */}
            <ExercisePreviewModal
                exercise={selected}
                open={!!selected}
                onClose={() => setSelected(null)}
                isOwn={selectedIsOwn}
                canManage={canCreateExercises}
                usage={selected ? (usageByExercise[selected.id] ?? 0) : 0}
                ownLabel={ownLabel}
                isPending={isPending}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                onClone={handleClone}
            />

            {/* Confirmación de borrado. Montado solo con target para que el nombre del título nunca
                quede vacío a mitad de la animación de cierre. */}
            {deleteTarget && (
                <AlertDialog
                    open
                    onOpenChange={(isOpen) => { if (!isOpen && !isPending) setDeleteTarget(null) }}
                >
                    <AlertDialogContent className="bg-surface-card border border-subtle text-body rounded-card">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-strong">
                                ¿Eliminar “{deleteTarget.name}”?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-muted">
                                {deleteScopeText} {deleteUsageText} Puedes deshacerlo justo después.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-3">
                            {/* Cancelar va PRIMERO en el DOM a propósito: es el primer tabbable, así el
                                foco inicial del diálogo cae en la salida segura y no en la destructiva. */}
                            <AlertDialogCancel disabled={isPending}>
                                Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                                variant="danger"
                                onClick={handleConfirmDelete}
                                disabled={isPending}
                            >
                                {isPending ? 'Eliminando…' : 'Eliminar'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    )
}

function ExercisePreviewModal({
    exercise,
    open,
    onClose,
    isOwn,
    canManage,
    usage,
    ownLabel,
    isPending,
    onEdit,
    onDelete,
    onClone,
}: {
    exercise: Exercise | null
    open: boolean
    onClose: () => void
    /** La fila pertenece al catálogo editable (propio / org / pool del team). */
    isOwn: boolean
    /** El rol permite gestionar el catálogo (crear, editar, eliminar, duplicar). */
    canManage: boolean
    /** Bloques de programa que ya usan el ejercicio (0 = sin uso o desconocido). */
    usage: number
    ownLabel: 'Propio' | 'Del equipo'
    isPending: boolean
    onEdit: (exercise: Exercise) => void
    onDelete: (exercise: Exercise) => void
    onClone: (exercise: Exercise) => void
}) {
    if (!exercise) return null

    const hasInstructions = exercise.instructions && exercise.instructions.length > 0
    const hasEquipment = !!exercise.equipment
    const hasSecondary = exercise.secondary_muscles && exercise.secondary_muscles.length > 0

    // gif_url / image_url = direct media (no YouTube parsing needed)
    const directMedia = (exercise as Record<string, unknown>).gif_url as string | null
        ?? (exercise as Record<string, unknown>).image_url as string | null
        ?? null
    // ytId only if no direct media — extractor robusto (maneja watch?v=, youtu.be, /shorts/, /embed/, /live/)
    const ytId = !directMedia && exercise.video_url ? extractYoutubeVideoId(exercise.video_url) : null
    // rawVideoUrl: video_url that is not YouTube (e.g. ExerciseDB GIF URLs)
    const rawVideoUrl = !directMedia && !ytId && exercise.video_url ? exercise.video_url : null

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="bg-surface-card border border-subtle text-body max-w-lg rounded-card shadow-2xl p-0 overflow-y-auto custom-scrollbar max-h-[85vh] focus:outline-none"
            >
                {/* Media demonstration area */}
                <div className="sticky top-0 relative w-full bg-white flex items-center justify-center border-b border-subtle h-56 md:h-72 shrink-0 overflow-hidden z-10">
                    {ytId ? (
                        <ExerciseVideo
                            videoId={ytId}
                            start={exercise.video_start_time}
                            end={exercise.video_end_time}
                            className="w-full h-full"
                            title={exercise.name}
                        />
                    ) : (directMedia || rawVideoUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={(directMedia || rawVideoUrl)!}
                            alt={`Demostración: ${exercise.name}`}
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-muted opacity-30">
                            <Dumbbell className="w-12 h-12" />
                            <p className="text-xs font-medium">Sin previsualización</p>
                        </div>
                    )}
                </div>

                <div className="p-6 space-y-5 flex-1">
                    <DialogHeader>
                        <div className="flex items-start justify-between gap-4">
                            <DialogTitle className="font-display text-xl font-extrabold text-strong">
                                {exercise.name}
                            </DialogTitle>
                            <DialogClose className="p-2 -mr-2 -mt-2 rounded-full hover:bg-surface-sunken transition-colors shrink-0">
                                <X className="w-5 h-5 text-muted" />
                            </DialogClose>
                        </div>
                    </DialogHeader>

                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--sport-100)] text-[var(--sport-700)] border border-[var(--sport-300)]/40">
                            <Target className="w-3 h-3" />
                            {exercise.muscle_group}
                        </span>
                        {hasEquipment && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-surface-sunken text-muted border border-subtle">
                                <Wrench className="w-3 h-3" />
                                {exercise.equipment}
                            </span>
                        )}
                        {hasSecondary && exercise.secondary_muscles!.map(m => (
                            <span key={m} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-muted bg-surface-sunken/60 border border-subtle">
                                {m}
                            </span>
                        ))}
                    </div>

                    {/* Instructions */}
                    {hasInstructions && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-strong flex items-center gap-2">
                                <Zap className="w-4 h-4 text-[var(--sport-600)]" />
                                Instrucciones
                            </h3>
                            <ol className="space-y-2">
                                {exercise.instructions!.map((step, i) => {
                                    // Strip "Step:N " prefix from ExerciseDB data
                                    const cleanStep = step.replace(/^Step:\d+\s*/i, '')
                                    return (
                                        <li key={i} className="flex gap-3 text-sm text-muted">
                                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--sport-100)] text-[var(--sport-700)] text-xs font-bold flex items-center justify-center mt-0.5">
                                                {i + 1}
                                            </span>
                                            <span className="leading-relaxed">{cleanStep}</span>
                                        </li>
                                    )
                                })}
                            </ol>
                        </div>
                    )}

                    {/* Vista del alumno preview */}
                    <div className="bg-surface-sunken/50 border border-subtle rounded-card p-4">
                        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                            Vista del alumno
                        </p>
                        <div className="bg-surface-card border border-subtle rounded-card p-4">
                            <div className="flex items-center gap-3">
                                {ytId ? (
                                    <div className="relative w-14 h-14 rounded-control overflow-hidden flex-shrink-0 bg-black/5 dark:bg-black/20">
                                        <Image
                                            src={exerciseThumbnailUrl(exercise) ?? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                                            alt={exercise.name}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                    </div>
                                ) : (directMedia || rawVideoUrl) ? (
                                    <div className="relative w-14 h-14 rounded-control overflow-hidden flex-shrink-0 bg-black/5 dark:bg-black/20">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={(directMedia || rawVideoUrl)!}
                                            alt={exercise.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-14 h-14 rounded-control bg-[var(--sport-100)] border border-[var(--sport-300)]/30 flex items-center justify-center flex-shrink-0">
                                        <Dumbbell className="w-6 h-6 text-[var(--sport-600)]" />
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm font-semibold text-strong">{exercise.name}</p>
                                    <p className="text-xs text-muted">{exercise.muscle_group}</p>
                                    {hasEquipment && (
                                        <p className="text-xs text-muted mt-0.5">🔧 {exercise.equipment}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Source badge. Decide por `isOwn`, no por `coach_id`: en org/team la fila propia
                        tiene coach_id NULL y, mirando la columna, el catálogo del pool se leía como
                        global (y por lo tanto no editable). */}
                    <div className="flex items-center gap-2 text-xs text-muted pt-1">
                        {isOwn ? (
                            <>
                                <User className="w-3.5 h-3.5 shrink-0" />
                                {ownLabel === 'Del equipo' ? 'Ejercicio del equipo' : 'Ejercicio personalizado'}
                            </>
                        ) : (
                            <>
                                <Globe className="w-3.5 h-3.5 shrink-0" />
                                Catálogo global · ExerciseDB
                            </>
                        )}
                        {/* Peso real del ejercicio antes de tocar nada. Solo con uso > 0: un "0 bloques"
                            no le dice nada a nadie. */}
                        {isOwn && usage > 0 && (
                            <span className="ml-auto shrink-0 tabular-nums">
                                Usado en {usage} {usage === 1 ? 'bloque' : 'bloques'} de tus programas
                            </span>
                        )}
                    </div>

                    {/* Pie de acciones. Sin permiso de gestión no se pinta nada (coach de org en solo
                        lectura, exactamente como antes). */}
                    {canManage && (
                        isOwn ? (
                            <div className="border-t border-subtle pt-3 flex flex-col sm:flex-row gap-2">
                                {/* Espejo del sheet de RN: dentro del modal el hero es «Editar» — el
                                    único `sport` de la pantalla (el header) no compite acá. */}
                                <Button
                                    type="button"
                                    variant="sport"
                                    onClick={() => onEdit(exercise)}
                                    disabled={isPending}
                                    className="w-full sm:flex-1"
                                >
                                    <Pencil className="h-4 w-4 shrink-0" />
                                    Editar ejercicio
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => onDelete(exercise)}
                                    disabled={isPending}
                                    className="w-full sm:w-auto bg-transparent text-[var(--cta-danger)] border-[var(--cta-danger)]/35 hover:bg-[color-mix(in_oklab,var(--cta-danger)_10%,transparent)] hover:text-[var(--cta-danger)]"
                                >
                                    <Trash2 className="h-4 w-4 shrink-0" />
                                    Eliminar
                                </Button>
                            </div>
                        ) : (
                            <div className="border-t border-subtle pt-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onClone(exercise)}
                                    disabled={isPending}
                                    className="w-full bg-[var(--sport-100)] text-[var(--sport-700)] border-[var(--sport-300)]/50 hover:bg-[var(--sport-200)] hover:text-[var(--sport-700)]"
                                >
                                    <Copy className="h-4 w-4 shrink-0" />
                                    Duplicar a mis ejercicios
                                </Button>
                            </div>
                        )
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
