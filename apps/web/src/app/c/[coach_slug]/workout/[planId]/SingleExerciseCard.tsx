'use client'

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info, ChevronDown, Play, CheckCircle2, TrendingUp, History, Quote, ArrowRightLeft, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { springs } from '@/lib/animation-presets'
import { formatRelativeDate } from '@/lib/date-utils'
import type { ExerciseType as WorkoutKind } from '@/domain/workout/types'
import { LogSetForm, type SetSyncResult } from './LogSetForm'
import { formatTypedObjective, type SupersetGroupRow, type OptimisticLogPayload } from '@eva/workout-engine'
import type { ClientCardioView } from './_data/workout-execution.queries'
// Primitivos/tipos compartidos con el resto de la exec (SupersetGroupCard los reusa) → se importan
// del cliente padre. El import cruzado es render-time-only (ambos módulos solo los usan dentro del
// render), así que no hay ciclo de evaluación de módulo; los tipos van con `import type` (borrados).
import {
    type BlockType,
    type ExerciseType,
    type WorkoutSessionLog,
    RUT_TYPE_META,
    TypeGlyph,
    TypedTargetGrid,
    TypedBlockTimerButton,
    TypedLogHeader,
    Sep,
} from './WorkoutExecutionClient'

/** Historial previo por serie (elemento de `previousHistory[exerciseId]`). */
type PrevSet = { weight_kg: number | null; reps_done: number | null; date: string }
/** Prefill "= última vez" por bloque (mismo shape que `fillByBlock` del padre). */
type FillEntry = { weight: number | null; reps: number | null; nonce: number; setNumber: number }

interface SingleExerciseCardProps {
    /** Bloque suelto (no superserie) a renderizar. */
    block: BlockType
    /** Índice del bloque dentro del grupo (para la etiqueta SS-N del header). */
    blockIndex: number
    /** Grupo contiguo al que pertenece el bloque (para `group.type`/`group.supersetLetter`). */
    group: SupersetGroupRow<BlockType>
    /** Ejercicio resuelto del bloque (ya des-envuelto por el padre; nunca null acá). */
    exercise: ExerciseType
    /** Tipo efectivo del bloque (strength ⇒ render clásico). */
    effType: WorkoutKind
    /** Foco de la card (marcador de progreso — decisión CEO: sin atenuar). */
    focus: 'active' | 'upcoming' | 'done'
    /** ¿El bloque está completo? */
    complete: boolean
    /** Series ya registradas del bloque (para los dots de progreso). */
    doneCount: number
    /** Primera serie sin registrar (serie activa / destino del prefill). */
    firstUnlogged: number | null
    /** Peso objetivo efectivo (sobrecarga progresiva). */
    suggestedWeightKg: number | null
    /** Chip compacto de sobrecarga (null ⇒ sin chip). */
    overloadLabel: string | null
    /** Explicación completa de la sobrecarga (va a Detalles). */
    overloadDetail: string | null
    /** Cue de técnica inline (1ª instrucción del ejercicio). */
    cueLine: string | null
    /** ¿La card tiene sección "Detalles" (técnica/nota/historial)? */
    hasDetails: boolean
    /** Estado del disclosure "Detalles" de este bloque. */
    detailsOpen: boolean
    /** Historial previo completo del ejercicio (para Detalles). */
    prevList: PrevSet[]
    /** Mejor sesión previa (para "Última vez" + autollenado). */
    bestPrev: PrevSet | null
    /** ¿El objetivo de hoy iguala/supera la mejor marca previa? */
    beatIt: boolean
    /** Logs de la sesión de ESTE bloque (para pre-poblar cada fila). */
    blockLogs: WorkoutSessionLog[]
    /** Máximos históricos por ejercicio (umbral de PR inline). */
    exerciseMaxes: Record<string, number>
    /** Prefill "= última vez" por bloque. */
    fillByBlock: Record<string, FillEntry>
    /** Señal de "Deshacer" (reabre la última serie logueada). */
    reopenSignal: { blockId: string; setNumber: number; nonce: number } | null
    /** Zonas cardio personalizadas del alumno. */
    cardio?: ClientCardioView
    /** Auto-timer del descanso (preferencia persistida). */
    autoTimerEnabled: boolean
    /** Reduced-motion (viene del padre para no duplicar el hook). */
    reducedMotion: boolean | null
    /** Refs por bloque para el auto-scroll (Map del padre; misma manipulación inline que antes). */
    blockRefs: MutableRefObject<Map<string, HTMLDivElement>>
    /** Toggle del disclosure "Detalles". */
    toggleDetails: (id: string) => void
    /** Toggle del colapso de un ejercicio completado. */
    toggleExpandDone: (key: string) => void
    /** Setter del prefill "= última vez". */
    setFillByBlock: Dispatch<SetStateAction<Record<string, FillEntry>>>
    /** Abre el modal de técnica. */
    openTechnique: (exercise: ExerciseType | null) => void
    /**
     * Sustitución de máquina ocupada (Fase L · C). `exercise` (prop de arriba) YA es el sustituto
     * cuando hay una activa (el padre hace el override) → la card, el gif y la técnica muestran el
     * sustituto sin cambios acá; estos campos sólo agregan el badge, el disparador y el thread al log.
     */
    substitution?: { exerciseId: string; exerciseName: string; reason: string; prescribedName: string } | null
    /** ¿Se puede sustituir/deshacer? (solo strength, antes del 1er set logueado — NG-5). */
    canSubstitute?: boolean
    /** Abre el bottom-sheet de sustitución para este bloque. */
    onOpenSubstitute?: () => void
    /** Deshace la sustitución (solo si aún no hay sets logueados). */
    onUndoSubstitution?: () => void
    /** Log optimista + guía/scroll (handler del padre). */
    handleLogged: (payload: OptimisticLogPayload) => void
    /** Reconciliación del optimismo (resultado REAL del server). */
    handleResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
}

/**
 * Card de un ejercicio suelto (no superserie) de la ejecución. Extraída 1:1 del render inline de
 * `WorkoutExecutionClient` (prerequisito duro DA-4 del modo stepper): mismo JSX, mismas clases,
 * mismos handlers. Todos los valores derivados los calcula el `.map` del padre y viajan por props
 * (dependen del estado del padre: `sessionLogs`, `openDetails`, `fillByBlock`, …). El motor de
 * logging/offline/progresión vive en `LogSetForm` + los handlers del padre — este componente es 100%
 * presentación. NO usa hooks (componente puro), así el orden de hooks del padre no cambia.
 */
export function SingleExerciseCard({
    block,
    blockIndex,
    group,
    exercise,
    effType,
    focus,
    complete,
    doneCount,
    firstUnlogged,
    suggestedWeightKg,
    overloadLabel,
    overloadDetail,
    cueLine,
    hasDetails,
    detailsOpen,
    prevList,
    bestPrev,
    beatIt,
    blockLogs,
    exerciseMaxes,
    fillByBlock,
    reopenSignal,
    cardio,
    autoTimerEnabled,
    reducedMotion,
    blockRefs,
    toggleDetails,
    toggleExpandDone,
    setFillByBlock,
    openTechnique,
    substitution,
    canSubstitute,
    onOpenSubstitute,
    onUndoSubstitution,
    handleLogged,
    handleResult,
}: SingleExerciseCardProps) {
    return (
        <motion.div
            layout={!reducedMotion}
            ref={(el) => {
                if (el) blockRefs.current.set(block.id, el)
                else blockRefs.current.delete(block.id)
            }}
            transition={reducedMotion ? { duration: 0 } : springs.smooth}
            style={focus === 'active' ? { boxShadow: '0 8px 32px -14px color-mix(in srgb, var(--sport-500) 60%, transparent)' } : undefined}
            className={cn(
                'rounded-card border bg-white/[0.03] p-4 space-y-3 relative',
                focus === 'active'
                    ? 'border-[var(--sport-500)]/50'
                    : focus === 'done'
                        ? 'border-[var(--sport-500)]/30'
                        : 'border-[var(--border-inverse)]'
            )}
        >
            <div className="space-y-2">
                {/* Fila silenciosa: tipo · músculo  +  acciones (Detalles, técnica) */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold">
                        <TypeGlyph kind={effType} className="h-3.5 w-3.5 shrink-0" />
                        <span className="shrink-0" style={{ color: RUT_TYPE_META[effType].color }}>{RUT_TYPE_META[effType].label}</span>
                        <span className="text-on-dark-muted/40">·</span>
                        <span className="truncate font-semibold text-on-dark-muted">
                            {group.type === 'superset'
                                ? `${group.supersetLetter ?? 'SS'}-${blockIndex + 1} · ${exercise.muscle_group}`
                                : exercise.muscle_group}
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {hasDetails && (
                            <button
                                type="button"
                                onClick={() => toggleDetails(block.id)}
                                aria-expanded={detailsOpen}
                                className="flex h-8 items-center gap-1 rounded-control px-2 text-[11px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark"
                            >
                                <Info className="h-3.5 w-3.5" /> Detalles
                                <ChevronDown className={cn('h-3 w-3 transition-transform', detailsOpen && 'rotate-180')} />
                            </button>
                        )}
                        {effType === 'strength' && canSubstitute && !substitution && onOpenSubstitute && (
                            <button
                                type="button"
                                onClick={onOpenSubstitute}
                                className="flex h-8 items-center gap-1 rounded-control px-2 text-[11px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark"
                                aria-label={`Cambiar ${exercise.name} — máquina ocupada`}
                            >
                                <ArrowRightLeft className="h-3.5 w-3.5" /> Cambiar
                            </button>
                        )}
                        {(exercise.gif_url || exercise.video_url) && (
                            <button
                                type="button"
                                onClick={() => openTechnique(exercise)}
                                className="flex h-8 items-center gap-1 rounded-control bg-white/[0.06] px-2.5 text-[11px] font-bold text-on-dark transition-colors hover:bg-white/[0.12]"
                                aria-label={`Ver técnica de ${exercise.name}`}
                            >
                                <Play className="h-3 w-3 fill-current" /> Técnica
                            </button>
                        )}
                    </div>
                </div>
                {/* Sustitución activa (Fase L · C): badge "Sustituido" + deshacer mientras no haya sets. */}
                {substitution && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ember-500)]/30 bg-[var(--ember-500)]/[0.12] px-2.5 py-1 text-[11px] font-bold text-[var(--ember-200)]">
                            <ArrowRightLeft className="h-3 w-3" />
                            Sustituido · máquina ocupada
                        </span>
                        <span className="text-[11px] text-on-dark-muted">
                            en vez de <span className="font-semibold text-on-dark">{substitution.prescribedName}</span>
                        </span>
                        {canSubstitute && onUndoSubstitution && (
                            <button
                                type="button"
                                onClick={onUndoSubstitution}
                                className="ml-auto inline-flex h-8 items-center gap-1 rounded-control px-2 text-[11px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark"
                                aria-label="Deshacer la sustitución"
                            >
                                <Undo2 className="h-3.5 w-3.5" /> Deshacer
                            </button>
                        )}
                    </div>
                )}
                {/* Nombre + dots de progreso de series (o check al completar) */}
                <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 flex-1 font-display text-[22px] font-black leading-[1.1] tracking-[-0.02em] text-on-dark">{exercise.name}</h3>
                    {complete ? (
                        <motion.button
                            type="button"
                            onClick={() => toggleExpandDone(block.id)}
                            initial={reducedMotion ? false : { scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={reducedMotion ? { duration: 0 } : springs.elastic}
                            className="shrink-0 text-[var(--sport-400)]"
                            aria-label="Colapsar ejercicio completado"
                        >
                            <CheckCircle2 className="w-7 h-7" />
                        </motion.button>
                    ) : (
                        <div className="flex shrink-0 items-center gap-1 pt-2">
                            {Array.from({ length: block.sets }).map((_, i) => (
                                <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < doneCount ? 'bg-[var(--sport-400)]' : 'bg-white/15')} />
                            ))}
                            <span className="ml-1 font-mono text-[11px] tabular-nums text-on-dark-muted">{doneCount}/{block.sets}</span>
                        </div>
                    )}
                </div>
            </div>
            {effType === 'strength' ? (
                <>
                    {/* Línea de prescripción + chip compacto de sobrecarga */}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[13px] font-semibold text-on-dark">
                            <span>{block.sets} × {block.reps}</span>
                            {block.target_weight_kg != null && (<><Sep /><span>{suggestedWeightKg ?? block.target_weight_kg} kg</span></>)}
                            {block.rest_time && (<><Sep /><span className="text-on-dark-muted">desc {block.rest_time}</span></>)}
                            {block.tempo && (<><Sep /><span className="text-on-dark-muted">tempo {block.tempo}</span></>)}
                            {block.rir && (<><Sep /><span className="text-on-dark-muted">RIR {block.rir}</span></>)}
                        </div>
                        {overloadLabel && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sport-500)]/30 bg-[var(--sport-500)]/[0.10] px-2 py-0.5 text-[11px] font-bold text-[var(--sport-300)]">
                                <TrendingUp className="h-3 w-3" /> {overloadLabel}
                            </span>
                        )}
                    </div>
                    {/* "La vez anterior" inline (muted) — tap autollena la serie activa (quick-win E2-3/8) */}
                    {bestPrev && (
                        <button
                            type="button"
                            onClick={() => {
                                if (firstUnlogged == null) return
                                setFillByBlock((prev) => ({
                                    ...prev,
                                    [block.id]: { weight: bestPrev.weight_kg, reps: bestPrev.reps_done, nonce: Date.now(), setNumber: firstUnlogged },
                                }))
                            }}
                            disabled={firstUnlogged == null}
                            className="flex min-h-[40px] w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control py-1 text-left text-[11px] transition-colors enabled:hover:bg-white/[0.05] enabled:active:scale-[0.99] disabled:cursor-default"
                            aria-label={firstUnlogged != null && bestPrev.weight_kg ? `Autollenar la serie activa con ${bestPrev.weight_kg} kg por ${bestPrev.reps_done ?? '-'} reps` : undefined}
                        >
                            <History className="h-3.5 w-3.5 shrink-0 text-on-dark-muted" />
                            <span className="font-semibold text-on-dark-muted">Última vez:</span>
                            <span className="font-mono font-bold text-on-dark">
                                {bestPrev.weight_kg ? `${bestPrev.weight_kg}kg` : '-'} × {bestPrev.reps_done || '-'}
                            </span>
                            {beatIt && (
                                <span className="inline-flex items-center gap-1 font-bold text-[var(--sport-300)]">
                                    <TrendingUp className="h-3 w-3" /> Superá tu marca
                                </span>
                            )}
                            {firstUnlogged != null && (
                                <span className="ml-auto shrink-0 font-bold text-[var(--sport-300)]">= usar</span>
                            )}
                        </button>
                    )}
                    {/* Cue de técnica inline (1 línea, muted) — el resto en Detalles */}
                    {cueLine && (
                        <p className="line-clamp-1 text-[12px] leading-snug text-on-dark-muted">{cueLine}</p>
                    )}
                </>
            ) : (
                <>
                    <TypedTargetGrid block={block} kind={effType} cardio={cardio} />
                    <div className="flex justify-end">
                        <TypedBlockTimerButton block={block} kind={effType} />
                    </div>
                </>
            )}
            {/* Detalles (disclosure): técnica completa + nota del coach + sobrecarga + historial */}
            <AnimatePresence initial={false}>
                {detailsOpen && (
                    <motion.div
                        initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                        transition={reducedMotion ? { duration: 0 } : { duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-3 rounded-card border border-[var(--border-inverse)] bg-white/[0.02] p-3">
                            {effType !== 'strength' && block.instructions && (
                                <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Instrucciones</p>
                                    <p className="text-[12px] leading-relaxed text-on-dark/90">{block.instructions}</p>
                                </div>
                            )}
                            {effType === 'strength' && exercise.instructions && exercise.instructions.length > 0 && (
                                <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Técnica</p>
                                    <ol className="space-y-1">
                                        {exercise.instructions.map((step, i) => (
                                            <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-on-dark/90">
                                                <span className="font-mono text-on-dark-muted">{i + 1}.</span>
                                                <span>{step.replace(/^Step:\d+\s*/i, '')}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            )}
                            {block.notes && (
                                <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Nota del coach</p>
                                    <p className="flex gap-2 text-[12px] leading-relaxed text-on-dark/90">
                                        <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-on-dark-muted" />
                                        {block.notes}
                                    </p>
                                </div>
                            )}
                            {effType === 'strength' && overloadDetail && (
                                <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Sobrecarga progresiva</p>
                                    <p className="text-[12px] leading-relaxed text-on-dark/90">{overloadDetail}</p>
                                </div>
                            )}
                            {prevList.length > 0 && (
                                <div>
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Historial</p>
                                    <ul className="space-y-0.5">
                                        {prevList.slice(0, 5).map((s, i) => (
                                            <li key={i} className="flex justify-between font-mono text-[11px] text-on-dark-muted">
                                                <span>{formatRelativeDate(s.date)}</span>
                                                <span className="text-on-dark">{s.weight_kg ? `${s.weight_kg}kg` : '-'} × {s.reps_done || '-'}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {effType === 'strength' ? (
                <div className="space-y-1.5">
                    {Array.from({ length: block.sets }).map((_, i) => {
                        const setNumber = i + 1
                        const log = blockLogs.find((entry) => entry.set_number === setNumber)
                        return (
                            <LogSetForm
                                key={`${block.id}-${setNumber}`}
                                blockId={block.id}
                                setNumber={setNumber}
                                restTimeStr={block.rest_time}
                                warmupRestTimeStr={block.warmup_rest_time}
                                totalSets={block.sets}
                                nextUpLabel={exercise.name}
                                existingLog={log}
                                suggestedWeightKg={suggestedWeightKg}
                                prThresholdKg={exerciseMaxes[exercise.id] ?? null}
                                targetReps={block.reps}
                                lastSet={bestPrev ? { weightKg: bestPrev.weight_kg, reps: bestPrev.reps_done } : null}
                                autoTimerEnabled={autoTimerEnabled}
                                mode={effType}
                                isActive={setNumber === firstUnlogged}
                                prefill={fillByBlock[block.id]?.setNumber === setNumber ? fillByBlock[block.id] : undefined}
                                reopenNonce={reopenSignal?.blockId === block.id && reopenSignal?.setNumber === setNumber ? reopenSignal.nonce : undefined}
                                substitution={substitution ? { exerciseId: substitution.exerciseId, exerciseName: substitution.exerciseName, reason: substitution.reason } : null}
                                onLogged={handleLogged}
                                onResult={handleResult}
                            />
                        )
                    })}
                </div>
            ) : (
                <div className="rounded-card border border-[var(--border-inverse)] bg-white/[0.02] p-2">
                    <TypedLogHeader kind={effType} />
                    <div className="space-y-1 pt-2">
                        {Array.from({ length: block.sets }).map((_, i) => {
                            const setNumber = i + 1
                            const log = blockLogs.find((entry) => entry.set_number === setNumber)
                            return (
                                <LogSetForm
                                    key={`${block.id}-${setNumber}`}
                                    blockId={block.id}
                                    setNumber={setNumber}
                                    restTimeStr={block.rest_time}
                                    nextUpLabel={exercise.name}
                                    existingLog={log}
                                    suggestedWeightKg={suggestedWeightKg}
                                    autoTimerEnabled={autoTimerEnabled}
                                    mode={effType}
                                    isActive={setNumber === firstUnlogged}
                                    typedObjective={formatTypedObjective(block, effType)}
                                    onLogged={handleLogged}
                                    onResult={handleResult}
                                />
                            )
                        })}
                    </div>
                </div>
            )}
        </motion.div>
    )
}
