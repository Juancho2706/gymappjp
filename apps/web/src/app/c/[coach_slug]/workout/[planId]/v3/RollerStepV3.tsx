'use client'

import { useEffect, useState } from 'react'
import { GitCommit, Minus, Plus, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogSetForm, type SetSyncResult } from '../LogSetForm'
import { useWorkoutTimer } from '../WorkoutTimerProvider'
import { triggerHaptic } from '@/lib/client/haptics'
import { formatTypedObjective, type OptimisticLogPayload } from '@eva/workout-engine'
import type { BlockType, ExerciseType, WorkoutSessionLog } from '../WorkoutExecutionClient'
import { ExecTypedMedia } from './ExecTypedMedia'
import { CoachNoteChip } from './CoachNoteV3'

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

            {/* Media — mismo tratamiento que fuerza (precedencia + chip "Instrucciones" + audio en video). */}
            <ExecTypedMedia
                exercise={exercise}
                openTechnique={openTechnique}
                className="exec-v3-media-calm"
                fallbackIcon={<GitCommit className="h-9 w-9" />}
                liveLabel="En loop"
            />

            {/* Nota del coach (todos los tipos) — chip de acento (recovery aqua en calm) + sheet compartida */}
            {coachNote && (
                <div className="flex justify-center">
                    <CoachNoteChip note={coachNote} />
                </div>
            )}

            {goalPasses != null && (
                <p className="exec-v3-rollgoal tabular-nums">
                    Objetivo: <b>{goalPasses} pasadas</b>
                    {perSide ? ' por lado' : ''}
                </p>
            )}

            {/* Contador VERTICAL (mockup): número gigante → "de N" → "Pasadas". */}
            <div className="exec-v3-counter">
                <div key={pop} className="exec-v3-bignumber tabular-nums" aria-live="polite">
                    {passes}
                </div>
                {goalPasses != null && <div className="exec-v3-goalof tabular-nums">de {goalPasses}</div>}
                <div className="exec-v3-counter-lbl">Pasadas</div>
            </div>

            {/* Botón HÉROE "+1 pasada" (juicy gigante full-width) — la acción de la pantalla. */}
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

            {/* "−1" discreto para corregir. */}
            <div className="flex justify-center">
                <button
                    type="button"
                    onClick={() => bump(-1)}
                    disabled={passes <= 0}
                    className="exec-v3-minusghost"
                    aria-label="Restar una pasada"
                >
                    <Minus className="h-4 w-4" aria-hidden />
                    −1
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
        </div>
    )
}
