'use client'

import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Keyboard, Pencil, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogSetForm, type SetSyncResult } from '../LogSetForm'
import type { OptimisticLogPayload } from '@eva/workout-engine'
import type { ExerciseType as WorkoutKind } from '@/domain/workout/types'
import {
    type BlockType,
    type ExerciseType,
    type WorkoutSessionLog,
    RUT_TYPE_META,
} from '../WorkoutExecutionClient'
import { ExecMediaCard } from './ExecMediaCard'
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
    /** ¿Se puede sustituir el ejercicio (máquina ocupada)? Fuerza sin series aún (informe 09, BLOCKER). */
    canSubstitute?: boolean
    /** Abre el sheet "Máquina ocupada" para este bloque (mismo handler del padre; sólo si `canSubstitute`). */
    onOpenSubstitute?: () => void
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
    canSubstitute,
    onOpenSubstitute,
    handleLogged,
    handleResult,
}: ExerciseStepV3Props) {
    // Pie: el lápiz revela las series anteriores (chips) para corregirlas; el teclado enfoca el valor activo.
    const [showPrev, setShowPrev] = useState(false)
    const heroWrapRef = useRef<HTMLDivElement>(null)
    const note = block.notes?.trim() || null

    // Deshacer (reopenSignal): la serie a corregir vive tras el lápiz — al reabrirla, mostramos el panel.
    useEffect(() => {
        if (reopenSignal?.blockId === block.id) setShowPrev(true)
    }, [reopenSignal, block.id])

    // Teclado del pie: enfoca el valor de peso de la serie activa (el foco abre el keypad tras el fix 14).
    const focusActiveValue = () => {
        const input = heroWrapRef.current?.querySelector<HTMLInputElement>(
            '.exec-v3-slot.is-active input[name="weight_kg"]',
        )
        input?.focus()
    }

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

            {/* Media SIEMPRE visible + chips glass colapsables (componente compartido con la superserie) */}
            <ExecMediaCard exercise={exercise} note={note} openTechnique={openTechnique} />

            {/* Prescripción compacta (mockup a3a-rx: "4 × 8 · 60 kg · RIR 2 · desc 90s", sin extras) */}
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
                    <span className="exec-v3-prev-l">Anterior</span>
                    <span className="exec-v3-prev-r tabular-nums">
                        {bestPrev.weight_kg ? `${bestPrev.weight_kg} kg` : '-'} × {bestPrev.reps_done || '-'}
                    </span>
                    {firstUnlogged != null && <span className="exec-v3-prev-tap">1 tap ↻</span>}
                </button>
            )}

            {/* Pista de la captura dual (E2.5): "Tap = teclado · Mantén presionado = rueda" — 1 sola vez. */}
            <WheelHint />

            {/* Captura HERO (informe 03): sólo la serie ACTIVA se ve como el mockup (tiles + esfuerzo + CTA).
                Las anteriores (chips) sólo con el lápiz (data-showprev); las futuras quedan ocultas. TODOS
                los LogSetForm siguen montados y estables (reconciliación de cola/optimismo intacta) — sólo
                cambia su visibilidad por CSS. */}
            <div
                ref={heroWrapRef}
                className="exec-v3-herowrap exec-v3-setlist space-y-1.5"
                data-showprev={showPrev ? '' : undefined}
            >
                {Array.from({ length: block.sets }).map((_, i) => {
                    const setNumber = i + 1
                    const log = blockLogs.find((entry) => entry.set_number === setNumber)
                    const slot =
                        setNumber === firstUnlogged ? 'is-active' : log ? 'is-prev' : 'is-future'
                    return (
                        <div key={`${block.id}-${setNumber}`} className={cn('exec-v3-slot', slot)}>
                            <LogSetForm
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
                                heroV3
                                onLogged={handleLogged}
                                onResult={handleResult}
                            />
                        </div>
                    )
                })}
            </div>

            {/* Pie: cuadraditos de serie (izq) + herramientas teclado/lápiz (der) — mockup a3a-foot */}
            <div className="exec-v3-foot">
                <div className="exec-v3-sets">
                    {Array.from({ length: block.sets }).map((_, i) => (
                        <span key={i} className={cn('exec-v3-sq', i < doneCount && 'is-on')} />
                    ))}
                    <span className="exec-v3-setlbl tabular-nums">
                        {doneCount}/{block.sets}
                    </span>
                </div>
                <div className="exec-v3-tools">
                    {canSubstitute && onOpenSubstitute && (
                        <button
                            type="button"
                            className="exec-v3-tool"
                            onClick={onOpenSubstitute}
                            aria-label="Cambiar ejercicio (máquina ocupada)"
                        >
                            <Repeat className="h-[16px] w-[16px]" aria-hidden />
                        </button>
                    )}
                    <button
                        type="button"
                        className="exec-v3-tool"
                        onClick={focusActiveValue}
                        aria-label="Abrir teclado para la serie activa"
                    >
                        <Keyboard className="h-[18px] w-[18px]" aria-hidden />
                    </button>
                    <button
                        type="button"
                        className="exec-v3-tool"
                        data-on={showPrev ? '' : undefined}
                        onClick={() => setShowPrev((v) => !v)}
                        aria-pressed={showPrev}
                        aria-label="Editar series anteriores"
                    >
                        <Pencil className="h-[15px] w-[15px]" aria-hidden />
                    </button>
                </div>
            </div>
        </div>
    )
}
