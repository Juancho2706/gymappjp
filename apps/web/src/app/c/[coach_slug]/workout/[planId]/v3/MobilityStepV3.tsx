'use client'

import { useEffect, useState } from 'react'
import { Move } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogSetForm, type HoldPrefill, type SetSyncResult } from '../LogSetForm'
import { formatTypedObjective, sessionLogKey, type OptimisticLogPayload, type RepeatSeedEntry } from '@eva/workout-engine'
import type { BlockType, ExerciseType, WorkoutSessionLog } from '../WorkoutExecutionClient'
import { parseRestTime, useWorkoutTimer } from '../WorkoutTimerProvider'
import { BlockActionsV3 } from './SkipBlockV3'
import { ExecTypedMedia } from './ExecTypedMedia'
import { HoldModuleV3, type HoldModuleStatus } from './HoldModuleV3'
import { RestOfferV3 } from './RestOfferV3'

interface MobilityStepV3Props {
    block: BlockType
    exercise: ExerciseType
    firstUnlogged: number | null
    doneCount: number
    blockLogs: WorkoutSessionLog[]
    /**
     * Semilla de "repetir el día" indexada por `(block_id, set_number)` (engine `buildRepeatSeedMap`):
     * pre-llena los holds registrados esa fecha. No marca nada como registrado. Ausente ⇒ sesión normal.
     */
    seedByKey?: Map<string, RepeatSeedEntry>
    autoTimerEnabled: boolean
    reopenSignal: { blockId: string; setNumber: number; nonce: number } | null
    substitution?: { exerciseId: string; exerciseName: string; reason: string } | null
    openTechnique: (exercise: ExerciseType | null) => void
    /** ¿Se puede sustituir el ejercicio? (mockup 3: «Cambiar» ya no es exclusivo de fuerza). */
    canSubstitute?: boolean
    /** Abre el sheet "Máquina ocupada" para este bloque (sólo si `canSubstitute`). */
    onOpenSubstitute?: () => void
    /** Abre el sheet «Omitir hoy» (mockup 3). Ausente ⇒ el bloque ya está completo. */
    onSkip?: () => void
    handleLogged: (payload: OptimisticLogPayload) => void
    handleResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
}

/**
 * Ejecutor V3 (E3.2) — pantalla de MOVILIDAD, tono sereno (acento recovery/aqua fijo en ambos temas,
 * decisión Ola 0): identidad + media calmada, anillo de HOLD grande y —en `per_side`— secuencia lado
 * izquierdo → derecho. Sin RPE/RIR (no aplican).
 *
 * Tren «cuenta atrás en pantalla» (W4.12/W4.13): el anillo es el `HoldModuleV3` (214 px, V1) y a 0 la
 * serie **se guarda sola** (V2) por `holdPrefill.submit` → `requestSubmit()` del `LogSetForm`; el
 * arranque es un botón grande «Iniciar hold» (punto B del mockup, paridad RN) y «Listo» antes de 0
 * guarda lo transcurrido con `hold_source = 'manual'`. La fila del registro NUNCA se desmonta mientras
 * el módulo está montado (R26): corriendo se deshabilita (`inert`), no se oculta. Tras guardar, con la
 * preferencia «Pasar solo al descanso» APAGADA aparece «Descansar N s» / «Siguiente serie» (R24); con
 * la preferencia ENCENDIDA el `LogSetForm` arranca el descanso como siempre.
 *
 * INTOCABLE: el registro va por el `LogSetForm` tipado REUSADO (capa de guardado/cola/reconciliación
 * intacta). En per_side captura DOS holds (`hold_left_sec`/`hold_right_sec`) que el engine suma en
 * `actual_hold_sec` + arma `metadata {left_sec,right_sec, hold_source}`.
 */
export function MobilityStepV3({
    block,
    exercise,
    firstUnlogged,
    doneCount,
    blockLogs,
    seedByKey,
    autoTimerEnabled,
    reopenSignal,
    substitution,
    openTechnique,
    canSubstitute,
    onOpenSubstitute,
    onSkip,
    handleLogged,
    handleResult,
}: MobilityStepV3Props) {
    const coachNote = block.notes?.trim() || null
    const perSide = block.side_mode === 'per_side'
    const holdSeconds = block.duration_sec ?? 0
    const activeSet = firstUnlogged ?? block.sets
    const restSeconds = parseRestTime(block.rest_time)
    const { startRest } = useWorkoutTimer()

    // Lo que midió el módulo para la serie activa → `holdPrefill` de su fila (uncontrolled, por nonce).
    const [holdPrefill, setHoldPrefill] = useState<HoldPrefill | null>(null)
    const [holdStatus, setHoldStatus] = useState<HoldModuleStatus>('idle')
    // R24: tras guardar con la preferencia OFF, el par «Descansar N s» / «Siguiente serie».
    const [restOffer, setRestOffer] = useState<{ setNumber: number; seconds: number } | null>(null)
    useEffect(() => {
        setHoldPrefill(null)
    }, [activeSet])

    const onLogged = (payload: OptimisticLogPayload) => {
        handleLogged(payload)
        if (!autoTimerEnabled) setRestOffer({ setNumber: payload.setNumber, seconds: restSeconds })
    }
    const startOfferedRest = () => {
        if (!restOffer) return
        startRest(String(restOffer.seconds), { label: exercise.name })
        setRestOffer(null)
    }

    const running = holdStatus === 'running'

    return (
        <div className="exec-v3-step exec-v3-calm space-y-3">
            {/* Nombre + chips (centrado, sereno) */}
            <div className="text-center">
                <h2 className="exec-v3-exname">{exercise.name}</h2>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <span className="exec-v3-chip">Movilidad · {exercise.muscle_group}</span>
                    <span className="exec-v3-mobset tabular-nums">
                        Serie {activeSet} de {block.sets}
                    </span>
                </div>
                {/* Salida digna del paso activo (mockup 3): el bloque de movilidad que Iván no podía
                    hacer ya no queda sin opciones. */}
                <BlockActionsV3
                    className="mt-2 justify-center"
                    onOpenSubstitute={canSubstitute ? onOpenSubstitute : undefined}
                    onSkip={onSkip}
                />
            </div>

            {/* Media calmada — mismo tratamiento que fuerza: chips "Instrucciones" + "Nota del coach" DENTRO
                de la media (overlay superior-izquierdo), precedencia + audio en video (QA4). NUNCA se colapsa. */}
            <ExecTypedMedia
                exercise={exercise}
                note={coachNote}
                openTechnique={openTechnique}
                className="exec-v3-media-calm"
                fallbackIcon={<Move className="h-9 w-9" />}
            />

            {/* Módulo de hold (guía que guarda sola a 0). Predicado R29: sólo si el coach prescribió duración;
                sin `duration_sec` la fila manual de siempre queda tal cual, sin anillo ni CTA. */}
            {holdSeconds > 0 && firstUnlogged != null && (
                <HoldModuleV3
                    kind="mobility"
                    size="solo214"
                    blockId={block.id}
                    prescribedSec={holdSeconds}
                    sideMode={block.side_mode}
                    context="solo"
                    closesRound={false}
                    resetKey={`${block.id}:${activeSet}:1`}
                    onMeasured={(m) =>
                        setHoldPrefill({ holdSec: m.holdSec, leftSec: m.leftSec, rightSec: m.rightSec, submit: m.submit, source: m.source, nonce: m.nonce })
                    }
                    onStatusChange={setHoldStatus}
                    testIdPrefix="hold-mobility"
                />
            )}

            {restOffer && !autoTimerEnabled && (
                <RestOfferV3
                    seconds={restOffer.seconds}
                    onRest={startOfferedRest}
                    onNext={() => setRestOffer(null)}
                    testIdPrefix="rest-offer-mobility"
                />
            )}

            {/* Registro tipado REUSADO — captura de siempre (per_side ⇒ dos holds → metadata). R8/R26: con el
                reloj corriendo se deshabilita (`inert`), nunca se desmonta: el `<form>` de la fila activa es el
                destino del auto-envío. */}
            <div className={cn('exec-v3-setlist space-y-1.5', running && 'opacity-55')} inert={running ? true : undefined}>
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
                            seed={seedByKey?.get(sessionLogKey(block.id, setNumber))}
                            targetReps={block.reps}
                            autoTimerEnabled={autoTimerEnabled}
                            mode="mobility"
                            typedObjective={formatTypedObjective(block, 'mobility')}
                            sideMode={block.side_mode}
                            isActive={setNumber === firstUnlogged}
                            holdPrefill={setNumber === activeSet && holdPrefill ? holdPrefill : undefined}
                            reopenNonce={
                                reopenSignal?.blockId === block.id && reopenSignal?.setNumber === setNumber
                                    ? reopenSignal.nonce
                                    : undefined
                            }
                            substitution={substitution ?? null}
                            v3
                            onLogged={onLogged}
                            onResult={handleResult}
                        />
                    )
                })}
            </div>

            {/* Pie: cuadritos de serie */}
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
        </div>
    )
}
