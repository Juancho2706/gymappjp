'use client'

import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Minus, Plus, CircleHelp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getMuscleColor } from '../muscle-colors'
import type { BuilderBlock, BuilderSection } from '../types'

function blockSection(b: BuilderBlock): BuilderSection {
    return b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main'
}

const SECTION_SHORT: Record<BuilderSection, string> = {
    warmup: 'CAL',
    main: 'PRI',
    cooldown: 'ENF',
}

const SECTION_FULL: Record<BuilderSection, string> = {
    warmup: 'Calentamiento',
    main: 'Principal',
    cooldown: 'Enfriamiento',
}

function sectionBadgeClass(sec: BuilderSection): string {
    if (sec === 'warmup') {
        return 'border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-100'
    }
    if (sec === 'cooldown') {
        return 'border-sky-500/40 bg-sky-500/12 text-sky-900 dark:text-sky-100'
    }
    return 'border-primary/35 bg-primary/10 text-primary'
}

interface ExerciseBlockProps {
    block: BuilderBlock
    dayId: number
    onEdit: (block: BuilderBlock) => void
    onRemove: (dayId: number, uid: string) => void
    onUpdate?: (block: BuilderBlock) => void
    onToggleSuperset?: () => void
    onSetSection?: (section: BuilderSection) => void
    onToggleOverride?: () => void
    /** Muestra badge Base/Modif. cuando hay plantilla vinculada */
    showTemplateLink?: boolean
    /** Indica que el drag está en periodo de delay (300ms TouchSensor) */
    isDragPending?: boolean
    /** Viewport estrecho: ayuda y textos sin mencionar arrastrar a zonas de sección */
    narrowLayout?: boolean
}

function ExerciseBlockInner({
    block, dayId, onEdit, onRemove, onUpdate, onToggleSuperset,
    onSetSection, onToggleOverride, showTemplateLink, isDragPending, narrowLayout = false,
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

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    }

    const muscleColor = getMuscleColor(block.muscle_group)

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
                    {block.gif_url || (block.video_url && !block.video_url.includes('youtube') && !block.video_url.includes('youtu.be')) ? (
                        <img
                            src={block.gif_url || block.video_url!}
                            alt={block.exercise_name}
                            loading="lazy"
                            className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-screen opacity-90 group-hover:opacity-100 transition-opacity"
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
                                        sectionBadgeClass(blockSection(block)),
                                    )}
                                    title={SECTION_FULL[blockSection(block)]}
                                >
                                    {SECTION_SHORT[blockSection(block)]}
                                </span>
                                {(block.sets || 0) > 0 && block.reps ? (
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
                                {onSetSection && (
                                    <div
                                        className={cn(
                                            'flex shrink-0 items-stretch gap-0.5',
                                            'opacity-100 md:opacity-0 md:group-hover:opacity-100',
                                        )}
                                        onClick={e => e.stopPropagation()}
                                        onPointerDown={e => e.stopPropagation()}
                                    >
                                        <div
                                            className="flex shrink-0 rounded-md overflow-hidden border border-border transition-opacity"
                                            role="group"
                                            aria-label="Mover ejercicio de sección"
                                        >
                                            {(['warmup', 'main', 'cooldown'] as const).map(s => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    className={cn(
                                                        'min-h-[28px] min-w-[2.25rem] px-1 py-0.5 text-[8px] font-black uppercase tracking-tight transition-colors md:min-h-0 md:min-w-0',
                                                        blockSection(block) === s
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                                                    )}
                                                    title={
                                                        s === 'warmup'
                                                            ? 'Mover a calentamiento'
                                                            : s === 'main'
                                                              ? 'Mover a bloque principal'
                                                              : 'Mover a enfriamiento'
                                                    }
                                                    aria-label={
                                                        s === 'warmup'
                                                            ? 'Mover a calentamiento'
                                                            : s === 'main'
                                                              ? 'Mover a bloque principal'
                                                              : 'Mover a enfriamiento'
                                                    }
                                                    aria-pressed={blockSection(block) === s}
                                                    onClick={() => onSetSection(s)}
                                                >
                                                    {SECTION_SHORT[s]}
                                                </button>
                                            ))}
                                        </div>
                                        <Popover open={sectionHelpOpen} onOpenChange={setSectionHelpOpen}>
                                            <PopoverTrigger
                                                type="button"
                                                className={cn(
                                                    'flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors',
                                                    'min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px]',
                                                    'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                )}
                                                aria-label="Ayuda: secciones y superserie"
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
                                                    Secciones del día (CAL / PRI / ENF)
                                                </h4>
                                                <ul className="mb-3 list-disc space-y-1 pl-4 text-muted-foreground">
                                                    <li>
                                                        <strong className="text-foreground">CAL</strong> (
                                                        {SECTION_FULL.warmup}): prepara el cuerpo y las articulaciones
                                                        antes del trabajo intenso.
                                                    </li>
                                                    <li>
                                                        <strong className="text-foreground">PRI</strong> (
                                                        {SECTION_FULL.main}): bloque principal del entreno (volumen e
                                                        intensidad).
                                                    </li>
                                                    <li>
                                                        <strong className="text-foreground">ENF</strong> (
                                                        {SECTION_FULL.cooldown}): bajar pulsaciones y recuperación
                                                        ligera al final.
                                                    </li>
                                                </ul>
                                                {narrowLayout ? (
                                                    <p className="mb-3 text-muted-foreground">
                                                        Para cambiar de sección usa los botones{' '}
                                                        <strong className="text-foreground">CAL</strong>,{' '}
                                                        <strong className="text-foreground">PRI</strong> y{' '}
                                                        <strong className="text-foreground">ENF</strong> en este bloque.
                                                        Los ejercicios nuevos se añaden desde el menú inferior del
                                                        catálogo.
                                                    </p>
                                                ) : (
                                                    <p className="mb-3 text-muted-foreground">
                                                        También puedes arrastrar el ejercicio a las zonas punteadas de{' '}
                                                        <strong className="text-foreground">Calentamiento</strong>,{' '}
                                                        <strong className="text-foreground">Principal</strong> o{' '}
                                                        <strong className="text-foreground">Enfriamiento</strong> y
                                                        soltarlo ahí.
                                                    </p>
                                                )}
                                                <h4 className="mb-2 font-semibold text-foreground">Superserie</h4>
                                                <p className="mb-2 text-muted-foreground">
                                                    Une el ejercicio con el <strong className="text-foreground">siguiente</strong>{' '}
                                                    de la lista <strong className="text-foreground">solo si ambos están en la
                                                    misma sección</strong> (CAL, PRI o ENF): no se puede enlazar calentamiento
                                                    con principal. Cada pulsación crea un par (o amplía un tramo contiguo con
                                                    la misma letra). Varios pares en la misma sección usan letras distintas (
                                                    A, B…). Cada ejercicio mantiene sus propias series y repeticiones.
                                                </p>
                                                <p className="text-muted-foreground">
                                                    {narrowLayout
                                                        ? 'Si cambias la sección de uno de ellos con los botones CAL/PRI/ENF, el enlace se rompe automáticamente en todos los ejercicios de ese grupo.'
                                                        : 'Si cambias la sección de uno de ellos (botones CAL/PRI/ENF o arrastrando a otra zona), el enlace se rompe automáticamente en todos los ejercicios de ese grupo.'}
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
