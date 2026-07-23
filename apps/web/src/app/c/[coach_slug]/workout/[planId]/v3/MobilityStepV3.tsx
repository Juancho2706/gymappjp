'use client'

import { useEffect, useState } from 'react'
import { Move, Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogSetForm, type SetSyncResult } from '../LogSetForm'
import { formatTypedObjective, type OptimisticLogPayload } from '@eva/workout-engine'
import type { BlockType, ExerciseType, WorkoutSessionLog } from '../WorkoutExecutionClient'
import { ExecTypedMedia } from './ExecTypedMedia'
import { useExecCountdown, formatCountdown } from './useExecCountdown'

interface MobilityStepV3Props {
    block: BlockType
    exercise: ExerciseType
    firstUnlogged: number | null
    doneCount: number
    blockLogs: WorkoutSessionLog[]
    autoTimerEnabled: boolean
    reopenSignal: { blockId: string; setNumber: number; nonce: number } | null
    substitution?: { exerciseId: string; exerciseName: string; reason: string } | null
    openTechnique: (exercise: ExerciseType | null) => void
    handleLogged: (payload: OptimisticLogPayload) => void
    handleResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
}

/**
 * Ejecutor V3 (E3.2) — pantalla de MOVILIDAD, tono sereno (acento recovery/aqua fijo en ambos temas,
 * decisión Ola 0). Traducción del mockup `concepto-a-v3-tipos` (pantalla Movilidad): identidad + media
 * calmada, anillo de HOLD grande que se llena lineal (sin rebotes) reusando la disciplina de conteo del
 * `HoldTimer` existente (endTime-based, beep + haptic al llegar a 0), y — cuando el bloque es
 * `side_mode='per_side'` — SECUENCIA lado izquierdo → (haptic) → lado derecho. Sin RPE/RIR (no aplican).
 *
 * INTOCABLE: el registro va por el `LogSetForm` tipado REUSADO (capa de guardado/cola/reconciliación
 * intacta). En per_side, ese form captura DOS holds (`hold_left_sec`/`hold_right_sec`) que el engine
 * suma en `actual_hold_sec` + arma `metadata {left_sec,right_sec}`. El anillo es la GUÍA visual/háptica;
 * las filas son el registro. `bilateral` (u otro side_mode) = un solo hold, flujo de siempre.
 */
export function MobilityStepV3({
    block,
    exercise,
    firstUnlogged,
    doneCount,
    blockLogs,
    autoTimerEnabled,
    reopenSignal,
    substitution,
    openTechnique,
    handleLogged,
    handleResult,
}: MobilityStepV3Props) {
    const coachNote = block.notes?.trim() || null
    const perSide = block.side_mode === 'per_side'
    const holdSeconds = block.duration_sec ?? 0
    const activeSet = firstUnlogged ?? block.sets
    // Lado activo (per_side): arranca izquierdo; al terminar el hold del izquierdo, salta al derecho.
    const [side, setSide] = useState<'left' | 'right'>('left')
    // Segundos sostenidos por lado (QA4): el anillo los vuelca en la fila activa al completar/detener cada
    // lado. `hpNonce` dispara el prefill uncontrolled de `LogSetForm` (revisar y confirmar; NO toca submit).
    const [timed, setTimed] = useState<{ left?: number; right?: number; single?: number }>({})
    const [hpNonce, setHpNonce] = useState(0)
    // Registra el hold de un lado y empuja el prefill a la fila activa.
    const recordSide = (key: 'left' | 'right' | 'single', seconds: number) => {
        setTimed((t) => ({ ...t, [key]: seconds }))
        setHpNonce((n) => n + 1)
    }

    // Al pasar a la siguiente serie, el ciclo de lados vuelve a empezar por el izquierdo y se limpia lo medido.
    useEffect(() => {
        setSide('left')
        setTimed({})
    }, [activeSet])

    const countdown = useExecCountdown(holdSeconds, {
        // Eyes-free (mockup): el segundo lado arranca solo tras el primero; el primero lo inicia el alumno.
        autoStart: perSide && side === 'right',
        resetKey: `${activeSet}-${side}`,
        onDone: () => {
            // Completó el hold: vuelca el objetivo íntegro al input del lado y (per_side) avanza al derecho.
            if (perSide) {
                if (side === 'left') { recordSide('left', holdSeconds); setSide('right') }
                else recordSide('right', holdSeconds)
            } else {
                recordSide('single', holdSeconds)
            }
        },
    })

    // Segundos efectivamente sostenidos AHORA (completado ⇒ objetivo; detenido antes ⇒ lo transcurrido).
    const heldSecondsNow = () => (countdown.done ? holdSeconds : Math.max(0, holdSeconds - countdown.timeLeft) || holdSeconds)

    const DASH = 2 * Math.PI * 92
    const dashoffset = DASH * (1 - countdown.frac)

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
            </div>

            {/* Media calmada — mismo tratamiento que fuerza: chips "Instrucciones" + "Nota del coach" DENTRO
                de la media (overlay superior-izquierdo), precedencia + audio en video (QA4). */}
            <ExecTypedMedia
                exercise={exercise}
                note={coachNote}
                openTechnique={openTechnique}
                className="exec-v3-media-calm"
                fallbackIcon={<Move className="h-9 w-9" />}
            />

            {/* Anillo de HOLD (guía). Sólo si el coach prescribió duración. */}
            {holdSeconds > 0 && (
                <div className="flex flex-col items-center gap-2.5">
                    {perSide && (
                        <div className="exec-v3-sidepill" aria-live="polite">
                            <span className="exec-v3-sidedot" aria-hidden />
                            Lado {side === 'left' ? 'izquierdo' : 'derecho'}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={countdown.done ? countdown.restart : countdown.toggle}
                        className="exec-v3-holdwrap"
                        aria-label={
                            countdown.done
                                ? 'Reiniciar el hold'
                                : countdown.isActive
                                    ? 'Pausar el hold'
                                    : 'Iniciar el hold'
                        }
                    >
                        <svg className="exec-v3-hold-svg" viewBox="0 0 208 208" aria-hidden>
                            <circle cx="104" cy="104" r="92" className="exec-v3-hold-track" fill="none" strokeWidth="23" />
                            <circle
                                cx="104"
                                cy="104"
                                r="92"
                                className="exec-v3-hold-fill"
                                fill="none"
                                strokeWidth="23"
                                strokeLinecap="round"
                                strokeDasharray={DASH}
                                strokeDashoffset={dashoffset}
                            />
                        </svg>
                        <div className="exec-v3-holdtxt">
                            <div className={cn('exec-v3-holdnum tabular-nums', countdown.done && 'is-done')}>
                                {countdown.done ? '¡Listo!' : formatCountdown(countdown.timeLeft)}
                            </div>
                            {/* Affordance de tap DENTRO del anillo (QA4): Play/Pause 18px justo bajo el número. */}
                            <span className="exec-v3-hold-icon" aria-hidden>
                                {countdown.done ? (
                                    <RotateCcw className="h-[18px] w-[18px]" />
                                ) : countdown.isActive ? (
                                    <Pause className="h-[18px] w-[18px]" />
                                ) : (
                                    <Play className="h-[18px] w-[18px]" />
                                )}
                            </span>
                            {/* El estado "Sostén" se removió del centro (decisión CEO): el estado vive en el
                                texto guía de abajo; el centro sólo lleva número + affordance + guía de tap. */}
                            {!countdown.isActive && (
                                <div className="exec-v3-holdlbl">
                                    {countdown.done ? 'Registra abajo' : 'Tocar para iniciar'}
                                </div>
                            )}
                        </div>
                    </button>

                    {perSide && (
                        <p className="exec-v3-then">
                            {side === 'left' ? (
                                <>luego: <b>lado derecho</b></>
                            ) : (
                                <>último lado — <b>registra los dos holds</b></>
                            )}
                        </p>
                    )}

                    {/* CTA juicy "Listo este lado" (como RN): avance eyes-free del lado; en el último, pausa. */}
                    {firstUnlogged != null && (
                        <button
                            type="button"
                            onClick={() => {
                                // Vuelca lo sostenido en la fila y avanza (per_side izq → der) o pausa (último lado).
                                if (perSide && side === 'left') { recordSide('left', heldSecondsNow()); setSide('right') }
                                else {
                                    recordSide(perSide ? 'right' : 'single', heldSecondsNow())
                                    if (countdown.isActive) countdown.toggle()
                                }
                            }}
                            className="exec-v3-juicy exec-v3-mob-cta"
                        >
                            {perSide && side === 'left' ? 'Listo este lado' : 'Listo'}
                        </button>
                    )}
                </div>
            )}

            {/* Registro tipado REUSADO — captura de siempre (per_side ⇒ dos holds → metadata). */}
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
                            targetReps={block.reps}
                            autoTimerEnabled={autoTimerEnabled}
                            mode="mobility"
                            typedObjective={formatTypedObjective(block, 'mobility')}
                            sideMode={block.side_mode}
                            isActive={setNumber === firstUnlogged}
                            holdPrefill={
                                setNumber === activeSet
                                    ? { holdSec: timed.single, leftSec: timed.left, rightSec: timed.right, nonce: hpNonce }
                                    : undefined
                            }
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
