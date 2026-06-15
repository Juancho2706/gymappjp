'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Minus, Plus, CircleHelp, Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getMuscleColor } from '../muscle-colors'
import { buildAreaVMs, type BuilderAreaVM } from '../area-ui'
import { effectiveAreaKey } from '@/lib/workout-areas'
import { EXERCISE_TYPE_LABEL, effectiveExerciseType, typedBlockSummary } from '@/lib/workout-exercise-type'
import { exerciseThumbnailUrl } from '@/lib/youtube'
import type { BuilderBlock } from '../types'

interface ExerciseBlockProps {
    block: BuilderBlock
    dayId: number
    /** Areas disponibles ya resueltas a VM (DayColumn las memoiza); vacio ⇒ 3 clasicos */
    areaVMs?: BuilderAreaVM[]
    /** Clave de area efectiva del bloque, precalculada por DayColumn */
    currentAreaId?: string
    onEdit: (block: BuilderBlock) => void
    onRemove: (dayId: number, uid: string) => void
    onUpdate?: (block: BuilderBlock) => void
    onToggleSuperset?: () => void
    onSetArea?: (areaId: string) => void
    onToggleOverride?: () => void
    /** Muestra badge Base/Modif. cuando hay plantilla vinculada */
    showTemplateLink?: boolean
    /** Indica que el drag está en periodo de delay (300ms TouchSensor) */
    isDragPending?: boolean
    /** Viewport estrecho: ayuda y textos sin mencionar arrastrar a zonas de sección */
    narrowLayout?: boolean
}

function ExerciseBlockInner({
    block, dayId, areaVMs, currentAreaId, onEdit, onRemove, onUpdate, onToggleSuperset,
    onSetArea, onToggleOverride, showTemplateLink, isDragPending, narrowLayout = false,
}: ExerciseBlockProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: block.uid,
        data: {
            type: 'block',
            block,
            dayId
        }
    })

    const [isQuickEditing, setIsQuickEditing] = useState(false)
    const [quickSets, setQuickSets] = useState(block.sets ?? 3)
    const [quickReps, setQuickReps] = useState(block.reps ?? '8-12')
    const [sectionHelpOpen, setSectionHelpOpen] = useState(false)
    const [areaPickerOpen, setAreaPickerOpen] = useState(false)

    // Area efectiva del bloque (DayColumn precalcula la clave; standalone — DragOverlay — la resuelve aqui)
    const vms = useMemo(() => areaVMs ?? buildAreaVMs([]), [areaVMs])
    const areaKey = useMemo(
        () => currentAreaId ?? effectiveAreaKey(block, new Set(vms.map(v => v.id))),
        [currentAreaId, block, vms]
    )
    const currentArea = vms.find(v => v.id === areaKey) ?? vms.find(v => v.slug === 'main') ?? vms[0]

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    }

    const muscleColor = getMuscleColor(block.muscle_group)

    // Thumbnail del ejercicio (gif > imagen > thumbnail de YouTube > media directa). Iguala la
    // app del alumno: un ejercicio solo-YouTube ya no muestra el cuadrito vacío. img.youtube.com
    // está permitido en next.config; aquí usamos <img> simple igual que el resto del bloque.
    const thumb = useMemo(() => exerciseThumbnailUrl(block), [block])

    // Resumen por tipo (specs/movida-entrenamiento): null en bloques strength ⇒ el chip
    // legacy "sets × reps" se renderiza EXACTAMENTE igual que hoy (AC3).
    const blockType = effectiveExerciseType(block, { exercise_type: block.exercise_type })
    const typedSummary = useMemo(() => {
        if (blockType === 'strength') return null
        const dist = parseFloat((block.distance_value || '').replace(',', '.'))
        return typedBlockSummary(
            { ...block, distance_value: Number.isFinite(dist) ? dist : null, load_value: null },
            blockType
        )
    }, [block, blockType])

    function handleQuickSave() {
        if (onUpdate) {
            onUpdate({ ...block, sets: quickSets, reps: quickReps })
        }
        setIsQuickEditing(false)
    }

    function handleQuickKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') handleQuickSave()
        if (e.key === 'Escape') {
            setQuickSets(block.sets ?? 3)
            setQuickReps(block.reps ?? '8-12')
            setIsQuickEditing(false)
        }
    }

    function startQuickEdit(e: React.MouseEvent) {
        e.stopPropagation()
        setQuickSets(block.sets ?? 3)
        setQuickReps(block.reps ?? '8-12')
        setIsQuickEditing(true)
    }

    return (
        <div ref={setNodeRef}
            className={cn(
                'group relative flex min-w-0 max-w-full flex-col bg-background dark:bg-card/50 backdrop-blur-md border border-border rounded-xl overflow-hidden transition-all duration-300 shadow-sm dark:shadow-none border-l-4',
                isDragging
                    ? 'z-50 ring-4 ring-primary/20 shadow-2xl scale-105 opacity-50'
                    : isDragPending
                        ? 'ring-2 ring-primary/40 scale-[1.02] shadow-lg'
                        : 'hover:border-primary/40 hover:bg-primary/5 hover:shadow-md dark:hover:border-primary/40 dark:hover:bg-primary/10'
            )}
            style={{
                ...style,
                borderLeftColor: isDragging ? 'var(--theme-primary)' : muscleColor,
            }}
        >
            <div className="flex min-w-0 items-center gap-3 p-3">
                <button {...attributes} {...listeners}
                    className="text-muted-foreground hover:text-primary cursor-grab active:cursor-grabbing p-1.5 -ml-1 rounded-lg hover:bg-muted transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center">
                    <GripVertical className="w-4 h-4" />
                </button>

                <div
                    className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center overflow-hidden bg-muted relative border border-border"
                    style={{ backgroundColor: `color-mix(in srgb, ${muscleColor} 15%, transparent)` }}
                >
                    {thumb ? (
                        <img
                            src={thumb}
                            alt={block.exercise_name}
                            loading="lazy"
                            className={`w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity ${thumb.includes('img.youtube.com') ? '' : 'mix-blend-multiply dark:mix-blend-screen'}`}
                        />
                    ) : (
                        <div className="w-full h-full opacity-20 bg-current"></div>
                    )}
                </div>

                <div
                    className="min-w-0 flex-1 cursor-pointer py-1"
                    onClick={() => !isQuickEditing && onEdit(block)}
                >
                    <div className="break-words font-bold text-xs uppercase leading-snug tracking-widest text-foreground group-hover:text-primary transition-colors pr-1 [overflow-wrap:anywhere]">
                        {block.exercise_name}
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-2 mt-1.5">
                        {isQuickEditing ? (
                            <div
                                className="flex items-center gap-1.5"
                                onClick={e => e.stopPropagation()}
                                onKeyDown={handleQuickKeyDown}
                            >
                                {/* Sets counter */}
                                <div className="flex items-center gap-1 bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">
                                    <button
                                        onClick={() => setQuickSets(s => Math.max(1, s - 1))}
                                        className="text-primary hover:text-primary/70 transition-colors"
                                    >
                                        <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className="text-[10px] font-bold text-foreground w-4 text-center">{quickSets}</span>
                                    <button
                                        onClick={() => setQuickSets(s => Math.min(20, s + 1))}
                                        className="text-primary hover:text-primary/70 transition-colors"
                                    >
                                        <Plus className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                                <span className="text-muted-foreground text-[10px]">×</span>
                                {/* Reps input — font-size 16px en mobile para evitar zoom en iOS */}
                                <input
                                    autoFocus
                                    value={quickReps}
                                    onChange={e => setQuickReps(e.target.value)}
                                    className="w-14 text-[16px] md:text-[10px] font-bold text-center bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary"
                                    placeholder="reps"
                                />
                                <button
                                    onClick={handleQuickSave}
                                    className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded hover:bg-primary/20 transition-colors uppercase tracking-wider"
                                >
                                    OK
                                </button>
                            </div>
                        ) : (
                            <>
                                <span
                                    className={cn(
                                        'shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tight',
                                        currentArea?.badgeClass,
                                    )}
                                    title={currentArea?.name}
                                >
                                    {currentArea?.shortLabel}
                                </span>
                                {typedSummary ? (
                                    <div
                                        className="flex items-center gap-1 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-bold text-foreground"
                                        title={`${EXERCISE_TYPE_LABEL[blockType]}: ${typedSummary}`}
                                    >
                                        <span>{typedSummary}</span>
                                    </div>
                                ) : (block.sets || 0) > 0 && block.reps ? (
                                    <div
                                        className="flex items-center gap-1 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-bold text-foreground cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                                        title="Doble click para editar rápido"
                                        onDoubleClick={onUpdate ? startQuickEdit : undefined}
                                    >
                                        <span>{block.sets}</span>
                                        <span className="text-muted-foreground">×</span>
                                        <span>{block.reps}</span>
                                    </div>
                                ) : (
                                    <div
                                        className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold text-orange-500 cursor-pointer hover:bg-orange-500/20 transition-colors"
                                        onDoubleClick={onUpdate ? startQuickEdit : undefined}
                                    >
                                        INCOMPLETO
                                    </div>
                                )}
                                {block.rest_time && (
                                    <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-bold text-muted-foreground">
                                        ⏱ {block.rest_time}
                                    </div>
                                )}
                                {block.superset_group && (
                                    <div
                                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border cursor-pointer"
                                        style={{
                                            color: 'var(--theme-primary, #007AFF)',
                                            borderColor: 'color-mix(in srgb, var(--theme-primary, #007AFF) 30%, transparent)',
                                            backgroundColor: 'color-mix(in srgb, var(--theme-primary, #007AFF) 10%, transparent)',
                                        }}
                                        onClick={onToggleSuperset ? (e) => { e.stopPropagation(); onToggleSuperset() } : undefined}
                                        title="Quitar de la superserie"
                                    >
                                        SS·{block.superset_group}
                                    </div>
                                )}
                                {block.progression_type && (
                                    <div
                                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                                        title={`Progresión: +${block.progression_value ?? '?'}${block.progression_type === 'weight' ? 'kg/sem' : ' rep/ses'}`}
                                    >
                                        ↑{block.progression_type === 'weight' ? `${block.progression_value ?? '?'}kg` : `${block.progression_value ?? '?'}r`}
                                    </div>
                                )}
                                <div
                                    className="max-w-full truncate px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest text-white shadow-sm"
                                    style={{ backgroundColor: muscleColor }}
                                    title={block.muscle_group}
                                >
                                    {block.muscle_group}
                                </div>
                                {onSetArea && (
                                    <div
                                        className={cn(
                                            'flex shrink-0 items-stretch gap-0.5',
                                            'opacity-100 md:opacity-0 md:group-hover:opacity-100',
                                        )}
                                        onClick={e => e.stopPropagation()}
                                        onPointerDown={e => e.stopPropagation()}
                                    >
                                        <Popover open={areaPickerOpen} onOpenChange={setAreaPickerOpen}>
                                            <PopoverTrigger
                                                type="button"
                                                className={cn(
                                                    'flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 text-[8px] font-black uppercase tracking-tight text-muted-foreground transition-colors',
                                                    'min-h-[28px] md:min-h-0 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                )}
                                                title={`Área: ${currentArea?.name ?? 'Principal'} — cambiar`}
                                                aria-label="Cambiar área del ejercicio"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                {currentArea?.shortLabel}
                                                <ChevronDown className="size-2.5" strokeWidth={3} />
                                            </PopoverTrigger>
                                            <PopoverContent
                                                side="top"
                                                align="end"
                                                sideOffset={6}
                                                className="w-56 border-border p-1.5 shadow-xl"
                                            >
                                                <p className="px-2 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                                                    Mover a área
                                                </p>
                                                <div className="max-h-[min(50vh,16rem)] space-y-0.5 overflow-y-auto">
                                                    {vms.map(area => (
                                                        <button
                                                            key={area.id}
                                                            type="button"
                                                            className={cn(
                                                                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold transition-colors',
                                                                'min-h-[44px] md:min-h-0',
                                                                area.id === areaKey
                                                                    ? 'bg-primary/10 text-primary'
                                                                    : 'text-foreground hover:bg-muted',
                                                            )}
                                                            aria-pressed={area.id === areaKey}
                                                            onClick={() => {
                                                                setAreaPickerOpen(false)
                                                                if (area.id !== areaKey) onSetArea(area.id)
                                                            }}
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                <span
                                                                    className={cn(
                                                                        'rounded border px-1 py-0.5 text-[8px] font-black uppercase tracking-tight',
                                                                        area.badgeClass,
                                                                    )}
                                                                >
                                                                    {area.shortLabel}
                                                                </span>
                                                                <span className="truncate">{area.name}</span>
                                                            </span>
                                                            {area.id === areaKey && <Check className="size-3.5 shrink-0" />}
                                                        </button>
                                                    ))}
                                                </div>
                                                <Link
                                                    href="/coach/settings/areas"
                                                    className="mt-1.5 flex min-h-[44px] items-center justify-center rounded-md border border-dashed border-border px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary md:min-h-[32px]"
                                                >
                                                    Gestionar áreas
                                                </Link>
                                            </PopoverContent>
                                        </Popover>
                                        <Popover open={sectionHelpOpen} onOpenChange={setSectionHelpOpen}>
                                            <PopoverTrigger
                                                type="button"
                                                className={cn(
                                                    'flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors',
                                                    'min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px]',
                                                    'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                )}
                                                aria-label="Ayuda: áreas y superserie"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <CircleHelp className="size-[18px] md:size-3.5" strokeWidth={2} />
                                            </PopoverTrigger>
                                            <PopoverContent
                                                side="top"
                                                align="end"
                                                sideOffset={6}
                                                className="w-[min(calc(100vw-1.5rem),20rem)] max-h-[min(70vh,24rem)] overflow-y-auto border-border p-3 text-xs leading-relaxed shadow-xl"
                                            >
                                                <h4 className="mb-2 font-semibold text-foreground">
                                                    Áreas del día
                                                </h4>
                                                <p className="mb-3 text-muted-foreground">
                                                    Cada día se organiza por <strong className="text-foreground">áreas</strong>{' '}
                                                    (Calentamiento, Principal, Enfriamiento, Movilidad, Potencia…). El badge
                                                    de color muestra el área del ejercicio.
                                                </p>
                                                {narrowLayout ? (
                                                    <p className="mb-3 text-muted-foreground">
                                                        Para mover un ejercicio de área usa el selector{' '}
                                                        <strong className="text-foreground">con la flecha</strong> de este
                                                        bloque. Los ejercicios nuevos se añaden desde el menú inferior del
                                                        catálogo.
                                                    </p>
                                                ) : (
                                                    <p className="mb-3 text-muted-foreground">
                                                        Para mover un ejercicio usa el selector{' '}
                                                        <strong className="text-foreground">con la flecha</strong> de este
                                                        bloque, o arrastra el ejercicio a la{' '}
                                                        <strong className="text-foreground">zona punteada</strong> del área y
                                                        suéltalo ahí.
                                                    </p>
                                                )}
                                                <h4 className="mb-2 font-semibold text-foreground">Superserie</h4>
                                                <p className="mb-2 text-muted-foreground">
                                                    Une el ejercicio con el <strong className="text-foreground">siguiente</strong>{' '}
                                                    de la lista <strong className="text-foreground">solo si ambos están en la
                                                    misma área</strong>: no se puede enlazar, por ejemplo, calentamiento con
                                                    principal. Cada pulsación crea un par (o amplía un tramo contiguo con la
                                                    misma letra). Varios pares en la misma área usan letras distintas (A, B…).
                                                    Cada ejercicio mantiene sus propias series y repeticiones.
                                                </p>
                                                <p className="text-muted-foreground">
                                                    {narrowLayout
                                                        ? 'Si cambias el área de uno de ellos con el selector, el enlace se rompe automáticamente en todos los ejercicios de ese grupo.'
                                                        : 'Si cambias el área de uno de ellos (selector o arrastrando a otra zona), el enlace se rompe automáticamente en todos los ejercicios de ese grupo.'}
                                                </p>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}
                                {showTemplateLink && onToggleOverride && (
                                    <button
                                        type="button"
                                        className={cn(
                                            'px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border transition-colors',
                                            block.is_override
                                                ? 'bg-sky-500/15 border-sky-500/40 text-sky-600 dark:text-sky-400'
                                                : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onToggleOverride()
                                        }}
                                        title={
                                            block.is_override
                                                ? 'Marcado como modificado: no se sobrescribe al sincronizar con plantilla'
                                                : 'Marcar como modificado para excluirlo de la sincronización'
                                        }
                                    >
                                        {block.is_override ? 'Modif.' : 'Base'}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <button onClick={(e) => {
                    e.stopPropagation();
                    onRemove(dayId, block.uid);
                }}
                    aria-label="Eliminar ejercicio"
                    className="p-2.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                >
                    <X className="w-5 h-5 stroke-[2.5px]" />
                </button>
            </div>
        </div>
    )
}

export const ExerciseBlock = React.memo(ExerciseBlockInner)
