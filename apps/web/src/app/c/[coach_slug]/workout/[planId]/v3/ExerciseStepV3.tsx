'use client'

import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import Image from 'next/image'
import { AlignLeft, MessageSquare, Play, Dumbbell, TrendingUp, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LogSetForm, type SetSyncResult } from '../LogSetForm'
import type { OptimisticLogPayload } from '@eva/workout-engine'
import type { ExerciseType as WorkoutKind } from '@/domain/workout/types'
import {
    type BlockType,
    type ExerciseType,
    type WorkoutSessionLog,
    RUT_TYPE_META,
} from '../WorkoutExecutionClient'
import { resolveExecMedia } from './exec-media'
import { WheelHint } from './WheelHint'

/** Mejor sesión previa (para "Anterior" + autollenado). */
type PrevSet = { weight_kg: number | null; reps_done: number | null; date: string }
/** Prefill "= última vez" por bloque (mismo shape que `fillByBlock` del padre). */
type FillEntry = { weight: number | null; reps: number | null; nonce: number; setNumber: number }

interface ExerciseStepV3Props {
    block: BlockType
    exercise: ExerciseType
    /** Tipo efectivo (siempre 'strength' en este camino; se usa sólo para la etiqueta y `mode`). */
    effType: WorkoutKind
    /** Peso objetivo efectivo (sobrecarga progresiva). */
    suggestedWeightKg: number | null
    /** Chip compacto de sobrecarga (null ⇒ sin chip). */
    overloadLabel: string | null
    /** Mejor sesión previa (fila "Anterior" + `lastSet` del LogSetForm). */
    bestPrev: PrevSet | null
    /** Primera serie sin registrar (serie activa / destino del prefill). */
    firstUnlogged: number | null
    /** Series ya registradas (dots del pie). */
    doneCount: number
    /** Logs de la sesión de ESTE bloque. */
    blockLogs: WorkoutSessionLog[]
    /** Máximos históricos por ejercicio (umbral de PR inline). */
    exerciseMaxes: Record<string, number>
    /** Prefill "= última vez" por bloque (entrada del padre). */
    fillEntry?: FillEntry
    /** Setter del prefill "= última vez" (autollenado 1-tap de "Anterior"). */
    setFillByBlock: Dispatch<SetStateAction<Record<string, FillEntry>>>
    /** Señal de "Deshacer" (reabre la última serie logueada). */
    reopenSignal: { blockId: string; setNumber: number; nonce: number } | null
    /** Sustitución activa (se pasa tal cual al LogSetForm). */
    substitution?: { exerciseId: string; exerciseName: string; reason: string } | null
    /** Auto-timer del descanso. */
    autoTimerEnabled: boolean
    /** Abre el modal de técnica existente (chip "Instrucciones" y placeholder YouTube). */
    openTechnique: (exercise: ExerciseType | null) => void
    /** Log optimista + guía/scroll (handler del padre — superficie de resiliencia intocada). */
    handleLogged: (payload: OptimisticLogPayload) => void
    /** Reconciliación del optimismo (resultado REAL del server). */
    handleResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
}

/**
 * Ejecutor V3 (E2.4) — presentación del paso STRENGTH en el stepper (modo V3). Traducción del mockup
 * `concepto-a-v3-core` (pantalla Fuerza): nombre + chip, MEDIA siempre visible con chips glass
 * "Instrucciones" / "Nota del coach" que entran extendidos y colapsan a solo-icono (~1,2 s vía CSS;
 * reduced-motion los deja extendidos), prescripción compacta + chip sobrecarga, fila "Anterior"
 * tappable de 1-tap (reusa el autollenado `fillByBlock` del padre) y el `LogSetForm` REUSADO tal cual
 * como superficie de captura/resiliencia (inputs/keypad/RPE-RIR/recap sin bifurcar).
 *
 * Sólo re-estiliza contenedores vía clases scoped `[data-exec-v3]`; NO toca la lógica de guardado /
 * draft / cola. El chip "Instrucciones" y el placeholder de YouTube abren el modal de técnica del
 * padre; "Nota del coach" abre un sheet local con `block.notes`.
 */
export function ExerciseStepV3({
    block,
    exercise,
    effType,
    suggestedWeightKg,
    overloadLabel,
    bestPrev,
    firstUnlogged,
    doneCount,
    blockLogs,
    exerciseMaxes,
    fillEntry,
    setFillByBlock,
    reopenSignal,
    substitution,
    autoTimerEnabled,
    openTechnique,
    handleLogged,
    handleResult,
}: ExerciseStepV3Props) {
    const [noteOpen, setNoteOpen] = useState(false)
    const media = resolveExecMedia(exercise)
    const note = block.notes?.trim() || null
    const hasInstructions = (exercise.instructions?.length ?? 0) > 0 || media.kind !== 'none'
    const beatIt =
        bestPrev?.weight_kg != null &&
        bestPrev.weight_kg > 0 &&
        suggestedWeightKg != null &&
        suggestedWeightKg >= bestPrev.weight_kg

    const autofillActive = () => {
        if (firstUnlogged == null || !bestPrev) return
        setFillByBlock((prev) => ({
            ...prev,
            [block.id]: {
                weight: bestPrev.weight_kg,
                reps: bestPrev.reps_done,
                nonce: Date.now(),
                setNumber: firstUnlogged,
            },
        }))
    }

    return (
        <div className="exec-v3-step space-y-3">
            {/* Nombre + chip tipo · músculo */}
            <div>
                <h2 className="exec-v3-exname">{exercise.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                    <span className="exec-v3-chip">
                        {RUT_TYPE_META[effType].label} · {exercise.muscle_group}
                    </span>
                </div>
            </div>

            {/* Media SIEMPRE visible + chips glass colapsables */}
            <div className="exec-v3-media">
                <div className="exec-v3-mediachips" key={firstUnlogged ?? 'done'}>
                    {hasInstructions && (
                        <button
                            type="button"
                            className="exec-v3-mchip"
                            onClick={() => openTechnique(exercise)}
                            aria-label={`Instrucciones de ${exercise.name}`}
                        >
                            <AlignLeft className="h-3.5 w-3.5" aria-hidden />
                            <span className="exec-v3-mlabel">Instrucciones</span>
                        </button>
                    )}
                    {note && (
                        <button
                            type="button"
                            className="exec-v3-mchip"
                            onClick={() => setNoteOpen(true)}
                            aria-label="Nota del coach"
                        >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                            <span className="exec-v3-mlabel">Nota del coach</span>
                            <span className="exec-v3-badge" aria-hidden />
                        </button>
                    )}
                </div>

                {media.kind === 'video' && (
                    <video
                        src={media.src}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-full w-full object-contain"
                    />
                )}
                {media.kind === 'image' && (
                    <Image src={media.src} alt={exercise.name} fill unoptimized className="object-contain" />
                )}
                {media.kind === 'youtube' && (
                    <button
                        type="button"
                        onClick={() => openTechnique(exercise)}
                        className="exec-v3-media-yt"
                        aria-label={`Ver video de ${exercise.name}`}
                    >
                        <span className="exec-v3-media-play">
                            <Play className="h-6 w-6 fill-current" aria-hidden />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider">Ver video</span>
                    </button>
                )}
                {media.kind === 'none' && (
                    <div className="exec-v3-media-empty" aria-hidden>
                        <Dumbbell className="h-9 w-9" />
                    </div>
                )}
            </div>

            {/* Prescripción compacta + chip de sobrecarga */}
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
                <div className="exec-v3-rx tabular-nums">
                    {block.sets} × {block.reps}
                    {block.target_weight_kg != null && (
                        <>
                            {' · '}
                            <b>{suggestedWeightKg ?? block.target_weight_kg} kg</b>
                        </>
                    )}
                    {block.rir && <> · RIR {block.rir}</>}
                    {block.rest_time && <> · desc {block.rest_time}</>}
                </div>
                {overloadLabel && (
                    <span className="exec-v3-overload">
                        <TrendingUp className="h-3 w-3" aria-hidden /> {overloadLabel}
                    </span>
                )}
            </div>

            {/* "Anterior" 1-tap → autollena la serie activa (mecanismo existente del padre) */}
            {bestPrev && (
                <button
                    type="button"
                    onClick={autofillActive}
                    disabled={firstUnlogged == null}
                    className="exec-v3-prev"
                    aria-label={
                        firstUnlogged != null && bestPrev.weight_kg
                            ? `Autollenar la serie activa con ${bestPrev.weight_kg} kg por ${bestPrev.reps_done ?? '-'} reps`
                            : undefined
                    }
                >
                    <History className="h-3.5 w-3.5 shrink-0 text-on-dark-muted" aria-hidden />
                    <span className="exec-v3-prev-l">Anterior</span>
                    <span className="exec-v3-prev-r tabular-nums">
                        {bestPrev.weight_kg ? `${bestPrev.weight_kg} kg` : '-'} × {bestPrev.reps_done || '-'}
                    </span>
                    {beatIt && (
                        <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-bold text-[color:var(--exec-brand)]">
                            <TrendingUp className="h-3 w-3" aria-hidden /> Supera tu marca
                        </span>
                    )}
                    {firstUnlogged != null && <span className="exec-v3-prev-tap">1 tap ↻</span>}
                </button>
            )}

            {/* Pista de la captura dual (E2.5): "Tap = teclado · Mantén presionado = rueda" — 1 sola vez. */}
            <WheelHint />

            {/* LogSetForm REUSADO tal cual — superficie de captura/resiliencia (inputs/keypad/RPE-RIR/recap) */}
            <div className="exec-v3-setlist space-y-1.5">
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
                            prefill={fillEntry?.setNumber === setNumber ? fillEntry : undefined}
                            reopenNonce={
                                reopenSignal?.blockId === block.id && reopenSignal?.setNumber === setNumber
                                    ? reopenSignal.nonce
                                    : undefined
                            }
                            substitution={substitution ?? null}
                            v3
                            onLogged={handleLogged}
                            onResult={handleResult}
                        />
                    )
                })}
            </div>

            {/* Pie: cuadritos de serie (resumen del mockup) */}
            <div className="exec-v3-foot">
                <div className="exec-v3-sets">
                    {Array.from({ length: block.sets }).map((_, i) => (
                        <span key={i} className={cn('exec-v3-sq', i < doneCount && 'is-on')} />
                    ))}
                    <span className="exec-v3-setlbl tabular-nums">
                        {doneCount}/{block.sets}
                    </span>
                </div>
            </div>

            {/* Nota del coach — sheet local (block.notes) */}
            <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
                <DialogContent className="max-w-sm rounded-sheet border-border bg-card p-6">
                    <DialogHeader>
                        <DialogTitle className="font-display text-lg font-bold">Nota del coach</DialogTitle>
                    </DialogHeader>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{note}</p>
                    <button
                        type="button"
                        onClick={() => setNoteOpen(false)}
                        className="mt-6 w-full rounded-control bg-secondary py-3 font-bold text-secondary-foreground"
                    >
                        Entendido
                    </button>
                </DialogContent>
            </Dialog>
        </div>
    )
}
