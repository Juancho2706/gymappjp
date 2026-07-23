'use client'

import { useEffect, useRef, useState } from 'react'
import { GitCommit, Minus, Plus, Timer, X } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { LogSetForm, type SetSyncResult } from '../LogSetForm'
import { useWorkoutTimer } from '../WorkoutTimerProvider'
import { triggerHaptic } from '@/lib/client/haptics'
import { useCoarsePointer } from '@/lib/client/useCoarsePointer'
import { useWorkoutKeypad } from '../WorkoutKeypadProvider'
import { formatTypedObjective, type OptimisticLogPayload } from '@eva/workout-engine'
import type { BlockType, ExerciseType, WorkoutSessionLog } from '../WorkoutExecutionClient'
import { ExecTypedMedia } from './ExecTypedMedia'
import { SingleWheelPicker } from './DualWheelPicker'

interface RollerStepV3Props {
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
 * Ejecutor V3 (E3.3) — pantalla de ROLLER, simple y táctil (acento recovery/aqua sereno). Traducción
 * del mockup `concepto-a-v3-tipos` (pantalla Roller): contador de pasadas GIGANTE con +1/−1 y tick
 * háptico, pensado para usarse desde el suelo sin escribir. El contador pre-rellena las pasadas de la
 * serie activa del `LogSetForm` tipado REUSADO (capa de guardado intacta: escribe `reps_done`), y el
 * cronómetro OPCIONAL reusa el `Stopwatch` existente (motor de conteo intacto, presentación de chip).
 */
export function RollerStepV3({
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
}: RollerStepV3Props) {
    const coachNote = block.notes?.trim() || null
    const { startStopwatch } = useWorkoutTimer()
    const activeSet = firstUnlogged ?? block.sets
    const activeLog = blockLogs.find((l) => l.set_number === activeSet)
    const goalPasses = block.reps_unit === 'passes' ? block.reps_value ?? null : null

    // Edición directa del número (QA4 · como los tiles de fuerza): tap = teclado numérico, mantener =
    // rueda. Reusa el keypad custom y la rueda del ejecutor (gate por puntero grueso, igual que fuerza);
    // en desktop (puntero fino) el número no es editable por gesto (se usan +1/−1 y la fila de abajo).
    const coarse = useCoarsePointer()
    const keypad = useWorkoutKeypad()
    const useKeypad = coarse && keypad != null
    const reducedMotion = useReducedMotion()
    const passesInputRef = useRef<HTMLInputElement>(null)
    const [wheelOpen, setWheelOpen] = useState(false)
    // Gesto tap-vs-mantener sobre el número (mismo patrón que kg/reps de fuerza: 400ms, cancel >16px).
    const pressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: boolean }>({
        timer: null,
        x: 0,
        y: 0,
        fired: false,
    })

    // Contador de pasadas de la serie activa. Arranca del log existente (edición) o 0. Se reinicia al
    // cambiar de serie activa. Cada cambio empuja un prefill tipado a la fila (reps_done, uncontrolled).
    const [passes, setPasses] = useState<number>(activeLog?.reps_done ?? 0)
    const [prefillNonce, setPrefillNonce] = useState(0)
    // Nonce del micro-rebote del número: sólo sube al SUMAR (el pop del mockup salta al añadir pasada).
    const [pop, setPop] = useState(0)
    const perSide = block.side_mode === 'per_side'

    useEffect(() => {
        setPasses(activeLog?.reps_done ?? 0)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSet])

    const bump = (delta: number) => {
        setPasses((prev) => {
            const next = Math.max(0, prev + delta)
            if (next !== prev) triggerHaptic(delta > 0 ? 30 : 20)
            return next
        })
        setPrefillNonce((n) => n + 1)
        if (delta > 0) setPop((n) => n + 1)
    }

    // Fija el número directo (teclado/rueda) y prefilla la fila activa — mismo camino que +1/−1, sin pop.
    const setPassesTo = (n: number) => {
        const next = Math.max(0, Math.round(n))
        setPasses(next)
        setPrefillNonce((k) => k + 1)
    }

    // El teclado custom muta `passesInputRef.value` + despacha `input`; este listener nativo lo refleja
    // en el estado (mismo mecanismo uncontrolled que el autollenado de fuerza). No hay bucle: el input
    // es uncontrolled y sólo se re-siembra al abrir el teclado.
    useEffect(() => {
        const el = passesInputRef.current
        if (!el) return
        const onInput = () => {
            const n = Number(el.value.replace(',', '.'))
            if (Number.isFinite(n)) setPassesTo(n)
        }
        el.addEventListener('input', onInput)
        return () => el.removeEventListener('input', onInput)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Tap en el número → teclado numérico custom con un solo campo "Pasadas" (reusa el provider del keypad).
    const openKeypadForPasses = () => {
        if (!useKeypad || !keypad) return
        if (passesInputRef.current) passesInputRef.current.value = String(passes)
        keypad.openKeypad({
            fields: [{ key: 'reps_done', label: 'Pasadas', unit: 'pasadas', allowDecimal: false }],
            fieldRefs: { reps_done: passesInputRef },
            initialFieldKey: 'reps_done',
            target: { exerciseName: exercise.name, objective: goalPasses != null ? `${goalPasses} pasadas` : undefined },
            requestSubmit: () => keypad.closeKeypad(),
        })
    }

    // Gesto del número (mismo patrón que kg/reps de fuerza): mantener 400ms → rueda; tap corto → teclado.
    const onNumPointerDown = (e: React.PointerEvent) => {
        if (!coarse) return
        const p = pressRef.current
        if (p.timer) clearTimeout(p.timer)
        p.fired = false
        p.x = e.clientX
        p.y = e.clientY
        try {
            e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
            /* sin captura: seguimos */
        }
        p.timer = setTimeout(() => {
            p.fired = true
            p.timer = null
            keypad?.closeKeypad()
            triggerHaptic(12)
            setWheelOpen(true)
        }, 400)
    }
    const onNumPointerMove = (e: React.PointerEvent) => {
        const p = pressRef.current
        if (p.timer && (Math.abs(e.clientX - p.x) > 16 || Math.abs(e.clientY - p.y) > 16)) {
            clearTimeout(p.timer)
            p.timer = null
        }
    }
    const onNumPointerUp = () => {
        const p = pressRef.current
        if (p.timer) {
            clearTimeout(p.timer)
            p.timer = null
            if (!p.fired) openKeypadForPasses()
        }
    }
    const onNumPointerCancel = () => {
        const p = pressRef.current
        if (p.timer) {
            clearTimeout(p.timer)
            p.timer = null
        }
    }

    return (
        <div className="exec-v3-step exec-v3-calm space-y-3">
            {/* Nombre + chips */}
            <div className="text-center">
                <h2 className="exec-v3-exname">{exercise.name}</h2>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <span className="exec-v3-chip">Roller</span>
                    <span className="exec-v3-chip is-plain">{exercise.muscle_group}</span>
                </div>
            </div>

            {/* Media — mismo tratamiento que fuerza: chips "Instrucciones" + "Nota del coach" DENTRO de la
                media (overlay superior-izquierdo), precedencia + audio en video (QA4). */}
            <ExecTypedMedia
                exercise={exercise}
                note={coachNote}
                openTechnique={openTechnique}
                className="exec-v3-media-calm"
                fallbackIcon={<GitCommit className="h-9 w-9" />}
            />

            {goalPasses != null && (
                <p className="exec-v3-rollgoal tabular-nums">
                    Objetivo: <b>{goalPasses} pasadas</b>
                    {perSide ? ' por lado' : ''}
                </p>
            )}

            {/* Contador VERTICAL (mockup): número gigante EDITABLE (tap teclado · mantener rueda) → "de N"
                → "Pasadas" → avisito descartable la primera vez. */}
            <div className="exec-v3-counter">
                {coarse ? (
                    <button
                        type="button"
                        key={pop}
                        className="exec-v3-bignumber exec-v3-bignumber-btn tabular-nums"
                        aria-live="polite"
                        aria-label={`${passes} pasadas — toca para escribir, mantén para la rueda`}
                        onPointerDown={onNumPointerDown}
                        onPointerMove={onNumPointerMove}
                        onPointerUp={onNumPointerUp}
                        onPointerCancel={onNumPointerCancel}
                        onPointerLeave={onNumPointerCancel}
                    >
                        {passes}
                    </button>
                ) : (
                    <div key={pop} className="exec-v3-bignumber tabular-nums" aria-live="polite">
                        {passes}
                    </div>
                )}
                {goalPasses != null && <div className="exec-v3-goalof tabular-nums">de {goalPasses}</div>}
                <div className="exec-v3-counter-lbl">Pasadas</div>
                {coarse && <RollerNumberHint />}
                {/* Input que el teclado custom muta (listener nativo → estado). Visualmente oculto pero CON
                    layout (junto al número) para que el auto-scroll del keypad apunte al número, no al tope. */}
                <input
                    ref={passesInputRef}
                    aria-hidden
                    tabIndex={-1}
                    readOnly
                    defaultValue={String(passes)}
                    style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                />
            </div>

            {/* Fila de DOS botones (GOTCHA repo: jamás dos w-full en fila → cada uno flex-1): +1 héroe
                (juicy, más alto) + −1 destructivo rojo para corregir. */}
            <div className="exec-v3-rollbtns">
                <button
                    type="button"
                    onClick={() => bump(1)}
                    className="exec-v3-juicy exec-v3-plusbtn"
                    aria-label="Sumar una pasada"
                >
                    <span className="exec-v3-plusbadge" aria-hidden>
                        <Plus className="h-5 w-5" strokeWidth={3} />
                    </span>
                    +1 pasada
                </button>
                <button
                    type="button"
                    onClick={() => bump(-1)}
                    disabled={passes <= 0}
                    className="exec-v3-minusred"
                    aria-label="Restar una pasada"
                >
                    <Minus className="h-5 w-5" strokeWidth={3} aria-hidden />
                    −1 pasada
                </button>
            </div>

            {/* Cronómetro OPCIONAL — reusa el Stopwatch existente. */}
            <div className="flex justify-center">
                <button type="button" onClick={() => startStopwatch()} className="exec-v3-timerchip">
                    <Timer className="h-4 w-4" aria-hidden />
                    Cronómetro
                    <span className="exec-v3-opt">Opcional</span>
                </button>
            </div>

            {/* Registro tipado REUSADO — el contador prefilla las pasadas de la serie activa. */}
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
                            mode="roller"
                            typedObjective={formatTypedObjective(block, 'roller')}
                            isActive={setNumber === firstUnlogged}
                            typedPrefill={setNumber === activeSet ? { repsDone: passes, nonce: prefillNonce } : undefined}
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

            {/* Rueda de pasadas (mantener el número) — reusa la rueda del ejecutor en modo de un valor. */}
            {coarse && (
                <SingleWheelPicker
                    open={wheelOpen}
                    onOpenChange={setWheelOpen}
                    value={passes}
                    spec={{ step: 1, min: 0, max: 100 }}
                    label="Pasadas"
                    title="Pasadas"
                    subtitle={goalPasses != null ? `Objetivo: ${goalPasses}${perSide ? ' por lado' : ''}` : exercise.name}
                    onDone={(v) => {
                        setPassesTo(v)
                        setWheelOpen(false)
                    }}
                    reducedMotion={reducedMotion}
                />
            )}
        </div>
    )
}

const ROLLER_HINT_KEY = 'eva:roller-hint-v1'

/**
 * Avisito descartable (QA4 · roller) — se muestra UNA sola vez (persistido en localStorage) la primera
 * vez que el alumno llega al roller V3 táctil: "Tocá el número para escribirlo · mantené para la rueda".
 * Se persiste al mostrarse (cuenta como visto) y se descarta con la ✕. Carril propio, separado del hint
 * de la rueda de fuerza (`eva:wheel-hint-v1`).
 */
function RollerNumberHint() {
    const [show, setShow] = useState(false)
    useEffect(() => {
        try {
            if (localStorage.getItem(ROLLER_HINT_KEY)) return
        } catch {
            return
        }
        setShow(true)
        try {
            localStorage.setItem(ROLLER_HINT_KEY, '1')
        } catch {
            /* private mode: se mostrará de nuevo, aceptable */
        }
    }, [])

    if (!show) return null
    return (
        <div className="exec-v3-wheelhint" role="note">
            <span>
                <b>Tocá el número</b> para escribirlo · <b>mantené</b> para la rueda
            </span>
            <button
                type="button"
                onClick={() => setShow(false)}
                aria-label="Entendido, ocultar aviso"
                className="exec-v3-wheelhint-x"
            >
                <X className="h-3.5 w-3.5" aria-hidden />
            </button>
        </div>
    )
}
