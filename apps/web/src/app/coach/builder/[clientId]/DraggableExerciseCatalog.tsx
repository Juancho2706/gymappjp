'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDraggable } from '@dnd-kit/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, Dumbbell, Filter, Eye, Activity, Plus, Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MUSCLE_GROUPS } from '@/lib/constants'
import { filterExercises, cn } from '@/lib/utils'
import { exerciseThumbnailUrl, extractYoutubeVideoId } from '@/lib/youtube'
import { ExerciseVideo } from '@/components/exercise/ExerciseVideo'
import type { Tables } from '@/lib/database.types'
import { ExerciseFormModal } from '@/app/coach/exercises/_components/ExerciseFormModal'
import { getMuscleColor } from './muscle-colors'

type Exercise = Tables<'exercises'>

/**
 * Scope de propiedad del catálogo: decide qué ejercicios puede EDITAR este coach.
 * Espejo del predicado `customExercises` de `getExerciseCatalog`
 * (`apps/web/src/app/coach/exercises/_data/exercises.queries.ts`): propio = mío por
 * `coach_id`, del pool del team activo, o del catálogo de la org. Se pasa desde la page
 * porque el catálogo recibe UNA sola lista mezclada (sistema + propios) y desde el cliente
 * no hay forma de distinguirlos sin el scope del workspace.
 */
export interface ExerciseOwnerScope {
    coachId?: string | null
    teamId?: string | null
    orgId?: string | null
}

function isOwnExercise(exercise: Exercise, scope?: ExerciseOwnerScope): boolean {
    if (!scope) return false
    if (scope.coachId && exercise.coach_id === scope.coachId) return true
    if (scope.teamId && exercise.team_id === scope.teamId) return true
    if (scope.orgId && exercise.org_id === scope.orgId) return true
    return false
}

interface DraggableExerciseItemProps {
    exercise: Exercise
    onSelect?: (exercise: Exercise) => void
    onPreview?: (exercise: Exercise) => void
    onTapAdd?: (exercise: Exercise) => void
}

function DraggableExerciseItem({ exercise, onSelect, onPreview, onTapAdd }: DraggableExerciseItemProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `catalog-${exercise.id}`,
        data: {
            type: 'new-exercise',
            exercise
        }
    })

    const style = {
        touchAction: 'pan-y'
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={() => onSelect?.(exercise)}
            className={cn(
                // .dt-catitem: borderless row with surface-sunken hover fill (transparent on bg-card panel)
                "max-w-full overflow-hidden p-3 rounded-control border border-transparent bg-transparent hover:bg-muted transition-all cursor-grab active:cursor-grabbing group relative",
                isDragging && "opacity-50 ring-2 ring-primary !border-primary bg-muted",
                onSelect && "cursor-pointer active:scale-95"
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <div
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center overflow-hidden shrink-0 group-hover:shadow-sm transition-all relative"
                    style={{ backgroundColor: `color-mix(in srgb, ${getMuscleColor(exercise.muscle_group)} 15%, transparent)` }}
                >
                    {(() => {
                        const thumb = exerciseThumbnailUrl(exercise)
                        return thumb ? (
                            <img
                                src={thumb}
                                alt={exercise.name}
                                loading="lazy"
                                className={`w-full h-full object-cover ${thumb.includes('img.youtube.com') ? '' : 'mix-blend-multiply dark:mix-blend-normal'}`}
                            />
                        ) : (
                            <Activity className="w-5 h-5 opacity-50" style={{ color: getMuscleColor(exercise.muscle_group) }} />
                        )
                    })()}
                </div>
                <div className={cn('flex-1 min-w-0', onTapAdd && onPreview ? 'pr-20' : 'pr-8')}>
                    <p className="text-[13px] font-bold leading-tight text-foreground group-hover:text-primary transition-colors truncate">{exercise.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getMuscleColor(exercise.muscle_group) }} />
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider truncate">{exercise.muscle_group}</p>
                    </div>
                </div>
            </div>

            {onTapAdd ? (
                <>
                    {onPreview && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onPreview(exercise) }}
                            className="absolute right-[3.25rem] top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-muted-foreground transition-colors z-10"
                            title="Ver técnica"
                        >
                            <Eye className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onTapAdd(exercise) }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-primary text-white shadow-md active:scale-95 transition-transform z-10"
                        style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                        title="Añadir al día"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </>
            ) : onPreview ? (
                <button
                    onClick={(e) => { e.stopPropagation(); onPreview(exercise) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-primary transition-colors z-10"
                    title="Vista Previa"
                >
                    <Eye className="w-4 h-4" style={{ color: 'var(--theme-primary)' }} />
                </button>
            ) : null}
        </div>
    )
}

// ─── List item types for virtualizer ────────────────────────────────────────

type ListItem =
    | { kind: 'header'; label: string }
    | { kind: 'separator' }
    | { kind: 'exercise'; exercise: Exercise; isRecent: boolean }

interface DraggableExerciseCatalogProps {
    exercises: Exercise[]
    className?: string
    onSelect?: (exercise: Exercise) => void
    onTapAdd?: (exercise: Exercise) => void
    /** Si se define, el filtro de músculo es controlado por el padre (p. ej. chips del sheet móvil). */
    selectedMuscleGroup?: string
    onSelectedMuscleGroupChange?: (group: string) => void
    /** Sin scope no se ofrece «Editar ejercicio»: no sabríamos cuál es propio. */
    ownerScope?: ExerciseOwnerScope
}

export function DraggableExerciseCatalog({
    exercises,
    className,
    onSelect,
    onTapAdd,
    selectedMuscleGroup: selectedMuscleProp,
    onSelectedMuscleGroupChange,
    ownerScope,
}: DraggableExerciseCatalogProps) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [internalMuscle, setInternalMuscle] = useState<string>('Todos')
    const controlled = selectedMuscleProp !== undefined
    const selectedMuscle = controlled ? selectedMuscleProp : internalMuscle
    const setSelectedMuscle = (v: string) => {
        onSelectedMuscleGroupChange?.(v)
        if (!controlled) setInternalMuscle(v)
    }
    const [previewExercise, setPreviewExercise] = useState<Exercise | null>(null)
    const [recentIds, setRecentIds] = useState<string[]>([])
    // Término congelado al abrir el CTA «Crear "…"» del empty state (null = modal cerrado).
    const [createName, setCreateName] = useState<string | null>(null)
    // Ejercicios creados desde acá: el builder no recarga sus props a mitad de sesión, así que
    // el recién creado se muestra en el catálogo en curso hasta el próximo refresh del servidor.
    const [createdExercises, setCreatedExercises] = useState<Exercise[]>([])
    // Fila COMPLETA del ejercicio propio que se está editando (null = modal cerrado).
    const [editTarget, setEditTarget] = useState<Exercise | null>(null)
    // Id del ejercicio cuya fila completa se está pidiendo (spinner del botón «Editar»).
    const [editLoadingId, setEditLoadingId] = useState<string | null>(null)
    // Ediciones hechas desde acá: mismo motivo que `createdExercises`, pero PISAN la fila por id
    // para que el nombre/media nuevos se vean al toque, sin esperar el `router.refresh()`.
    const [editedExercises, setEditedExercises] = useState<Record<string, Exercise>>({})

    useEffect(() => {
        const loadRecent = () => {
            try {
                const saved = localStorage.getItem('builder_recent_exercises')
                if (saved) setRecentIds(JSON.parse(saved))
            } catch { /* ignore */ }
        }
        loadRecent()
        window.addEventListener('recent_exercises_updated', loadRecent)
        window.addEventListener('storage', loadRecent)
        return () => {
            window.removeEventListener('recent_exercises_updated', loadRecent)
            window.removeEventListener('storage', loadRecent)
        }
    }, [])

    const catalogExercises = useMemo(() => {
        let list = exercises
        if (createdExercises.length > 0) {
            const known = new Set(exercises.map(e => e.id))
            list = [...createdExercises.filter(e => !known.has(e.id)), ...exercises]
        }
        if (Object.keys(editedExercises).length > 0) {
            list = list.map(e => editedExercises[e.id] ?? e)
        }
        return list
    }, [exercises, createdExercises, editedExercises])

    const recentExercises = useMemo(() => {
        return recentIds.map(id => catalogExercises.find(e => e.id === id)).filter(Boolean) as Exercise[]
    }, [recentIds, catalogExercises])

    const filteredExercises = useMemo(() => {
        return filterExercises(catalogExercises, search, selectedMuscle)
    }, [catalogExercises, search, selectedMuscle])

    const trimmedSearch = search.trim()

    // ── Flat list for virtualizer ──────────────────────────────────────────
    const listItems = useMemo((): ListItem[] => {
        const items: ListItem[] = []
        const showRecents = search === '' && selectedMuscle === 'Todos' && recentExercises.length > 0
        if (showRecents) {
            items.push({ kind: 'header', label: 'Usados Recientemente' })
            recentExercises.forEach(ex => items.push({ kind: 'exercise', exercise: ex, isRecent: true }))
            items.push({ kind: 'separator' })
            if (filteredExercises.length > 0) {
                items.push({ kind: 'header', label: 'Todos los Ejercicios' })
            }
        }
        filteredExercises.forEach(ex => items.push({ kind: 'exercise', exercise: ex, isRecent: false }))
        return items
    }, [search, selectedMuscle, recentExercises, filteredExercises])

    // El preview solo ofrece «Editar» sobre ejercicios propios: los del sistema son de solo lectura
    // (la action del servidor igual los rechaza, pero el botón no debe siquiera aparecer).
    const canEditPreview = !!previewExercise && isOwnExercise(previewExercise, ownerScope)

    /**
     * El catálogo del builder llega con columnas RECORTADAS (`EXERCISE_LIST_COLUMNS`: sin
     * `instructions` ni `image_url`). Abrir el formulario con esa fila parcial guardaría esos
     * campos vacíos —`updateExerciseAction` escribe SIEMPRE `instructions` e `image_url`—, así
     * que pedimos la fila completa antes de abrir el modal.
     */
    const openEditor = async (exercise: Exercise) => {
        setEditLoadingId(exercise.id)
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('exercises')
                .select('*')
                .eq('id', exercise.id)
                .single()
            if (error || !data) throw error ?? new Error('exercise_not_found')
            setPreviewExercise(null)
            setEditTarget(data)
        } catch {
            toast.error('No pudimos abrir el ejercicio. Intenta de nuevo.')
        } finally {
            setEditLoadingId(null)
        }
    }

    const parentRef = useRef<HTMLDivElement>(null)

    const rowVirtualizer = useVirtualizer({
        count: listItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (i) => {
            const item = listItems[i]
            if (!item) return 68
            if (item.kind === 'header') return 32
            if (item.kind === 'separator') return 17
            return 68 // exercise card height (p-3 + thumbnail row)
        },
        overscan: 5,
    })

    return (
        <div className={cn("flex min-h-0 min-w-0 flex-col h-full max-w-full bg-card border border-border rounded-card overflow-hidden shadow-sm relative", className)}>
            {/* Header / Filters */}
            <div className="p-3 md:p-4 border-b border-border space-y-3 md:space-y-4 bg-muted/20 rounded-t-card shrink-0">
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-extrabold tracking-tight text-foreground">
                        Catálogo de Ejercicios
                    </h2>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nombre..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-10 text-[16px] md:text-xs bg-background border-border rounded-control focus:border-primary focus:ring-primary/20 transition-all text-foreground"
                            style={{ borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)' }}
                        />
                    </div>

                    <Select value={selectedMuscle} onValueChange={(val) => setSelectedMuscle(val || 'Todos')}>
                        <SelectTrigger
                            className="h-10 text-xs bg-background border-border rounded-control focus:border-primary focus:ring-primary/20 transition-all text-foreground"
                            style={{ borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)' }}
                        >
                            <div className="flex items-center gap-2">
                                <Filter className="w-3 h-3 text-muted-foreground" />
                                <SelectValue placeholder="Filtrar por músculo" />
                            </div>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-background text-foreground">
                            <SelectItem value="Todos" className="text-xs">Todos los músculos</SelectItem>
                            {MUSCLE_GROUPS.map(mg => (
                                <SelectItem key={mg} value={mg} className="text-xs">{mg}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Virtualized list */}
            <div
                ref={parentRef}
                className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-3 py-2"
                style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
                {listItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-foreground">
                        <Search className="w-8 h-8 mb-2 opacity-40" />
                        {trimmedSearch ? (
                            <>
                                <p className="max-w-full truncate px-2 text-xs font-medium opacity-60">
                                    No encontramos “{trimmedSearch}”
                                </p>
                                {/* El instante exacto de la necesidad: armando la rutina. Crear acá
                                    evita abandonar el programa para ir a la biblioteca y volver. */}
                                <button
                                    type="button"
                                    onClick={() => setCreateName(trimmedSearch)}
                                    className="eva-press mt-3 inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-control px-3.5 text-xs font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"
                                    style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                                >
                                    <Plus className="w-3.5 h-3.5 shrink-0" />
                                    <span className="min-w-0 truncate">Crear “{trimmedSearch}”</span>
                                </button>
                            </>
                        ) : (
                            <p className="text-xs font-medium opacity-40">No se encontraron<br />ejercicios</p>
                        )}
                    </div>
                ) : (
                    <div className="min-w-0 max-w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                        {rowVirtualizer.getVirtualItems().map(virtualRow => {
                            const item = listItems[virtualRow.index]
                            return (
                                <div
                                    key={virtualRow.key}
                                    className="min-w-0 max-w-full overflow-x-hidden"
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    {item.kind === 'header' && (
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1 pt-2 pb-1">
                                            {item.label}
                                        </p>
                                    )}
                                    {item.kind === 'separator' && (
                                        <div className="h-px bg-border/50 my-2" />
                                    )}
                                    {item.kind === 'exercise' && (
                                        <DraggableExerciseItem
                                            exercise={item.exercise}
                                            onSelect={onSelect}
                                            onPreview={setPreviewExercise}
                                            onTapAdd={onTapAdd}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="hidden md:block p-3 bg-muted/10 border-t border-border shrink-0">
                <p className="text-[10px] text-muted-foreground text-center">
                    Arrastra un ejercicio al día deseado
                </p>
            </div>

            {/* Crear ejercicio sin salir del builder (CTA del empty state) */}
            {createName !== null && (
                <ExerciseFormModal
                    open
                    initialName={createName}
                    onClose={() => setCreateName(null)}
                    onCreated={(created) => {
                        setCreatedExercises(prev => [created, ...prev])
                        // En el sheet móvil el catálogo es "añadir al día": el recién creado entra
                        // directo donde el coach estaba. En desktop queda listo para arrastrar.
                        onTapAdd?.(created)
                    }}
                />
            )}

            {/* Preview Modal */}
            <Dialog open={!!previewExercise} onOpenChange={() => setPreviewExercise(null)}>
                <DialogContent className="sm:max-w-md bg-background border-border overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-display uppercase tracking-tighter text-foreground">
                            {previewExercise?.name}
                        </DialogTitle>
                        <p className="text-xs font-bold text-primary uppercase tracking-[0.2em]" style={{ color: 'var(--theme-primary)' }}>
                            {previewExercise?.muscle_group}
                        </p>
                    </DialogHeader>
                    {(() => {
                        const youtubeId = previewExercise?.video_url ? extractYoutubeVideoId(previewExercise.video_url) : null
                        const directMedia = previewExercise?.gif_url || (previewExercise?.video_url && !youtubeId ? previewExercise.video_url : null)
                        if (directMedia) {
                            return (
                                <div className="aspect-video relative rounded-xl overflow-hidden bg-white mt-4 border border-border flex items-center justify-center">
                                    <img
                                        src={directMedia}
                                        alt={previewExercise?.name}
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            )
                        }
                        if (youtubeId) {
                            return (
                                <div className="aspect-video relative rounded-xl overflow-hidden bg-muted mt-4 border border-border flex items-center justify-center">
                                    <ExerciseVideo
                                        videoId={youtubeId}
                                        start={previewExercise?.video_start_time}
                                        end={previewExercise?.video_end_time}
                                        className="w-full h-full"
                                        title={previewExercise?.name}
                                    />
                                </div>
                            )
                        }
                        return (
                            <div className="aspect-video flex items-center justify-center rounded-xl bg-muted mt-4 border border-border">
                                <Dumbbell className="w-12 h-12 text-muted-foreground opacity-20" />
                            </div>
                        )
                    })()}

                    {/* Editar sin salir del builder: el coach ve el video acá y arregla el ejercicio
                        propio en el mismo lugar (paridad con el preview del catálogo en RN). */}
                    {canEditPreview && previewExercise && (
                        <button
                            type="button"
                            onClick={() => { void openEditor(previewExercise) }}
                            disabled={editLoadingId === previewExercise.id}
                            className="eva-press mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control px-3.5 text-xs font-bold text-primary-foreground shadow-sm transition-transform active:scale-95 disabled:opacity-60"
                            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                        >
                            {editLoadingId === previewExercise.id ? (
                                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                            ) : (
                                <Pencil className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>Editar ejercicio</span>
                        </button>
                    )}
                </DialogContent>
            </Dialog>

            {/* Editar ejercicio propio sin salir del builder */}
            {editTarget && (
                <ExerciseFormModal
                    open
                    exercise={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSaved={() => {
                        const editedId = editTarget.id
                        toast.success('Ejercicio actualizado')
                        // El catálogo llega por props del server component: `router.refresh()`
                        // re-corre la query de la page (el estado del builder se preserva).
                        router.refresh()
                        // Además pisamos la fila local con la versión fresca para que el cambio se
                        // vea al toque, igual que `onCreated` hace con la recién creada.
                        const supabase = createClient()
                        void supabase
                            .from('exercises')
                            .select('*')
                            .eq('id', editedId)
                            .single()
                            .then(({ data }) => {
                                if (data) setEditedExercises(prev => ({ ...prev, [editedId]: data }))
                            })
                    }}
                />
            )}
        </div>
    )
}
