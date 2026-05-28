'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from '@/components/ui/dialog'
import {
    Dumbbell,
    Globe,
    User,
    ChevronDown,
    ChevronUp,
    Filter,
    Pencil,
    Search,
    Sparkles,
    Target,
    Trash2,
    UserCircle,
    Wrench,
    X,
    Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Tables } from '@/lib/database.types'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { filterExercises } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { ExerciseThumb } from '@/components/exercise/ExerciseThumb'
import { ExerciseFormModal } from './_components/ExerciseFormModal'
import {
    restoreExerciseAction,
    softDeleteExerciseAction,
} from './_actions/exercise.actions'

type Exercise = Tables<'exercises'>

type Origin = 'all' | 'system' | 'mine'

interface ExerciseCatalogClientProps {
    globalExercises: Exercise[]
    customExercises: Exercise[]
    byMuscle: Record<string, Exercise[]>
    myCoachId: string
    coachLogoUrl: string | null
    canEdit: boolean
}

export function ExerciseCatalogClient({
    globalExercises,
    customExercises,
    myCoachId,
    coachLogoUrl,
    canEdit,
}: ExerciseCatalogClientProps) {
    const router = useRouter()
    const [selected, setSelected] = useState<Exercise | null>(null)
    const [editing, setEditing] = useState<Exercise | null>(null)
    const [search, setSearch] = useState('')
    const [muscleFilter, setMuscleFilter] = useState<string>('Todos')
    const [originFilter, setOriginFilter] = useState<Origin>('all')
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

    const toggleGroup = (muscle: string) => {
        setCollapsedGroups((prev) => ({ ...prev, [muscle]: !prev[muscle] }))
    }

    const allExercises = useMemo(
        () => [...globalExercises, ...customExercises],
        [globalExercises, customExercises]
    )

    const byOrigin = useMemo(() => {
        if (originFilter === 'system') return globalExercises
        if (originFilter === 'mine') return customExercises
        return allExercises
    }, [originFilter, allExercises, globalExercises, customExercises])

    const filteredExercises = useMemo(
        () => filterExercises(byOrigin, search, muscleFilter),
        [byOrigin, search, muscleFilter]
    )

    const groupedByMuscle = useMemo(() => {
        const groups: Record<string, Exercise[]> = {}
        MUSCLE_GROUPS.forEach((m) => {
            groups[m] = []
        })
        filteredExercises.forEach((ex) => {
            const muscle = ex.muscle_group || 'Otro'
            if (!groups[muscle]) groups[muscle] = []
            groups[muscle].push(ex)
        })
        return Object.fromEntries(Object.entries(groups).filter(([, list]) => list.length > 0))
    }, [filteredExercises])

    const handleDelete = async (ex: Exercise) => {
        const ok = window.confirm(`¿Eliminar "${ex.name}"? Los planes que ya lo usan no se afectan.`)
        if (!ok) return
        setSelected(null)
        const res = await softDeleteExerciseAction(ex.id)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success('Ejercicio eliminado', {
            action: {
                label: 'Deshacer',
                onClick: async () => {
                    const restored = await restoreExerciseAction(ex.id)
                    if (restored.error) {
                        toast.error(restored.error)
                        return
                    }
                    router.refresh()
                },
            },
            duration: 8000,
        })
        router.refresh()
    }

    const handleEdit = (ex: Exercise) => {
        setSelected(null)
        setEditing(ex)
    }

    return (
        <div className="space-y-6">
            {/* Origin chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                <OriginChip
                    active={originFilter === 'all'}
                    onClick={() => setOriginFilter('all')}
                    icon={Globe}
                    count={allExercises.length}
                >
                    Todos
                </OriginChip>
                <OriginChip
                    active={originFilter === 'system'}
                    onClick={() => setOriginFilter('system')}
                    icon={Sparkles}
                    count={globalExercises.length}
                >
                    Sistema EVA
                </OriginChip>
                <OriginChip
                    active={originFilter === 'mine'}
                    onClick={() => setOriginFilter('mine')}
                    icon={UserCircle}
                    count={customExercises.length}
                >
                    Míos
                </OriginChip>
            </div>

            {/* Filters Section */}
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar ejercicio..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-background border-border text-foreground"
                    />
                </div>
                <div className="w-full md:w-64">
                    <Select value={muscleFilter} onValueChange={(val) => setMuscleFilter(val || 'Todos')}>
                        <SelectTrigger className="bg-muted/50 border-border">
                            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Grupo muscular" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Todos">Todos</SelectItem>
                            {MUSCLE_GROUPS.map((m) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Catalog */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Catálogo
                        <Badge variant="secondary" className="ml-2 font-mono">
                            {filteredExercises.length}
                        </Badge>
                    </h2>
                </div>

                {Object.keys(groupedByMuscle).length > 0 ? (
                    Object.entries(groupedByMuscle).map(([muscle, exList]) => {
                        const isCollapsed = collapsedGroups[muscle]
                        return (
                            <div
                                key={muscle}
                                className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md"
                            >
                                <button
                                    onClick={() => toggleGroup(muscle)}
                                    className="w-full px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
                                >
                                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                                        {muscle}
                                    </span>
                                    <div className="ml-auto flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">
                                            {exList.length}
                                        </span>
                                        <div className="text-muted-foreground">
                                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                        </div>
                                    </div>
                                </button>
                                <AnimatePresence initial={false}>
                                    {!isCollapsed && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="divide-y divide-border"
                                        >
                                            {exList.map((ex) => {
                                                const isMine = ex.coach_id === myCoachId
                                                const hasMedia = !!(ex.gif_url || ex.image_url || ex.video_url)
                                                return (
                                                    <button
                                                        key={ex.id}
                                                        onClick={() => setSelected(ex)}
                                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:bg-muted/40 group"
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                                                {ex.name}
                                                            </p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                {isMine ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                                                                        <UserCircle className="w-3 h-3" /> Mío
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                                                        <Sparkles className="w-3 h-3" /> EVA
                                                                    </span>
                                                                )}
                                                                {ex.equipment && (
                                                                    <span className="text-[10px] text-muted-foreground/60 truncate">
                                                                        · {ex.equipment}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {hasMedia && (
                                                            <div className="shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                                                                <Zap className="w-3 h-3 text-primary" />
                                                            </div>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )
                    })
                ) : (
                    <EmptyState
                        origin={originFilter}
                        hasSearch={!!search || muscleFilter !== 'Todos'}
                        canEdit={canEdit}
                        onClear={() => {
                            setSearch('')
                            setMuscleFilter('Todos')
                        }}
                    />
                )}
            </div>

            {/* Exercise Preview Modal */}
            <ExercisePreviewModal
                exercise={selected}
                myCoachId={myCoachId}
                coachLogoUrl={coachLogoUrl}
                canEdit={canEdit}
                open={!!selected}
                onClose={() => setSelected(null)}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            {/* Edit Form Modal */}
            {editing && (
                <ExerciseFormModal
                    open={!!editing}
                    onClose={() => {
                        setEditing(null)
                        router.refresh()
                    }}
                    exercise={editing}
                />
            )}
        </div>
    )
}

// ─── Origin chip ─────────────────────────────────────────────────────────────

function OriginChip({
    active,
    onClick,
    icon: Icon,
    count,
    children,
}: {
    active: boolean
    onClick: () => void
    icon: typeof Globe
    count: number
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-foreground hover:bg-muted/70'
            }`}
        >
            <Icon className="w-3.5 h-3.5" />
            {children}
            <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    active ? 'bg-primary-foreground/20' : 'bg-background/60'
                }`}
            >
                {count}
            </span>
        </button>
    )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
    origin,
    hasSearch,
    canEdit,
    onClear,
}: {
    origin: Origin
    hasSearch: boolean
    canEdit: boolean
    onClear: () => void
}) {
    if (origin === 'mine' && !hasSearch) {
        return (
            <div className="py-16 text-center bg-card border border-dashed border-border rounded-2xl">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <UserCircle className="w-8 h-8 text-primary" />
                </div>
                <p className="text-foreground font-semibold">Aún no creaste ejercicios propios</p>
                <p className="text-sm text-muted-foreground mt-1">
                    {canEdit
                        ? 'Empezá tu biblioteca con un ejercicio + GIF o video.'
                        : 'Disponible al subir a un plan Starter o superior.'}
                </p>
            </div>
        )
    }
    return (
        <div className="py-20 text-center bg-card border border-dashed border-border rounded-2xl">
            <Dumbbell className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No se encontraron ejercicios</p>
            {hasSearch && (
                <button
                    onClick={onClear}
                    className="mt-4 text-xs text-primary hover:underline font-bold"
                >
                    Limpiar filtros
                </button>
            )}
        </div>
    )
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function ExercisePreviewModal({
    exercise,
    myCoachId,
    coachLogoUrl,
    canEdit,
    open,
    onClose,
    onEdit,
    onDelete,
}: {
    exercise: Exercise | null
    myCoachId: string
    coachLogoUrl: string | null
    canEdit: boolean
    open: boolean
    onClose: () => void
    onEdit: (ex: Exercise) => void
    onDelete: (ex: Exercise) => void
}) {
    if (!exercise) return null

    const isMine = exercise.coach_id === myCoachId
    const hasInstructions = exercise.instructions && exercise.instructions.length > 0
    const hasEquipment = !!exercise.equipment
    const hasSecondary = exercise.secondary_muscles && exercise.secondary_muscles.length > 0

    const directMedia = exercise.gif_url ?? exercise.image_url ?? null
    const ytId = !directMedia && exercise.video_url ? extractYouTubeId(exercise.video_url) : null
    // System EVA exercises (ExerciseDB) store raw GIF URLs in video_url, not YouTube
    const rawVideoUrl = !directMedia && !ytId && exercise.video_url ? exercise.video_url : null

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="bg-card border border-border text-foreground max-w-lg rounded-2xl shadow-2xl p-0 overflow-y-auto custom-scrollbar max-h-[85vh] focus:outline-none"
            >
                {/* Media demo area */}
                <div className="sticky top-0 relative w-full bg-black flex items-center justify-center border-b border-border h-56 md:h-72 shrink-0 overflow-hidden z-10">
                    {ytId ? (
                        <iframe
                            className="w-full h-full"
                            src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&modestbranding=1&rel=0&controls=0`}
                            title={exercise.name}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                        />
                    ) : directMedia || rawVideoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={(directMedia || rawVideoUrl)!}
                            alt={`Demostración: ${exercise.name}`}
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground opacity-50">
                            <Dumbbell className="w-12 h-12" />
                            <p className="text-xs font-medium">Sin previsualización</p>
                        </div>
                    )}
                </div>

                <div className="p-6 space-y-5 flex-1">
                    <DialogHeader>
                        <div className="flex items-start justify-between gap-4">
                            <DialogTitle className="text-xl font-extrabold text-foreground">
                                {exercise.name}
                            </DialogTitle>
                            <DialogClose className="p-2 -mr-2 -mt-2 rounded-full hover:bg-muted transition-colors shrink-0">
                                <X className="w-5 h-5 text-muted-foreground" />
                            </DialogClose>
                        </div>
                    </DialogHeader>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                            <Target className="w-3 h-3" />
                            {exercise.muscle_group}
                        </span>
                        {hasEquipment && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                                <Wrench className="w-3 h-3" />
                                {exercise.equipment}
                            </span>
                        )}
                        {hasSecondary &&
                            exercise.secondary_muscles!.map((m) => (
                                <span
                                    key={m}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-muted-foreground bg-muted/60 border border-border"
                                >
                                    {m}
                                </span>
                            ))}
                    </div>

                    {hasInstructions && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Zap className="w-4 h-4 text-primary" />
                                Instrucciones
                            </h3>
                            <ol className="space-y-2">
                                {exercise.instructions!.map((step, i) => {
                                    const cleanStep = step.replace(/^Step:\d+\s*/i, '')
                                    return (
                                        <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                                                {i + 1}
                                            </span>
                                            <span className="leading-relaxed">{cleanStep}</span>
                                        </li>
                                    )
                                })}
                            </ol>
                        </div>
                    )}

                    {/* Vista del alumno */}
                    <div className="bg-muted/50 border border-border rounded-xl p-4">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                            Vista del alumno
                        </p>
                        <div className="bg-card border border-border rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                <ExerciseThumb
                                    exercise={exercise}
                                    coachLogoUrl={isMine ? coachLogoUrl : null}
                                    size="sm"
                                />
                                <div>
                                    <p className="text-sm font-semibold text-foreground">{exercise.name}</p>
                                    <p className="text-xs text-muted-foreground">{exercise.muscle_group}</p>
                                    {hasEquipment && (
                                        <p className="text-xs text-muted-foreground mt-0.5">🔧 {exercise.equipment}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Source */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                        {exercise.coach_id ? (
                            <>
                                <User className="w-3.5 h-3.5" />
                                Ejercicio personalizado
                            </>
                        ) : (
                            <>
                                <Globe className="w-3.5 h-3.5" />
                                Catálogo global · ExerciseDB
                            </>
                        )}
                    </div>

                    {/* Actions (solo para el dueño y si puede editar) */}
                    {isMine && canEdit && (
                        <div className="flex gap-2 pt-3 border-t border-border">
                            <button
                                type="button"
                                onClick={() => onEdit(exercise)}
                                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
                            >
                                <Pencil className="w-4 h-4" /> Editar
                            </button>
                            <button
                                type="button"
                                onClick={() => onDelete(exercise)}
                                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-destructive/30 text-destructive py-2.5 text-sm font-semibold hover:bg-destructive/10 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> Eliminar
                            </button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function extractYouTubeId(url: string): string | null {
    const match = url.match(/(?:v=|\/(?:embed|shorts|live|v)\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    return match ? match[1] : null
}
